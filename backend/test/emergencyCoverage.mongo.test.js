import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {EmergencyCoverage} from "../src/models/EmergencyCoverage.js";
import {User} from "../src/models/User.js";
import {updateEmergencyCoverage,filterEmergencyCoverage,emergencyCoverageStatus,validateCoverage,scheduledUserIds} from "../src/services/emergencyCoverage.js";
import {collectBackendStatus} from "../src/services/backendOperations.js";
const uri=process.env.MEDREACH_COVERAGE_TEST_MONGO_URI;
const isolated=/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_coverage_test$/.test(uri||"");
test("coverage requires UTC bounded windows and uses half-open boundaries",()=>{
 const id=String(new mongoose.Types.ObjectId()),now=new Date("2026-10-26T12:00:00Z");
 const input={enabled:true,expectedVersion:0,reason:"Reviewed shift",windows:[{start:"2026-10-26T11:00:00Z",end:"2026-10-26T12:00:00Z",users:[id]}]};
 assert.equal(validateCoverage(input,now).length,1);assert.equal(scheduledUserIds(input,now).size,0);
 assert.throws(()=>validateCoverage({...input,windows:[{...input.windows[0],start:"2026-10-26T11:00:00+00:00"}]},now),/UTC_REQUIRED/);
 assert.throws(()=>validateCoverage({...input,windows:[{...input.windows[0],end:"2027-01-01T12:00:00Z"}]},now),/WINDOW_INVALID/);
 assert.equal(scheduledUserIds({enabled:false},now),null);
});
test("named operator coverage has CAS, eligibility, durable audit and missing-coverage incident",{skip:!isolated},async()=>{
 await mongoose.connect(uri);await mongoose.connection.dropDatabase();await EmergencyCoverage.init();
 try{
  const admin=await User.create({name:"Coverage owner",email:"owner@coverage.test",role:"system_admin",accountStatus:"active",notificationsEnabled:true,notificationEmail:"notify@coverage.test",notificationEmailVerifiedAt:new Date()});
  const actor={id:String(admin._id)};const candidates=[{user:admin._id},{user:new mongoose.Types.ObjectId()}];
  assert.equal((await filterEmergencyCoverage(candidates)).length,2);
  const now=new Date(),start=new Date(now-1000).toISOString(),end=new Date(now.getTime()+3600000).toISOString();
  const input={enabled:true,expectedVersion:0,reason:"Approved coverage roster",windows:[{start,end,users:[String(admin._id)]}]};
  const results=await Promise.allSettled([updateEmergencyCoverage({actor,input}),updateEmergencyCoverage({actor,input})]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.find(r=>r.status==="rejected").reason.status,409);
  assert.equal((await filterEmergencyCoverage(candidates)).length,1);assert.equal((await emergencyCoverageStatus()).covered,true);
  assert.equal((await EmergencyCoverage.findOne({})).audit.length,1);
  const ineligible={...input,expectedVersion:1,windows:[{start,end,users:[String(candidates[1].user)]}]};
  await assert.rejects(()=>updateEmergencyCoverage({actor,input:ineligible}),/RECIPIENT_INELIGIBLE/);
  await assert.rejects(()=>updateEmergencyCoverage({actor:{id:String(candidates[1].user)},input}),/ADMIN_REQUIRED/);
  await User.updateOne({_id:admin._id},{$set:{notificationsEnabled:false}});
  assert.equal((await emergencyCoverageStatus()).covered,false);
  assert.equal((await collectBackendStatus()).warnings.emergency_coverage_missing,1);
  await User.updateOne({_id:admin._id},{$set:{notificationsEnabled:true}});
  await updateEmergencyCoverage({actor,input:{...input,expectedVersion:1,enabled:false}});
  assert.equal((await filterEmergencyCoverage(candidates)).length,2);
  assert.equal((await emergencyCoverageStatus()).covered,null);
  await EmergencyCoverage.updateOne({},{$set:{audit:Array.from({length:1000},()=>({at:now,version:2,actor:admin._id,policyHash:"fixture",reason:"Synthetic cap test"}))}});
  await assert.rejects(()=>updateEmergencyCoverage({actor,input:{...input,expectedVersion:2,enabled:false}}),/AUDIT_ARCHIVE_REQUIRED/);
  assert.equal((await EmergencyCoverage.findOne({})).version,2);
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();}
});
