import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { OperationalIncident } from "../src/models/OperationalIncident.js";
import { OperationalAlertReceipt } from "../src/models/OperationalAlertReceipt.js";
import { acknowledgeIncident,compactIncidentAlerts,compactOperationalAlerts,alertEvent,dispatchOperationalAlerts,operationalAlertConfig,signOperationalAlert } from "../src/services/operationalAlerts.js";
const uri=process.env.MEDREACH_OPERATIONS_TEST_MONGO_URI;
const isolated=/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_operations_test$/.test(uri||"");
test("alert signature and configuration fail closed",()=>{
 const previous={url:process.env.OPERATIONS_WEBHOOK_URL,secret:process.env.OPERATIONS_WEBHOOK_SECRET};
 try{
  process.env.OPERATIONS_WEBHOOK_URL="http://unsafe.example";process.env.OPERATIONS_WEBHOOK_SECRET="a".repeat(32);
  assert.throws(operationalAlertConfig,/configuration invalid/);
  assert.equal(signOperationalAlert("{}","1","secret"),signOperationalAlert("{}","1","secret"));
  assert.notEqual(signOperationalAlert("{}","1","secret"),signOperationalAlert("{}","2","secret"));
 }finally{for(const [name,value]of Object.entries({OPERATIONS_WEBHOOK_URL:previous.url,OPERATIONS_WEBHOOK_SECRET:previous.secret}))if(value===undefined)delete process.env[name];else process.env[name]=value;}
});
test("durable operational alerts deduplicate, acknowledge, bound retries and recover expired leases",{skip:!isolated},async()=>{
 await mongoose.connect(uri);await mongoose.connection.dropDatabase();await OperationalIncident.init();
 const previous={url:process.env.OPERATIONS_WEBHOOK_URL,secret:process.env.OPERATIONS_WEBHOOK_SECRET};
 try{
  process.env.OPERATIONS_WEBHOOK_URL="https://controlled.example/alerts";process.env.OPERATIONS_WEBHOOK_SECRET="x".repeat(32);
  const now=new Date();const row=await OperationalIncident.create({key:"worker_notification",status:"open",severity:"critical",count:1,alertEvents:[alertEvent("open",now)]});
  let sent=0;let sentId;
  const fetchImpl=async(_url,options)=>{sent++;sentId=options.headers["Idempotency-Key"];assert.equal(options.redirect,"error");assert.ok(options.headers["X-MedReach-Signature"].startsWith("v1="));return {ok:true};};
  await Promise.all(Array.from({length:8},()=>dispatchOperationalAlerts({now,fetchImpl})));
  assert.equal(sent,1);assert.ok(sentId);
  const actorId=new mongoose.Types.ObjectId();assert.ok(await acknowledgeIncident({id:row._id,actorId,reason:"On call investigating",now}));
  assert.equal(await acknowledgeIncident({id:row._id,actorId,reason:"Repeated action",now}),null);
  await dispatchOperationalAlerts({now,fetchImpl});assert.equal(sent,2);
  const event=alertEvent("resolved",now);await OperationalIncident.updateOne({_id:row._id},{$push:{alertEvents:event}});
  for(let i=0;i<8;i++)await dispatchOperationalAlerts({now:new Date(now.getTime()+(i+1)*4000000),fetchImpl:async()=>{throw Error("private details");}});
  let stored=await OperationalIncident.findById(row._id);let failed=stored.alertEvents.find(e=>e.eventId===event.eventId);assert.equal(failed.attempts,5);assert.equal(failed.status,"exhausted");assert.equal(failed.errorCode,"ALERT_DELIVERY_FAILED");
  const crashed={...alertEvent("open",now),status:"running",attempts:1,leaseToken:"dead-worker",leaseUntil:new Date(now.getTime()-1)};
  const final={...alertEvent("open",now),status:"running",attempts:5,leaseToken:"dead-final",leaseUntil:new Date(now.getTime()-1)};
  await OperationalIncident.updateOne({_id:row._id},{$push:{alertEvents:{$each:[crashed,final]}}});
  await dispatchOperationalAlerts({now,fetchImpl});stored=await OperationalIncident.findById(row._id);
  assert.equal(stored.alertEvents.find(e=>e.eventId===crashed.eventId).status,"delivered");
  assert.equal(stored.alertEvents.find(e=>e.eventId===final.eventId).errorCode,"ALERT_DELIVERY_UNCERTAIN");
  const history=Array.from({length:100},(_,index)=>({...alertEvent(index%2?"resolved":"open",now),status:index===4?"exhausted":"delivered",attempts:1}));
  const full=await OperationalIncident.create({key:"history-cap",status:"open",severity:"warning",count:1,alertEvents:history});
  const originalUpdate=OperationalAlertReceipt.updateOne;
  OperationalAlertReceipt.updateOne=()=>{throw Error("Synthetic archive interruption");};
  try{
   assert.equal((await compactOperationalAlerts()).failed,1);
   assert.equal(await acknowledgeIncident({id:full._id,actorId,reason:"Cannot append beyond cap",now}).catch(()=>null),null);
   assert.equal((await OperationalIncident.findById(full._id)).alertEvents.length,100);
  }finally{OperationalAlertReceipt.updateOne=originalUpdate;}
  await Promise.all(Array.from({length:4},()=>compactIncidentAlerts(full._id)));
  assert.equal(await OperationalAlertReceipt.countDocuments({incident:full._id}),100);
  assert.equal((await OperationalIncident.findById(full._id)).alertSequenceBase,100);
  assert.equal((await OperationalAlertReceipt.findById(history[4].eventId)).status,"exhausted");
  await acknowledgeIncident({id:full._id,actorId,reason:"Archive restored and resumed",now});
  let resumedPayload;
  await dispatchOperationalAlerts({now,fetchImpl:async(_url,options)=>{const payload=JSON.parse(options.body);if(payload.incidentId===String(full._id))resumedPayload=payload;return {ok:true};}});
  assert.equal(resumedPayload.sequence,101);
  // A non-terminal prefix is never removed even if later events are delivered.
  const blocked=await OperationalIncident.create({key:"blocked-prefix",status:"open",severity:"warning",count:1,alertEvents:[alertEvent("open",now),...history.slice(1,80).map(event=>({...event,eventId:`${event.eventId}-other`}))]});
  assert.equal((await compactIncidentAlerts(blocked._id)).archived,0);
  assert.equal((await OperationalIncident.findById(blocked._id)).alertEvents.length,80);
 }finally{for(const [name,value]of Object.entries({OPERATIONS_WEBHOOK_URL:previous.url,OPERATIONS_WEBHOOK_SECRET:previous.secret}))if(value===undefined)delete process.env[name];else process.env[name]=value;await mongoose.connection.dropDatabase();await mongoose.disconnect();}
});
