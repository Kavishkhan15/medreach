import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createLatencyRecorder, metricRoute, histogramQuantile, installMongoTelemetry } from '../src/services/backendMetrics.js';

test('metric route names derive only from fixed namespaces and server route templates', () => {
 assert.equal(metricRoute({originalUrl:'/api/hospitals/PRIVATE-ID?token=secret',route:{path:'/:slug'}}),'/api/hospitals/:slug');
 assert.equal(metricRoute({originalUrl:'/private-email@example.test',route:null}),'<unmatched>');
 assert.equal(metricRoute({originalUrl:'/api/hospitals/id',route:{path:/secret/}}),'<unmatched>');
});
test('fixed nested mounts remain distinct after Express unwinds baseUrl',()=>{
 const paths=['/api/admin/backend-metrics','/api/admin/hospital-enrichment','/api/admin/backend','/api/admin/provider-accounts'];
 const labels=paths.map(path=>metricRoute({originalUrl:`${path}?token=PRIVATE_VALUE`,baseUrl:'',route:{path:'/'}}));
 assert.deepEqual(labels,paths);assert.equal(new Set(labels).size,4);
 assert.equal(metricRoute({originalUrl:'/api/admin/hospital-enrichment/PRIVATE_ID/review?email=PRIVATE_EMAIL',baseUrl:'',route:{path:'/:id/review'}}),'/api/admin/hospital-enrichment/:id/review');
 assert.equal(metricRoute({originalUrl:'/api/hospitals?q=PRIVATE_VALUE',baseUrl:'',route:{path:'/'}}),'/api/hospitals');
 assert.equal(metricRoute({originalUrl:'/api/admin/backend-metrics-FORGED',baseUrl:'',route:{path:'/:id'}}),'/api/admin/:id');
});
test('histogram percentiles are bounded estimates and keep missing observations unknown',()=>{
 assert.equal(histogramQuantile({},0,.95),null);
 assert.equal(histogramQuantile({b0:1,b3:9},10,.95),25);
 assert.equal(histogramQuantile({b14:1},1,.95),null);
});
test('bounded recorder emits replay-safe cumulative snapshots without sensitive values',async()=>{
 const operations=[];let now=Date.now();let fail=false;
 const Model={bulkWrite:async ops=>{operations.push(ops);if(fail)throw Error('simulated database interruption')}};
 const recorder=createLatencyRecorder({enabled:()=>true,capacity:2,Model,now:()=>now,intervalMs:0});
 recorder.record({kind:'request',metric:'http',route:'/api/hospitals/:slug',method:'GET',statusClass:'2xx',durationMs:12});
 await recorder.flush();fail=true;
 recorder.record({kind:'request',metric:'http',route:'/api/hospitals/:slug',method:'GET',statusClass:'2xx',durationMs:19});
 await recorder.flush();fail=false;await recorder.flush();
 assert.equal(operations[0][0].updateOne.update.$max.count,1);
 assert.equal(operations.at(-1)[0].updateOne.update.$max.count,2);
 assert.equal(operations[0][0].updateOne.filter._id,operations.at(-1)[0].updateOne.filter._id);
 assert.ok(!JSON.stringify(operations).includes('$inc'));
 recorder.record({kind:'request',metric:'http',route:'/api/auth/login',method:'POST',statusClass:'4xx',durationMs:1});
 recorder.record({kind:'request',metric:'http',route:'/api/jobs/:id',method:'GET',statusClass:'2xx',durationMs:1});
 assert.equal(recorder.status().droppedSamples,1);
 assert.ok(recorder.status().bufferedKeys<=3); // one reserved drop-health bucket
 await recorder.close();
});
test('disabled and failed telemetry cannot throw into request processing', async()=>{
 const disabled=createLatencyRecorder({enabled:()=>false,intervalMs:0,Model:{bulkWrite:()=>{throw Error('must not execute')}}});
 assert.equal(disabled.record({kind:'request',metric:'http',route:'/',durationMs:1}),false);assert.equal(await disabled.flush(),false);
 const failed=createLatencyRecorder({enabled:()=>true,intervalMs:0,Model:{bulkWrite:async()=>{throw Error('offline')}}});
 failed.record({kind:'database',metric:'find',durationMs:800});for(let i=0;i<5;i++)assert.equal(await failed.flush(),false);assert.equal(failed.status().failedFlushes,3);await failed.close();
});
test('outage buffers retire old minutes and regain capacity instead of permanently filling', async()=>{
 let now=Date.now(),offline=true;const operations=[];const recorder=createLatencyRecorder({enabled:()=>true,intervalMs:0,capacity:1,now:()=>now,Model:{bulkWrite:async ops=>{if(offline)throw Error('offline');operations.push(ops)}}});
 recorder.record({kind:'database',metric:'find',durationMs:1});for(let i=0;i<3;i++)await recorder.flush();assert.equal(recorder.status().failedFlushes,3);now+=180000;offline=false;
 assert.equal(recorder.record({kind:'database',metric:'aggregate',durationMs:2}),true);
 assert.equal(recorder.status().droppedSamples,1);assert.ok(recorder.status().bufferedKeys<=2);assert.equal(await recorder.flush(),true);assert.equal(recorder.status().pendingKeys,0);assert.ok(operations[0].some(op=>op.updateOne.update.$setOnInsert.metric==='evicted_unflushed'));await recorder.close();
});
test('driver hooks record checkout latency and redacted command timing without recursive telemetry writes',()=>{
 const client=new EventEmitter(),records=[];const recorder={record:r=>records.push(r)};
 const remove=installMongoTelemetry(client,{enabled:()=>true,recorder});
 client.emit('connectionCheckedOut',{durationMS:17,connectionId:'SECRET_HOST'});
 client.emit('connectionCheckOutFailed',{durationMS:5000,reason:'timeout',error:Error('PRIVATE CONNECTION')});
 client.emit('commandStarted',{requestId:1,commandName:'find',command:{find:'hospitals',filter:{patientName:'PRIVATE_PATIENT'}}});
 client.emit('commandSucceeded',{requestId:1,commandName:'find',duration:19,reply:{private:'PRIVATE_PATIENT'}});
 client.emit('commandStarted',{requestId:2,commandName:'update',command:{update:'backendlatencybuckets'}});
 client.emit('commandSucceeded',{requestId:2,commandName:'update',duration:100});
 assert.equal(records.length,3);assert.equal(records[0].durationMs,17);assert.equal(records[1].metric,'checkout_timeout');
 assert.doesNotMatch(JSON.stringify(records),/PRIVATE|SECRET_HOST|patientName/);remove();assert.equal(client.listenerCount('commandStarted'),0);
});
test('pool hooks suppress flush feedback rather than generating metrics forever while idle',()=>{
 const client=new EventEmitter(),records=[];const target={record:event=>records.push(event),isFlushing:()=>true};
 const remove=installMongoTelemetry(client,{enabled:()=>true,recorder:target});
 client.emit('connectionCheckedOut',{durationMS:1});client.emit('connectionCheckOutFailed',{durationMS:10,reason:'timeout'});
 assert.equal(records.length,0);remove();
});
