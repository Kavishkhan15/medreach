import mongoose from "mongoose";
import { createHash,randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { operationsManifest } from "./migrateOperationsIndexes.js";
export const productionMigrationVersion="2026-10-26-additive-indexes-v2";
export function targetIdentity(uri,expectedDatabase) {
 let url;try{url=new URL(uri);}catch{throw Error("MIGRATION_TARGET_INVALID");}
 const database=decodeURIComponent(url.pathname.slice(1));
 if(!["mongodb:","mongodb+srv:"].includes(url.protocol)||!database||database!==expectedDatabase||!/^[-a-zA-Z0-9_]+$/.test(database)||["admin","config","local"].includes(database))throw Error("MIGRATION_TARGET_INVALID");
 return {database,fingerprint:createHash("sha256").update(`${url.protocol}//${url.host}/${database}`).digest("hex")};
}
export async function productionManifest(){
 const models=await operationsManifest();
 for(const name of ["Hospital","ResourceProvider","ProviderMembership","InventoryImport","DataExport","EmergencyCoverage","OperationalAlertReceipt"])models.push((await import(`../src/models/${name}.js`))[name]);
 models.push(...Object.values(await import("../src/models/PrivilegedSecurity.js")));
 return models;
}
async function duplicateGroups(collection,key,options){
 const match={...(options.partialFilterExpression||{})};if(options.sparse)match.$or=Object.keys(key).map(field=>({[field]:{$exists:true}}));
 const unwind=Object.keys(key).every(field=>field.startsWith("branches."))?[{$unwind:"$branches"}]:[];
 const rows=await collection.aggregate([{$match:match},...unwind,{$group:{_id:Object.fromEntries(Object.keys(key).map((field,index)=>[`f${index}`,{$ifNull:[`$${field}`,null]}])),documents:{$addToSet:"$_id"}}},{$match:{$expr:{$gt:[{$size:"$documents"},1]}}},{$count:"groups"}],{allowDiskUse:true}).toArray();return rows[0]?.groups||0;
}
export async function migrateProductionIndexes({uri,expectedDatabase,apply=false,approvedChecksum,backup,allowUniqueBootstrap=false,approveExpiryIndexes=false,log=console.log,migrationVersion=productionMigrationVersion,manifestFactory=productionManifest}={}) {
 if(typeof migrationVersion!=="string"||!/^[-a-zA-Z0-9]{1,100}$/.test(migrationVersion)||typeof manifestFactory!=="function")throw Error("MIGRATION_VERSION_INVALID");
 const target=targetIdentity(uri,expectedDatabase);const models=await manifestFactory();
 await mongoose.connect(uri,{autoIndex:false,autoCreate:false,maxPoolSize:2,serverSelectionTimeoutMS:10000});
 const manifest=models.map(Model=>({collection:Model.collection.collectionName,indexes:Model.schema.indexes()}));
 // Full versioned manifest, not only missing indexes: partial application and
 // repeat application retain the same target-bound approval identity.
 const checksum=createHash("sha256").update(JSON.stringify({version:migrationVersion,target:target.fingerprint,manifest})).digest("hex");
 const ledger=mongoose.connection.db.collection("productionmigrationledger");
 const previous=await ledger.findOne({_id:migrationVersion});
 if(previous&&previous.checksum!==checksum)throw Error("MIGRATION_MANIFEST_CHANGED_NEW_VERSION_REQUIRED");
 const plan=[];let duplicates=0;
 for(const Model of models){
  const existing=await Model.collection.indexes().catch(error=>{if(error.code===26)return [];throw error;});
  for(const [key,options]of Model.schema.indexes()) {
   const textFields=Object.keys(key).filter(field=>key[field]==="text");
   const matching=existing.find(value=>textFields.length?value.key._fts==="text"&&JSON.stringify(Object.keys(value.weights||{}).sort())===JSON.stringify(textFields.sort())&&Object.entries(key).filter(([,direction])=>direction!=="text").every(([field,direction])=>value.key[field]===direction):JSON.stringify(value.key)===JSON.stringify(key));
   if(matching){
    if(Boolean(matching.unique)!==Boolean(options.unique)||JSON.stringify(matching.partialFilterExpression||null)!==JSON.stringify(options.partialFilterExpression||null)||Boolean(matching.sparse)!==Boolean(options.sparse)||(matching.expireAfterSeconds??null)!==(options.expireAfterSeconds??null))throw Error("MIGRATION_INDEX_CONFLICT");
    continue;
   }
   const groups=options.unique?await duplicateGroups(Model.collection,key,options):0;duplicates+=groups;
   plan.push({collection:Model.collection.collectionName,key,options,duplicateGroups:groups});
  }
 }
 const report={version:migrationVersion,targetFingerprint:target.fingerprint,database:target.database,mode:apply?"apply":"dry-run",checksum,manifest,plan,duplicateGroups:duplicates,requiresUniqueBootstrapApproval:plan.some(item=>item.options.unique),requiresExpiryApproval:plan.some(item=>item.options.expireAfterSeconds!==undefined)};
 log(JSON.stringify(report,null,2));if(!apply)return report;
 if(checksum!==approvedChecksum)throw Error("MIGRATION_PLAN_NOT_APPROVED");
 if(previous?.status==="completed")return {...report,alreadyApplied:true};
 if(previous)throw Error("MIGRATION_LOCKED_REVIEW_LEDGER");
 if(duplicates)throw Error("MIGRATION_UNIQUE_DUPLICATES_FOUND");
 if(report.requiresUniqueBootstrapApproval&&!allowUniqueBootstrap)throw Error("MIGRATION_UNIQUE_BOOTSTRAP_NOT_APPROVED");
 if(report.requiresExpiryApproval&&!approveExpiryIndexes)throw Error("MIGRATION_EXPIRY_POLICY_NOT_APPROVED");
 const {validateVerifiedBackupReceipt}=await import("./verifiedBackup.js");
 await validateVerifiedBackupReceipt(backup,{database:target.database,targetFingerprint:target.fingerprint,reportChecksum:checksum});
 const owner=randomUUID();
 // An interrupted migration remains locked for operator review; no lease theft.
 try {await ledger.insertOne({_id:migrationVersion,status:"applying",owner,checksum,targetFingerprint:target.fingerprint,backupSha256:backup.archiveSha256,startedAt:new Date(),completedIndexes:[]});}
 catch(error){if(error.code===11000)throw Error("MIGRATION_LOCKED_REVIEW_LEDGER",{cause:error});throw error;}
 try {
  for(const item of plan){
   await mongoose.connection.db.collection(item.collection).createIndex(item.key,item.options);
   await ledger.updateOne({_id:migrationVersion,owner,status:"applying"},{$push:{completedIndexes:{collection:item.collection,key:item.key}}});
  }
  await ledger.updateOne({_id:migrationVersion,owner,status:"applying"},{$set:{status:"completed",completedAt:new Date()}});
 }catch(error){await ledger.updateOne({_id:migrationVersion,owner},{$set:{status:"failed",failedAt:new Date(),errorCode:"INDEX_APPLY_FAILED"}});throw error;}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2);if(args.some(value=>!["--apply","--dry-run","--allow-unique-bootstrap","--approve-expiry-indexes"].includes(value))||(args.includes("--apply")&&args.includes("--dry-run")))throw Error("MIGRATION_ARGUMENTS_INVALID");
  const apply=args.includes("--apply");
  await migrateProductionIndexes({uri:process.env.MEDREACH_MIGRATION_URI,expectedDatabase:process.env.MEDREACH_MIGRATION_DATABASE,apply,allowUniqueBootstrap:args.includes("--allow-unique-bootstrap"),approveExpiryIndexes:args.includes("--approve-expiry-indexes"),approvedChecksum:process.env.MEDREACH_MIGRATION_APPROVED_CHECKSUM,backup:apply?JSON.parse(await readFile(process.env.MEDREACH_MIGRATION_BACKUP_RECEIPT,"utf8")):undefined});
 }catch(error){console.error(/^MIGRATION_[A-Z_]+$/.test(error.message)?error.message:"MIGRATION_FAILED_CHECK_PRIVATE_DIAGNOSTICS");process.exitCode=1;}
 finally{await mongoose.disconnect();}
}
