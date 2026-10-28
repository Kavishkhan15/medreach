import { OperationalAlertReceipt } from "../src/models/OperationalAlertReceipt.js";
import test from "node:test";
import assert from "node:assert/strict";
import { verifyApiIndexes } from "../src/services/productionIndexes.js";
import { ResourceInventory } from "../src/models/ResourceInventory.js";
import { InventoryObservation } from "../src/models/InventoryObservation.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { EmailWebhookEvent } from "../src/models/EmailWebhookEvent.js";
import { EmergencyCoordination } from "../src/models/EmergencyCoordination.js";
import { RateLimitBucket } from "../src/models/RateLimitBucket.js";
import { BackgroundJob } from "../src/models/BackgroundJob.js";
import { WorkerHeartbeat } from "../src/models/WorkerHeartbeat.js";
import { verifyWorkerIndexes } from "../src/services/workerRuntime.js";
import { PrivilegedSecurity, PrivilegedReauthentication } from "../src/models/PrivilegedSecurity.js";
import { DataExport } from "../src/models/DataExport.js";
import { EmergencyCoverage } from "../src/models/EmergencyCoverage.js";
import { OrganizationUsage } from "../src/models/OrganizationUsage.js";
import { ProviderGroup, ProviderOnboarding, ProviderOffboarding } from "../src/models/providerAdoptionModels.js";
import { HospitalEnrichment } from "../src/models/HospitalEnrichment.js";
import { BackendLatencyBucket } from "../src/models/BackendLatencyBucket.js";

test("production startup requires existing reviewed uniqueness indexes without creating them", async()=>{
 const models=[ResourceInventory,InventoryObservation,EmailDelivery,EmailWebhookEvent,EmergencyCoordination,RateLimitBucket,PrivilegedSecurity,PrivilegedReauthentication,DataExport,EmergencyCoverage,OperationalAlertReceipt,OrganizationUsage,ProviderGroup,ProviderOnboarding,ProviderOffboarding,HospitalEnrichment,BackendLatencyBucket];
 const originals=models.map(Model=>Model.collection.indexes);
 try{
  for(const Model of models)Model.collection.indexes=async()=>Model===OperationalAlertReceipt?[{name:"_id_",key:{_id:1}}]:Model.schema.indexes().filter(([,options])=>options.unique||options.expireAfterSeconds!==undefined).map(([key,options])=>({key,...options}));
  await verifyApiIndexes({nodeEnv:"production"});
  const receiptIndexes=OperationalAlertReceipt.collection.indexes;
  OperationalAlertReceipt.collection.indexes=async()=>[];
  await assert.rejects(()=>verifyApiIndexes({nodeEnv:"production"}),error=>error.code==="API_INDEX_MISSING");
  OperationalAlertReceipt.collection.indexes=receiptIndexes;
  const correctMfaIndexes = PrivilegedSecurity.collection.indexes;
  PrivilegedSecurity.collection.indexes = async () => [];
  await assert.rejects(()=>verifyApiIndexes({nodeEnv:"production"}),error=>error.code==="API_INDEX_MISSING");
  PrivilegedSecurity.collection.indexes = correctMfaIndexes;
  ResourceInventory.collection.indexes=async()=>ResourceInventory.schema.indexes().filter(([,options])=>options.unique).map(([key,options])=>({key,...options,sparse:true}));
  await assert.rejects(()=>verifyApiIndexes({nodeEnv:"production"}),error=>error.code==="API_INDEX_MISSING");
  ResourceInventory.collection.indexes=async()=>[];
  await assert.rejects(()=>verifyApiIndexes({nodeEnv:"production"}),error=>error.code==="API_INDEX_MISSING");
  ResourceInventory.collection.indexes=async()=>ResourceInventory.schema.indexes().filter(([,options])=>options.unique).map(([key,options])=>({key,...options}));
  RateLimitBucket.collection.indexes=async()=>[];
  await assert.rejects(()=>verifyApiIndexes({nodeEnv:"production"}),error=>error.code==="API_INDEX_MISSING");
  await verifyApiIndexes({nodeEnv:"development"});
 }finally{models.forEach((Model,index)=>{Model.collection.indexes=originals[index];});}
});

test("worker startup rejects partial and sparse semantic uniqueness",async()=>{
 const originals=[BackgroundJob.collection.indexes,WorkerHeartbeat.collection.indexes];
 try{
  WorkerHeartbeat.collection.indexes=async()=>[{key:{workerId:1},unique:true}];
  BackgroundJob.collection.indexes=async()=>[{key:{key:1},unique:true,partialFilterExpression:{status:"completed"}}];
  await assert.rejects(()=>verifyWorkerIndexes(),error=>error.code==="WORKER_INDEX_MISSING");
  BackgroundJob.collection.indexes=async()=>[{key:{key:1},unique:true,sparse:true}];
  await assert.rejects(()=>verifyWorkerIndexes(),error=>error.code==="WORKER_INDEX_MISSING");
  BackgroundJob.collection.indexes=async()=>[{key:{key:1},unique:true}];
  await verifyWorkerIndexes();
 }finally{BackgroundJob.collection.indexes=originals[0];WorkerHeartbeat.collection.indexes=originals[1];}
});
