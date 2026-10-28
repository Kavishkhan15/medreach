import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { collectBackendStatus, refreshOperationalIncidents } from "../src/services/backendOperations.js";
import { WorkerHeartbeat } from "../src/models/WorkerHeartbeat.js";
import { ResourceInventory } from "../src/models/ResourceInventory.js";
import { OperationalIncident } from "../src/models/OperationalIncident.js";
const uri=process.env.MEDREACH_OPERATIONS_TEST_MONGO_URI;
const isolated=(()=>{try{const u=new URL(uri);return ["127.0.0.1","localhost","[::1]"].includes(u.hostname)&&u.pathname==="/medreach_operations_test";}catch{return false;}})();
test("operational health distinguishes missing workers, stale inventory and recovery",{skip:!isolated},async()=>{
 await mongoose.connect(uri);await mongoose.connection.dropDatabase();
 try{
  await OperationalIncident.init();
  const missing=await collectBackendStatus();
  assert.equal(missing.workers.notification.available,false);
  assert.equal(missing.degraded,true);
  await refreshOperationalIncidents();await refreshOperationalIncidents();
  assert.equal(await OperationalIncident.countDocuments({status:"open"}),3);
  for(const role of ["notification","expiry","recovery"])await WorkerHeartbeat.create({workerId:role,role,status:"idle",heartbeatAt:new Date()});
  assert.equal((await collectBackendStatus()).degraded,false);
  await refreshOperationalIncidents();assert.equal(await OperationalIncident.countDocuments({status:"open"}),0);
  await ResourceInventory.create({kind:"hospital",organization:new mongoose.Types.ObjectId(),resourceKey:"icu_beds",unit:"beds",capacity:15,occupied:0,blocked:0,held:0,available:15,observedAt:new Date(Date.now()-1800001),version:1,reportingMethod:"provider_report",classification:"provider_confirmed"});
  assert.equal((await collectBackendStatus()).inventory.stale,1);
  await refreshOperationalIncidents();assert.equal(await OperationalIncident.countDocuments({key:"inventory_stale",status:"open"}),1);
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();}
});
