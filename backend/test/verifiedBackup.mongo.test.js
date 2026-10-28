import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {createEncryptedBackup,verifyEncryptedRestore,validateVerifiedBackupReceipt} from "../scripts/verifiedBackup.js";
const uri=process.env.MEDREACH_BACKUP_TEST_MONGO_URI;
const isolated=/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_backup_fixture_test$/.test(uri||"");
test("encrypted archive restores identical BSON content to empty isolated target",{skip:!isolated,timeout:120000},async()=>{
 const targetUri=uri.replace("medreach_backup_fixture_test","medreach_backup_restore_test");
 const [source,target]=[uri,targetUri].map(value=>new mongoose.mongo.MongoClient(value));
 const directory=await mkdtemp(join(tmpdir(),"medreach-backup-integration-"));
 const previous={key:process.env.MEDREACH_BACKUP_ENCRYPTION_KEY,email:process.env.EMAIL_ENABLED};
 try{
  await Promise.all([source.connect(),target.connect()]);
  assert.equal(source.db().databaseName,"medreach_backup_fixture_test");assert.equal(target.db().databaseName,"medreach_backup_restore_test");
  if((await target.db().listCollections().toArray()).length)throw Error("Isolated restore target must already be empty");
  await source.db().dropDatabase();
  await source.db().collection("hospitals").insertOne({_id:new mongoose.Types.ObjectId(),name:"Synthetic hospital",observedAt:new Date(),capacity:50,unknown:null,nested:{x:1}});
  await source.db().collection("hospitals").createIndex({name:1,nested:1},{name:"fixture_unique",unique:true,partialFilterExpression:{name:{$type:"string"}}});
  // No fixture document has expiresAt, so this tests expiry-index restoration
  // without deleting any synthetic or application record.
  await source.db().collection("hospitals").createIndex({expiresAt:1},{name:"fixture_expiry",expireAfterSeconds:86400});
  process.env.MEDREACH_BACKUP_ENCRYPTION_KEY=Buffer.alloc(32,42).toString("base64");process.env.EMAIL_ENABLED="false";
  const receiptPath=join(directory,"receipt.json");
  const receipt=await createEncryptedBackup({uri,database:"medreach_backup_fixture_test",archivePath:join(directory,"backup.enc"),receiptPath,sourceQuiesced:true,reportChecksum:"fixture-plan"});
  assert.equal(receipt.restoreVerified,false);
  const verified=await verifyEncryptedRestore({sourceUri:uri,targetUri,receiptPath});
  assert.equal(verified.restoreVerified,true);assert.equal(verified.content.hospitals.count,1);assert.ok(verified.restoreDurationMs>0);
  const unique=verified.content.hospitals.indexes.find(index=>index.options.name==="fixture_unique");
  assert.deepEqual(unique.key,[["name",1],["nested",1]]);assert.equal(unique.options.unique,true);assert.deepEqual(unique.options.partialFilterExpression,{name:{$type:"string"}});
  assert.equal(verified.content.hospitals.indexes.find(index=>index.options.name==="fixture_expiry").options.expireAfterSeconds,86400);
  assert.equal(await validateVerifiedBackupReceipt(verified,{database:"medreach_backup_fixture_test",reportChecksum:"fixture-plan"}),true);
  await assert.rejects(()=>verifyEncryptedRestore({sourceUri:uri,targetUri,receiptPath}),/TARGET_NOT_EMPTY/);
 }finally{
  await Promise.all([source.db().dropDatabase(),target.db().dropDatabase()]);await Promise.all([source.close(),target.close()]);await rm(directory,{recursive:true,force:true});
  for(const [name,value]of Object.entries({MEDREACH_BACKUP_ENCRYPTION_KEY:previous.key,EMAIL_ENABLED:previous.email}))if(value===undefined)delete process.env[name];else process.env[name]=value;
 }
});
