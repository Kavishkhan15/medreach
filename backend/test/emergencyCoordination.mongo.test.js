import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { EmergencyCoordination } from "../src/models/EmergencyCoordination.js";
import { reconcileEmergencyCoordination, acknowledgeEmergency, isCoordinationDeliveryEligible } from "../src/services/emergencyCoordination.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { BloodRequest } from "../src/models/BloodRequest.js";
import { AmbulanceBooking } from "../src/models/AmbulanceBooking.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { env } from "../src/config/env.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";

const uri = process.env.MEDREACH_COORDINATION_TEST_MONGO_URI;
const isolated = (()=>{try{const u=new URL(uri);return ["localhost","127.0.0.1","[::1]"].includes(u.hostname)&&u.pathname==="/medreach_coordination_test";}catch{return false;}})();
test("emergency acknowledgement and escalation are scoped, durable and idempotent", {skip:!isolated}, async t=>{
 await mongoose.connect(uri); await mongoose.connection.dropDatabase();
 const priorEmailEnabled=env.emailEnabled; env.emailEnabled=false;
 try {
  await EmergencyCoordination.init(); await EmailDelivery.init();
  const admin=await User.create({name:"System fixture",email:"system@coord.test",role:"system_admin",notificationEmail:"medreachforyou@gmail.com",notificationsEnabled:true,notificationEmailVerifiedAt:new Date()});
  const provider=await User.create({name:"Provider fixture",email:"provider@coord.test",role:"provider_admin",notificationEmail:"medreachforyou@gmail.com",notificationsEnabled:true,notificationEmailVerifiedAt:new Date()});
  const outsider=await User.create({name:"Other provider",email:"other@coord.test",role:"provider_admin"});
  const hospital=await Hospital.create({name:"Synthetic coordination hospital",approvalStatus:"approved"});
  await ProviderMembership.create({user:provider._id,organization:hospital._id,kind:"hospital",assignedBy:admin._id});
  const create=extra=>EmergencyRequest.create({coordinationVersion:1,requestId:`MR-TEST-${new mongoose.Types.ObjectId()}`,hospital:hospital._id,emergencyType:"Emergency",requiredFacility:"ICU",contactPhone:"0000000000",expiresAt:new Date(Date.now()+3600000),...extra});
  const emergency=await create({isEmergency:true}), normal=await create({isEmergency:false});
  await t.test("ordinary requests never create emergency coordination",async()=>{
   await reconcileEmergencyCoordination();
   assert.equal(await EmergencyCoordination.countDocuments({source:normal._id}),0);
   assert.equal(await EmergencyCoordination.countDocuments({source:emergency._id}),1);
  });
  let row=await EmergencyCoordination.findOne({source:emergency._id});
  await t.test("only eligible current membership or System Admin may acknowledge",async()=>{
   await assert.rejects(()=>acknowledgeEmergency({sourceType:"bed",sourceId:emergency._id,actor:{id:outsider._id},expectedVersion:row.version}),e=>e.status===403);
   assert.equal(await isCoordinationDeliveryEligible(row._id,provider.notificationEmail,provider._id),true);
  });
  await t.test("concurrent workers produce one escalation per deadline and deduplicate recipients",async()=>{
   const future=new Date(Date.now()+360001);
   await Promise.all([reconcileEmergencyCoordination({now:future}),reconcileEmergencyCoordination({now:future})]);
   row=await EmergencyCoordination.findById(row._id);
   assert.equal(row.escalationCount,1);
   assert.equal(await EmailDelivery.countDocuments({sourceModel:"EmergencyCoordination"}),1);
  });
  await t.test("acknowledgement CAS rejects stale updates and prevents further escalation",async()=>{
   await assert.rejects(()=>acknowledgeEmergency({sourceType:"bed",sourceId:emergency._id,actor:{id:provider._id},expectedVersion:0}),e=>e.status===409);
   const updated=await acknowledgeEmergency({sourceType:"bed",sourceId:emergency._id,actor:{id:provider._id},expectedVersion:row.version});
   assert.equal(updated.status,"acknowledged");
   assert.equal(await isCoordinationDeliveryEligible(row._id,provider.notificationEmail,provider._id),false);
   await reconcileEmergencyCoordination({now:new Date(Date.now()+720000)});
   assert.equal((await EmergencyCoordination.findById(row._id)).escalationCount,1);
  });
  await t.test("all request kinds require new-version emergency flags, and blood donations never escalate",async()=>{
   const bloodOrg=await ResourceProvider.create({kind:"blood_bank",name:"Synthetic blood bank",sourceName:"fixture",approvalStatus:"approved"});
   const ambulanceOrg=await ResourceProvider.create({kind:"ambulance",name:"Synthetic ambulance",sourceName:"fixture",approvalStatus:"approved"});
   const blood=extra=>BloodRequest.create({coordinationVersion:1,reference:`B-${new mongoose.Types.ObjectId()}`,provider:bloodOrg._id,type:"REQUEST",bloodBankName:"Fixture",bloodGroup:"O+",patientOrDonorName:"Fixture",contactPhone:"0000000000",...extra});
   const ambulance=extra=>AmbulanceBooking.create({coordinationVersion:1,reference:`A-${new mongoose.Types.ObjectId()}`,provider:ambulanceOrg._id,trackingTokenHash:"fixture",providerSnapshot:{name:"Fixture"},requestSnapshot:{patientName:"Fixture",patientAge:30,pickupAddress:"Fixture"},delivery:{user:{status:"pending"},admin:{status:"pending"},provider:{status:"pending"}},...extra});
   const urgentBlood=await blood({isUrgent:true}), normalBlood=await blood({isUrgent:false}), donation=await blood({type:"DONATION",isUrgent:true}), legacyBlood=await blood({coordinationVersion:undefined,isUrgent:true});
   const emergencyAmbulance=await ambulance({isEmergency:true}), normalAmbulance=await ambulance({isEmergency:false}), legacyAmbulance=await ambulance({coordinationVersion:undefined,isEmergency:true});
   const legacyBed=await create({coordinationVersion:undefined,isEmergency:true});
   await reconcileEmergencyCoordination();
   for(const request of [normalBlood,donation,legacyBlood,normalAmbulance,legacyAmbulance,legacyBed]) assert.equal(await EmergencyCoordination.countDocuments({source:request._id}),0);
   assert.equal(await EmergencyCoordination.countDocuments({source:urgentBlood._id}),1);
   assert.equal(await EmergencyCoordination.countDocuments({source:emergencyAmbulance._id}),1);
  });
  await t.test("three escalation deadlines exhaust the bounded budget and terminal source status resolves it",async()=>{
   const request=await create({isEmergency:true});
   await reconcileEmergencyCoordination();
   for(let step=0;step<5;step++) {
    const record=await EmergencyCoordination.findOne({source:request._id});
    await EmergencyCoordination.updateOne({_id:record._id},{$set:{nextEscalationAt:new Date(Date.now()-1)}});
    await reconcileEmergencyCoordination();
   }
   let record=await EmergencyCoordination.findOne({source:request._id}).select("+events");
   assert.equal(record.escalationCount,3); assert.equal(record.status,"exhausted"); assert.equal(record.manualAttention,true);
   assert.equal(record.events.filter(event=>event.kind==="escalated").length,3);
   assert.equal(record.toJSON().events,undefined);
   await EmergencyRequest.updateOne({_id:request._id},{$set:{status:"CANCELLED"}});
   await reconcileEmergencyCoordination();
   record=await EmergencyCoordination.findById(record._id);
   assert.equal(record.status,"resolved"); assert.equal(record.manualAttention,false);
   assert.equal(await isCoordinationDeliveryEligible(record._id,admin.notificationEmail,admin._id),false);
  });
  await t.test("current account, membership, organisation approval and contact remain required",async()=>{
   const request=await create({isEmergency:true}); await reconcileEmergencyCoordination();
   const record=await EmergencyCoordination.findOne({source:request._id});
   await User.updateOne({_id:provider._id},{$set:{notificationsEnabled:false}});
   assert.equal(await isCoordinationDeliveryEligible(record._id,provider.notificationEmail,provider._id),false);
   await User.updateOne({_id:provider._id},{$set:{notificationsEnabled:true}});
   await ProviderMembership.updateOne({user:provider._id,organization:hospital._id},{$set:{active:false}});
   assert.equal(await isCoordinationDeliveryEligible(record._id,provider.notificationEmail,provider._id),false);
   await assert.rejects(()=>acknowledgeEmergency({sourceType:"bed",sourceId:request._id,actor:{id:provider._id},expectedVersion:record.version}),e=>e.status===403);
   await ProviderMembership.updateOne({user:provider._id,organization:hospital._id},{$set:{active:true}});
   await Hospital.updateOne({_id:hospital._id},{$set:{approvalStatus:"rejected"}});
   assert.equal(await isCoordinationDeliveryEligible(record._id,provider.notificationEmail,provider._id),false);
   await Hospital.updateOne({_id:hospital._id},{$set:{approvalStatus:"approved"}});
   await User.updateOne({_id:provider._id},{$set:{accountStatus:"suspended"}});
   assert.equal(await isCoordinationDeliveryEligible(record._id,provider.notificationEmail,provider._id),false);
  });
  await t.test("coordination journal failures stop after five leased attempts and remain visible for review",async()=>{
   const request=await create({isEmergency:true});
   const auditUpdate=AuditLog.updateOne;
   let auditAttempts=0;
   AuditLog.updateOne=()=>{auditAttempts++;throw new Error("synthetic coordination audit outage");};
   let record;
   try {
    await assert.rejects(()=>reconcileEmergencyCoordination());
    record=await EmergencyCoordination.findOne({source:request._id}).select("+events");
    for(let attempt=1;attempt<5;attempt++) {
     await EmergencyCoordination.updateOne({_id:record._id,"events.key":record.events[0].key},{$set:{"events.$.retryAt":new Date(Date.now()-1)}});
     await assert.rejects(()=>reconcileEmergencyCoordination());
    }
    const before=auditAttempts;
    await reconcileEmergencyCoordination();
    assert.equal(auditAttempts,before);
   } finally {AuditLog.updateOne=auditUpdate;}
   record=await EmergencyCoordination.findById(record._id).select("+events");
   assert.equal(record.events[0].attempts,5);assert.ok(record.events[0].exhaustedAt instanceof Date);
   assert.equal(record.manualAttention,true);assert.equal(record.attentionReason,"delivery_preparation_failed");
  });
 } finally {env.emailEnabled=priorEmailEnabled;await mongoose.connection.dropDatabase();await mongoose.disconnect();}
});
