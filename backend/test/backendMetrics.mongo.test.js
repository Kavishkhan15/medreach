import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { BackendLatencyBucket } from '../src/models/BackendLatencyBucket.js';
import { createLatencyRecorder, readBackendMetrics } from '../src/services/backendMetrics.js';
import router from '../src/routes/backendMetrics.js';
import { User } from '../src/models/User.js';
import { signSessionToken } from './helpers/session.js';
const uri=process.env.MEDREACH_METRICS_TEST_MONGO_URI;
const isolated=/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_metrics_test$/.test(uri||'');
test('shared latency snapshots aggregate replicas without double counting and remain private',{skip:!isolated,timeout:30000},async t=>{
 await mongoose.connect(uri);await mongoose.connection.dropDatabase();t.after(async()=>{await mongoose.connection.dropDatabase();await mongoose.disconnect()});await BackendLatencyBucket.init();
 const now=Date.now(),make=()=>createLatencyRecorder({enabled:()=>true,intervalMs:0,now:()=>now});const first=make(),second=make();
 await t.test('two replicas share the report; duplicate snapshot delivery never double counts',async()=>{
  const event={kind:'request',metric:'http',route:'/api/hospitals/:slug',method:'GET',statusClass:'2xx',durationMs:17};
  for(let i=0;i<10;i++)first.record(event);for(let i=0;i<5;i++)second.record({...event,durationMs:400});
  await Promise.all([first.flush(),second.flush()]);await first.flush();
  const before=await BackendLatencyBucket.find().lean();assert.equal(before.length,2);
  const original=BackendLatencyBucket.bulkWrite.bind(BackendLatencyBucket);
  const ambiguous=createLatencyRecorder({enabled:()=>true,intervalMs:0,now:()=>now,Model:{bulkWrite:async(...args)=>{await original(...args);throw Error('Lost acknowledgement')}}});
  ambiguous.record({...event,durationMs:900});await ambiguous.flush();await ambiguous.flush();await ambiguous.close();
  const report=await readBackendMetrics({minutes:15,now:new Date(now+1)}),entry=report.data.find(r=>r.kind==='request');
  assert.equal(entry.count,16);assert.equal(entry.p50UpperBoundMs,25);assert.equal(entry.p95UpperBoundMs,1000);assert.equal(entry.slowCount,6);
 });
 await t.test('expired observations are excluded before TTL cleanup',async()=>{
  await BackendLatencyBucket.collection.insertOne({_id:'expired-fixture',kind:'request',metric:'http',route:'<system>',method:'GET',statusClass:'2xx',minute:new Date(now),expiresAt:new Date(now-1),count:100,histogram:{b0:100}});
  assert.equal((await readBackendMetrics({now:new Date(now)})).data.reduce((sum,r)=>sum+r.count,0),16);
  await assert.rejects(readBackendMetrics({minutes:61}),e=>e.status===400);
 });
 await t.test('anonymous and ordinary users cannot inspect metrics',async()=>{
  const app=express();app.use('/metrics',router);app.use((err,req,res,next)=>res.status(err.status||500).json({error:'failure'}));
  assert.equal((await request(app).get('/metrics')).status,401);
  const users=await User.create([{name:'Metrics administrator',email:'admin@metrics.test',role:'system_admin'},{name:'Metrics ordinary user',email:'user@metrics.test',role:'user'}]);
  const ordinary=await signSessionToken(users[1]);assert.equal((await request(app).get('/metrics').set('Authorization',`Bearer ${ordinary}`)).status,403);
  const admin=await signSessionToken(users[0]);const response=await request(app).get('/metrics?minutes=15').set('Authorization',`Bearer ${admin}`);
  assert.equal(response.status,200);assert.equal(response.headers['cache-control'],'private, no-store');assert.equal(response.body.data[0].count,16);
  assert.equal((await request(app).get('/metrics?minutes=0').set('Authorization',`Bearer ${admin}`)).status,400);
 });
 await first.close();await second.close();
});
