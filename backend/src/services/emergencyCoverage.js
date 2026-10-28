import mongoose from "mongoose";
import {createHash} from "node:crypto";
import {EmergencyCoverage} from "../models/EmergencyCoverage.js";
import {User} from "../models/User.js";
import {ProviderMembership} from "../models/ProviderMembership.js";
import {organizationIsAvailable} from "./providerLifecycle.js";
const error=(status,code)=>Object.assign(Error(code),{status,code});
export function validateCoverage({enabled,windows,expectedVersion,reason},now=new Date()){
 if(typeof enabled!=="boolean"||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||typeof reason!=="string"||reason.trim().length<5||reason.length>200||!Array.isArray(windows)||windows.length>100)throw error(400,"COVERAGE_INPUT_INVALID");
 return windows.map(window=>{
  if(typeof window.start!=="string"||typeof window.end!=="string"||!window.start.endsWith("Z")||!window.end.endsWith("Z"))throw error(400,"COVERAGE_UTC_REQUIRED");
  const start=new Date(window.start),end=new Date(window.end);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>31*86400000||start>new Date(now.getTime()+90*86400000)||!Array.isArray(window.users)||!window.users.length||window.users.length>20||window.users.some(id=>!mongoose.isValidObjectId(id))||new Set(window.users.map(String)).size!==window.users.length)throw error(400,"COVERAGE_WINDOW_INVALID");
  return {start,end,users:window.users};
 });
}
export function scheduledUserIds(policy,now=new Date()){
 if(!policy?.enabled)return null;
 return new Set(policy.windows.filter(window=>new Date(window.start)<=now&&new Date(window.end)>now).flatMap(window=>window.users.map(String)));
}
async function eligibleUserIds(ids){
 const users=await User.find({_id:{$in:ids},accountStatus:"active",notificationsEnabled:true,notificationEmailVerifiedAt:{$type:"date"},notificationEmail:{$type:"string",$ne:""},role:{$in:["system_admin","provider_admin"]}}).select("role").lean();
 const result=[];
 for(const user of users){
  if(user.role==="system_admin"){result.push(String(user._id));continue;}
  const memberships=await ProviderMembership.find({user:user._id,active:true,$or:[{accessLevel:"admin"},{accessLevel:{$exists:false}}]}).select("kind organization").limit(100).lean();
  for(const membership of memberships)if(await organizationIsAvailable(membership.kind,membership.organization)){result.push(String(user._id));break;}
 }
 return result;
}
export async function readEmergencyCoverage(){return EmergencyCoverage.findOne({key:"platform"}).select("-audit").lean();}
export async function updateEmergencyCoverage({actor,input,now=new Date()}){
 if(!actor?.id||!await User.exists({_id:actor.id,role:"system_admin",accountStatus:"active"}))throw error(403,"COVERAGE_ADMIN_REQUIRED");
 const windows=validateCoverage(input,now);const ids=[...new Set(windows.flatMap(window=>window.users.map(String)))];
 if((await eligibleUserIds(ids)).length!==ids.length)throw error(400,"COVERAGE_RECIPIENT_INELIGIBLE");
 const version=input.expectedVersion+1;const policy={enabled:input.enabled,windows};
 const hash=createHash("sha256").update(JSON.stringify(policy)).digest("hex");
 let row;
 try{row=await EmergencyCoverage.findOneAndUpdate({key:"platform",version:input.expectedVersion,"audit.999":{$exists:false}},{$set:{...policy,version,updatedBy:actor.id,reason:input.reason.trim()},$push:{audit:{at:now,actor:actor.id,version,policyHash:hash,reason:input.reason.trim()}}},{upsert:input.expectedVersion===0,new:true});}
 catch(cause){if(cause.code===11000)throw error(409,"COVERAGE_VERSION_CONFLICT");throw cause;}
 if(!row){if(await EmergencyCoverage.exists({key:"platform","audit.999":{$exists:true}}))throw error(503,"COVERAGE_AUDIT_ARCHIVE_REQUIRED");throw error(409,"COVERAGE_VERSION_CONFLICT");}return row.toObject();
}
export async function filterEmergencyCoverage(candidates,{now=new Date()}={}){
 const policy=await readEmergencyCoverage();const ids=scheduledUserIds(policy,now);
 return ids===null?candidates:candidates.filter(candidate=>ids.has(String(candidate.user?._id||candidate.user)));
}
export async function emergencyCoverageStatus({now=new Date()}={}){
 const policy=await readEmergencyCoverage();const ids=scheduledUserIds(policy,now);
 if(ids===null)return {enabled:false,covered:null};
 const eligible=await eligibleUserIds([...ids]);return {enabled:true,covered:eligible.length>0,eligibleOperators:eligible.length,version:policy.version};
}
