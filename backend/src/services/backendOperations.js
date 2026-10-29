import mongoose from "mongoose";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { emergencyCoverageStatus } from "./emergencyCoverage.js";
import { alertEvent,alertCapacityFilter,compactOperationalAlerts } from "./operationalAlerts.js";
import { WorkerHeartbeat } from "../models/WorkerHeartbeat.js";
import { BackgroundJob } from "../models/BackgroundJob.js";
import { ResourceInventory } from "../models/ResourceInventory.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { EmergencyCoordination } from "../models/EmergencyCoordination.js";
import { OperationalAlertReceipt } from "../models/OperationalAlertReceipt.js";
import { InventoryImport } from "../models/InventoryImport.js";
import { OperationalIncident } from "../models/OperationalIncident.js";
import { EmailWebhookEvent } from "../models/EmailWebhookEvent.js";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { BloodRequest } from "../models/BloodRequest.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";
import { DiagnosticRequest } from "../models/DiagnosticRequest.js";

export async function databaseReady({timeoutMs=1500}={}) {
 if(mongoose.connection.readyState!==1||!mongoose.connection.db)return false;
 let deadline;
 try{return await Promise.race([
  mongoose.connection.db.command({ping:1},{timeoutMS:timeoutMs}).then(()=>true,()=>false),
  new Promise(resolve=>{deadline=setTimeout(()=>resolve(false),timeoutMs);deadline.unref?.();}),
 ]);}finally{clearTimeout(deadline);}
}
export async function collectBackendStatus({now=new Date()}={}) {
 if(!await databaseReady())throw Object.assign(new Error("Backend dependencies unavailable"),{status:503});
 const [heartbeats,jobs,notifications,stale,unknown,coordination,inventoryRecovery,webhookRecovery,statusRecovery]=await Promise.all([
  WorkerHeartbeat.find({heartbeatAt:{$gte:new Date(now.getTime()-45000)},status:{$nin:["stopped","stopping"]}}).select("role status heartbeatAt lastSuccessAt lastFailureAt errorCode").lean(),
  BackgroundJob.aggregate([{$group:{_id:"$status",count:{$sum:1}}}]),
  EmailDelivery.aggregate([{$group:{_id:{lifecycle:{$ifNull:["$lifecycleStatus","legacy_unknown"]},exhausted:{$cond:[{$ifNull:["$exhaustedAt",false]},true,false]}},count:{$sum:1}}}]),
  ResourceInventory.countDocuments({classification:"provider_confirmed",observedAt:{$lte:new Date(now.getTime()-1800000),$ne:null}}),
  ResourceInventory.countDocuments({$or:[{classification:"unknown"},{observedAt:null}]}),
  EmergencyCoordination.countDocuments({$or:[{status:"exhausted"},{manualAttention:true}]}),
  ResourceInventory.countDocuments({"pendingEvents.exhaustedAt":{$type:"date"}}),
  EmailWebhookEvent.countDocuments({status:"exhausted"}),
  Promise.all([EmergencyRequest,BloodRequest,AmbulanceBooking,DiagnosticRequest].map(Model=>Model.countDocuments({"statusEffects.exhausted":true}))).then(values=>values.reduce((sum,value)=>sum+value,0)),
 ]);
 const [oldestJob,alertFailures,archiveRecovery,coverage,alertBacklog,importRecovery]=await Promise.all([
  BackgroundJob.findOne({status:"queued"}).sort({createdAt:1}).select("createdAt").lean(),
  Promise.all([OperationalIncident.countDocuments({"alertEvents.status":"exhausted"}),OperationalAlertReceipt.countDocuments({status:"exhausted"})]).then(values=>values.reduce((sum,value)=>sum+value,0)),
  Promise.all([Hospital,ResourceProvider].map(Model=>Model.countDocuments({archivePending:true,archiveExhaustedAt:{$type:"date"}}))).then(values=>values.reduce((sum,value)=>sum+value,0)),
  emergencyCoverageStatus({now}),
  OperationalIncident.countDocuments({alertBacklog:true}),
  InventoryImport.countDocuments({status:"exhausted"}),
 ]);
 const queueAgeSeconds=oldestJob?.createdAt?Math.max(0,Math.floor((now-oldestJob.createdAt)/1000)):0;
 const workers=Object.fromEntries(["notification","expiry","recovery"].map(role=>{
  const rows=heartbeats.filter(row=>row.role===role);
  return [role,{available:rows.length>0,healthy:rows.some(row=>row.status!=="degraded"),instances:rows.length}];
 }));
 const jobCounts=Object.fromEntries(jobs.map(row=>[row._id,row.count]));
 const notificationCounts={};let exhausted=0;
 for(const row of notifications){notificationCounts[row._id.lifecycle]=(notificationCounts[row._id.lifecycle]||0)+row.count;if(row._id.exhausted)exhausted+=row.count;}
 const warnings={};
 for(const [role,value] of Object.entries(workers))if(!value.available||!value.healthy)warnings[`worker_${role}`]=1;
 if(jobCounts.exhausted)warnings.jobs_exhausted=jobCounts.exhausted;
 if(queueAgeSeconds>300)warnings.jobs_queue_delayed=queueAgeSeconds;
 if(archiveRecovery)warnings.provider_archive_recovery_exhausted=archiveRecovery;
 if(coverage.enabled&&!coverage.covered)warnings.emergency_coverage_missing=1;
 if(importRecovery)warnings.inventory_import_exhausted=importRecovery;
 if(stale)warnings.inventory_stale=stale;
 if(notificationCounts.failed)warnings.notifications_failed=notificationCounts.failed;
 if(notificationCounts.bounced)warnings.notifications_bounced=notificationCounts.bounced;
 if(notificationCounts.uncertain)warnings.notifications_uncertain=notificationCounts.uncertain;
 if(exhausted)warnings.notifications_exhausted=exhausted;
 if(coordination)warnings.emergencies_unacknowledged=coordination;
 if(inventoryRecovery)warnings.inventory_recovery_exhausted=inventoryRecovery;
 if(webhookRecovery)warnings.webhook_recovery_exhausted=webhookRecovery;
 if(statusRecovery)warnings.request_recovery_exhausted=statusRecovery;
 return {ok:true,coverage,alerts:{exhaustedIncidents:alertFailures,exhaustedEvents:alertFailures,journalBacklogIncidents:alertBacklog},providers:{archiveRecoveryExhausted:archiveRecovery},queueAgeSeconds,degraded:Object.keys(warnings).length>0,workers,jobs:jobCounts,notifications:{...notificationCounts,exhausted,webhookRecoveryExhausted:webhookRecovery},inventory:{stale,unknown,recoveryExhausted:inventoryRecovery},requests:{recoveryExhausted:statusRecovery},emergencies:{manualAttention:coordination},warnings,checkedAt:now};
}
export async function refreshOperationalIncidents({now=new Date()}={}) {
 await compactOperationalAlerts({limit:100});
 const status=await collectBackendStatus({now});
 for(const [key,count] of Object.entries(status.warnings)) {
  const severity=key.startsWith("worker_")||key==="emergencies_unacknowledged"?"critical":"warning";
  // The lifecycle transition and delivery intent commit in the same document.
  // Acknowledgement survives subsequent health sweeps until resolution.
  try {
   await OperationalIncident.findOneAndUpdate({key,status:"resolved",...alertCapacityFilter},{$set:{status:"open",count,lastSeenAt:now,severity},$setOnInsert:{firstSeenAt:now},$unset:{resolvedAt:1,acknowledgedAt:1,acknowledgedBy:1,acknowledgementReason:1},$push:{alertEvents:alertEvent("open",now)}},{upsert:true,new:true});
  } catch(error){if(error.code!==11000)throw error;}
  await OperationalIncident.updateOne({key,status:"resolved","alertEvents.99":{$exists:true}},{$set:{alertBacklog:true,lastObservedStatus:"open",lastSeenAt:now,count}});
  await OperationalIncident.updateOne({key,status:{$in:["open","acknowledged"]}},{$set:{count,lastSeenAt:now,severity}});
 }
 const resolved=await OperationalIncident.find({status:{$in:["open","acknowledged"]},key:{$nin:Object.keys(status.warnings)}}).select("_id").lean();
 for(const row of resolved){
  const result=await OperationalIncident.updateOne({_id:row._id,status:{$in:["open","acknowledged"]},...alertCapacityFilter},{$set:{status:"resolved",count:0,resolvedAt:now,alertBacklog:false,lastObservedStatus:"resolved"},$push:{alertEvents:alertEvent("resolved",now)}});
  if(!result.modifiedCount)await OperationalIncident.updateOne({_id:row._id,"alertEvents.99":{$exists:true}},{$set:{alertBacklog:true,lastObservedStatus:"resolved"}});
 }
 return {open:Object.keys(status.warnings).length};
}
