import { createHmac,randomUUID } from "node:crypto";
import { OperationalAlertReceipt } from "../models/OperationalAlertReceipt.js";
import { OperationalIncident } from "../models/OperationalIncident.js";

export const MAX_INCIDENT_ALERT_EVENTS=100;
export const alertCapacityFilter={"alertEvents.99":{$exists:false}};
export async function compactIncidentAlerts(id){
 const row=await OperationalIncident.findById(id).lean();if(!row||row.alertEvents.length<80)return {archived:0};
 const prefix=[];for(const event of row.alertEvents){if(!["delivered","exhausted"].includes(event.status))break;prefix.push(event);}
 if(!prefix.length)return {archived:0};
 const base=row.alertSequenceBase||0;
 // Copy every byte of evidence before removing the prefix. A crash before the
 // CAS leaves duplicate evidence; unique event IDs make the retry harmless.
 for(let index=0;index<prefix.length;index++){
  const event=prefix[index];
  await OperationalAlertReceipt.updateOne({_id:event.eventId},{$setOnInsert:{incident:row._id,sequence:base+index+1,key:row.key,transition:event.transition,createdAt:event.createdAt,archivedAt:new Date(),status:event.status,attempts:event.attempts,deliveredAt:event.deliveredAt,errorCode:event.errorCode,payload:event.payload,actor:event.actor,reason:event.reason}},{upsert:true});
 }
 const result=await OperationalIncident.updateOne({_id:row._id,"alertEvents.0.eventId":prefix[0].eventId,...(base?{alertSequenceBase:base}:{$or:[{alertSequenceBase:0},{alertSequenceBase:{$exists:false}}]})},{$pull:{alertEvents:{eventId:{$in:prefix.map(event=>event.eventId)}}},$inc:{alertSequenceBase:prefix.length},$set:{alertBacklog:false}});
 return {archived:result.modifiedCount?prefix.length:0};
}
export async function compactOperationalAlerts({limit=20}={}){
 const rows=await OperationalIncident.find({"alertEvents.79":{$exists:true}}).select("_id").limit(Math.min(100,limit)).lean();let archived=0,failed=0;
 for(const row of rows)try{archived+=(await compactIncidentAlerts(row._id)).archived;}catch{failed++;await OperationalIncident.updateOne({_id:row._id},{$set:{alertBacklog:true}});}
 return {archived,failed};
}
export const alertEvent=(transition,now=new Date())=>({eventId:randomUUID(),transition,createdAt:now,status:"queued",attempts:0,retryAt:now});
// The URL is trusted deployment configuration, never a request parameter. Redirects
// are refused to keep the signing secret at the configured receiver.
export function operationalAlertConfig() {
 const target=process.env.OPERATIONS_WEBHOOK_URL,secret=process.env.OPERATIONS_WEBHOOK_SECRET;
 if(!target&&!secret)return null;
 if(!target||!secret||secret.length<32)throw Object.assign(new Error("Operational alert configuration invalid"),{code:"ALERT_CONFIG_INVALID"});
 let url;try{url=new URL(target);}catch{throw Object.assign(new Error("Operational alert configuration invalid"),{code:"ALERT_CONFIG_INVALID"});}
 if(url.protocol!=="https:"||url.username||url.password||url.hash)throw Object.assign(new Error("Operational alert configuration invalid"),{code:"ALERT_CONFIG_INVALID"});
 return {url:url.href,secret};
}
export function signOperationalAlert(payload,timestamp,secret){return `v1=${createHmac("sha256",secret).update(`${timestamp}.${payload}`).digest("hex")}`;}
export async function acknowledgeIncident({id,actorId,reason,now=new Date()}) {
 await compactIncidentAlerts(id);
 const result=await OperationalIncident.findOneAndUpdate({_id:id,status:"open",...alertCapacityFilter},{$set:{status:"acknowledged",acknowledgedAt:now,acknowledgedBy:actorId,acknowledgementReason:reason},$push:{alertEvents:{...alertEvent("acknowledged",now),actor:actorId,reason}}},{new:true});
 if(!result)await OperationalIncident.updateOne({_id:id,status:"open","alertEvents.99":{$exists:true}},{$set:{alertBacklog:true,lastObservedStatus:"acknowledged"}});
 return result;
}
export async function dispatchOperationalAlerts({now=new Date(),limit=20,fetchImpl=fetch,assertLease=async()=>{}}={}) {
 await compactOperationalAlerts();
 const config=operationalAlertConfig();if(!config)return {configured:false,delivered:0,failed:0};
 const result={configured:true,delivered:0,failed:0};const started=Date.now();
 const eligible={status:{$in:["queued","running"]},attempts:{$lt:5},retryAt:{$lte:now},$or:[{leaseUntil:{$exists:false}},{leaseUntil:{$lte:now}}]};
 for(let index=0;index<Math.min(100,Math.max(1,limit));index++) {
  if(Date.now()-started>15000)break;
  await assertLease();
  const token=randomUUID();
  const row=await OperationalIncident.findOneAndUpdate({alertEvents:{$elemMatch:eligible}},{$set:{"alertEvents.$.status":"running","alertEvents.$.leaseToken":token,"alertEvents.$.leaseUntil":new Date(now.getTime()+30000)},$inc:{"alertEvents.$.attempts":1}},{new:true});
  if(!row)break;
  const event=row.alertEvents.find(value=>value.leaseToken===token);
  const snapshot=event.payload||{eventId:event.eventId,sequence:(row.alertSequenceBase||0)+row.alertEvents.findIndex(item=>item.eventId===event.eventId)+1,incidentId:String(row._id),key:row.key,severity:row.severity,count:row.count,transition:event.transition,occurredAt:event.createdAt.toISOString()};
  const persisted=await OperationalIncident.updateOne({_id:row._id,alertEvents:{$elemMatch:{eventId:event.eventId,leaseToken:token}}},{$set:{"alertEvents.$.payload":snapshot}});if(!persisted.matchedCount)continue;
  const payload=JSON.stringify(snapshot);
  const timestamp=String(Math.floor(Date.now()/1000));let delivered=false;
  try {const response=await fetchImpl(config.url,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json","Idempotency-Key":event.eventId,"X-MedReach-Timestamp":timestamp,"X-MedReach-Signature":signOperationalAlert(payload,timestamp,config.secret)},body:payload,signal:AbortSignal.timeout(10000)});delivered=response.ok;await response.body?.cancel?.();}catch{/* Persist only a safe error code. */}
  const exhausted=!delivered&&event.attempts>=5;
  await OperationalIncident.updateOne({_id:row._id,alertEvents:{$elemMatch:{eventId:event.eventId,leaseToken:token}}},{$set:{"alertEvents.$.status":delivered?"delivered":exhausted?"exhausted":"queued",...(delivered?{"alertEvents.$.deliveredAt":new Date()}:{"alertEvents.$.errorCode":"ALERT_DELIVERY_FAILED","alertEvents.$.retryAt":new Date(now.getTime()+Math.min(3600000,30000*2**event.attempts))})},$unset:{"alertEvents.$.leaseToken":1,"alertEvents.$.leaseUntil":1}});
  result[delivered?"delivered":"failed"]++;
 }
 // A crash during the last attempt is uncertain and must remain visible.
 await OperationalIncident.updateMany({alertEvents:{$elemMatch:{status:"running",attempts:{$gte:5},leaseUntil:{$lte:now}}}},{$set:{"alertEvents.$[event].status":"exhausted","alertEvents.$[event].errorCode":"ALERT_DELIVERY_UNCERTAIN"},$unset:{"alertEvents.$[event].leaseToken":1,"alertEvents.$[event].leaseUntil":1}},{arrayFilters:[{"event.status":"running","event.attempts":{$gte:5},"event.leaseUntil":{$lte:now}}]});
 return result;
}
