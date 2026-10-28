import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mongo } from "mongoose";
import { applyIntegrityMigration, inspectIntegrityMigration, validateIntegrityPlan } from "../src/services/integrityMigration.js";
const uri=process.env.MEDREACH_INTEGRITY_MIGRATIONS_TEST_MONGO_URI;
const isolated=Boolean(uri&&/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_integrity_migrations_test$/.test(uri));
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
test("evidence-backed integrity migration only mutates exact isolated preconditions",{skip:!isolated,timeout:30000},async t=>{
 const client=new mongo.MongoClient(uri);await client.connect();const db=client.db();await db.dropDatabase();
 const dir=await mkdtemp(join(tmpdir(),"medreach-integrity-test-"));
 t.after(async()=>{await db.dropDatabase();await client.close();await rm(dir,{recursive:true,force:true});});
 async function fixture(){
  const recordId=new mongo.ObjectId(), oldId=new mongo.ObjectId(), newId=new mongo.ObjectId(), reviewerId=new mongo.ObjectId();
  const source={_id:recordId,hospital:oldId,requestId:`MR-${recordId}`,status:"EXPIRED",timeline:[{status:"REQUESTED",at:new Date()}],updatedAt:new Date()};
  await db.collection("emergencyrequests").insertOne(source);await db.collection("hospitals").insertOne({_id:newId,name:"Exact attributable target",archivedAt:null});
  const artifactPath=join(dir,`${recordId}.json`),artifact=JSON.stringify({recordId:String(recordId),hospital:String(newId),source:"original import mapping"});await writeFile(artifactPath,artifact);
  const row={findingId:hash(String(recordId)),collection:"emergencyrequests",recordId:String(recordId),field:"hospital",storedReference:String(oldId),targetCollection:"hospitals",resolution:"repair",proposedChange:{reference:String(newId)},
   preconditionHash:hash({recordId:String(recordId),field:"hospital",present:true,valueType:"ObjectId",value:String(oldId),updatedAt:source.updatedAt}),
   approval:{reviewerId:String(reviewerId),approvedAt:new Date().toISOString(),reason:"Verified exact original import mapping"},
   evidence:{artifactPath,sha256:createHash("sha256").update(artifact).digest("hex"),recordId:String(recordId),field:"hospital",originalReference:String(oldId),intendedReference:String(newId)},rollback:{reference:String(oldId)}};
  const manifest={schemaVersion:1,database:db.databaseName,approved:true,entries:[row]};return{source,row,manifest,newId,recordId};
 }
 const approval=manifest=>({approvedChecksum:validateIntegrityPlan(manifest).checksum,backupVerified:true});
 await t.test("requires backup receipt flag and exact approved plan checksum",async()=>{
  const f=await fixture();await assert.rejects(applyIntegrityMigration(db,f.manifest,{backupVerified:true,approvedChecksum:"wrong"}),/BACKUP_AND_EXACT/);
  await assert.rejects(applyIntegrityMigration(db,f.manifest,{approvedChecksum:validateIntegrityPlan(f.manifest).checksum}),/BACKUP_AND_EXACT/);
  assert.equal(String((await db.collection("emergencyrequests").findOne({_id:f.recordId})).hospital),f.row.storedReference);
 });
 await t.test("preserves source ID, status and timeline with atomic before/after journal and duplicate protection",async()=>{
  const f=await fixture();const result=await applyIntegrityMigration(db,f.manifest,approval(f.manifest));assert.equal(result.repairs,1);
  const current=await db.collection("emergencyrequests").findOne({_id:f.recordId});assert.equal(String(current.hospital),String(f.newId));assert.equal(current.status,f.source.status);assert.deepEqual(current.timeline,f.source.timeline);
  assert.equal(current.integrityRepairJournal.length,1);assert.equal(String(current.integrityRepairJournal[0].beforeValue),f.row.storedReference);assert.equal(String(current.integrityRepairJournal[0].afterValue),String(f.newId));
  assert.equal((await applyIntegrityMigration(db,f.manifest,approval(f.manifest))).alreadyApplied,true);
  const ledger=await db.collection("integritymigrationledger").findOne({_id:result.checksum});assert.equal(ledger.rollbackRecords.length,1);assert.equal(ledger.status,"complete");
 });
 await t.test("changed audited source precondition is refused",async()=>{
  const f=await fixture();await db.collection("emergencyrequests").updateOne({_id:f.recordId},{$set:{updatedAt:new Date(Date.now()+2000)}});
  await assert.rejects(inspectIntegrityMigration(db,f.manifest),/PRECONDITION/);
 });
 await t.test("exact evidence checksum and existing target are required; names do not infer repairs",async()=>{
  const f=await fixture();await writeFile(f.row.evidence.artifactPath,"changed evidence");await assert.rejects(inspectIntegrityMigration(db,f.manifest),/EVIDENCE_CHECKSUM/);
  const second=await fixture();await db.collection("hospitals").deleteOne({_id:second.newId});await db.collection("hospitals").insertOne({name:"Exact attributable target"});
  await assert.rejects(inspectIntegrityMigration(db,second.manifest),/TARGET_SCOPE/);
 });
 await t.test("archived target and inactive or mismatched provider targets are refused",async()=>{
  const f=await fixture();await db.collection("hospitals").updateOne({_id:f.newId},{$set:{archivedAt:new Date()}});await assert.rejects(inspectIntegrityMigration(db,f.manifest),/TARGET_SCOPE/);
 });
 await t.test("revalidates original audit fingerprint immediately before compare-and-set",async()=>{
  const f=await fixture();let reads=0;
  const wrapper={databaseName:db.databaseName,collection(name){const collection=db.collection(name);if(name!=="emergencyrequests")return collection;return new Proxy(collection,{get(target,key){if(key==="findOne")return async(...args)=>{reads++;if(reads===2)await target.updateOne({_id:f.recordId},{$set:{updatedAt:new Date(Date.now()+5000)}});return target.findOne(...args);};const value=target[key];return typeof value==="function"?value.bind(target):value;}});}};
  await assert.rejects(applyIntegrityMigration(wrapper,f.manifest,approval(f.manifest)),/PRECONDITION/);
  assert.equal(String((await db.collection("emergencyrequests").findOne({_id:f.recordId})).hospital),f.row.storedReference);
  assert.equal((await db.collection("integritymigrationledger").findOne({_id:validateIntegrityPlan(f.manifest).checksum})).status,"requires_review");
 });
 await t.test("interruption after source mutation retains durable journal and refuses automatic lock stealing",async()=>{
  const f=await fixture();const ledger=db.collection("integritymigrationledger");
  const wrapper={databaseName:db.databaseName,collection(name){if(name!=="integritymigrationledger")return db.collection(name);return new Proxy(ledger,{get(target,key){if(key==="updateOne")return async(filter,update,...args)=>{if(update.$push)throw new Error("injected ledger outage");return target.updateOne(filter,update,...args);};const value=target[key];return typeof value==="function"?value.bind(target):value;}});}};
  await assert.rejects(applyIntegrityMigration(wrapper,f.manifest,approval(f.manifest)),/injected ledger outage/);
  const current=await db.collection("emergencyrequests").findOne({_id:f.recordId});assert.equal(String(current.hospital),String(f.newId));assert.equal(current.integrityRepairJournal.length,1);
  await assert.rejects(applyIntegrityMigration(db,f.manifest,approval(f.manifest)),/LOCKED/);
 });
 await t.test("unresolved classification registry does not change historical source relationships",async()=>{
  const f=await fixture();const unresolved={...f.row,resolution:"unresolved",proposedChange:null,approval:null,evidence:null,rollback:null};const manifest={...f.manifest,entries:[unresolved]};
  const result=await applyIntegrityMigration(db,manifest,approval(manifest));assert.equal(result.repairs,0);assert.equal(result.unresolved,1);
  assert.equal(String((await db.collection("emergencyrequests").findOne({_id:f.recordId})).hospital),f.row.storedReference);
  assert.equal((await db.collection("historicalreferencereviews").findOne({_id:f.row.findingId})).classification,"unresolved_historical_reference");
 });
 await t.test("service itself refuses canonical database application",async()=>{
  const f=await fixture();await assert.rejects(applyIntegrityMigration({databaseName:"medreach"},f.manifest,approval(f.manifest)),/TARGET_REFUSED/);
 });
});
