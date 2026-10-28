import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {migrateProductionIndexes} from "../scripts/migrateProductionIndexes.js";
import {fileSha256} from "../scripts/verifiedBackup.js";
const uri=process.env.MEDREACH_PRODUCTION_MIGRATION_TEST_MONGO_URI;
const isolated=/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_production_migration_test$/.test(uri||"");
test("production additive migration dry-run, approvals, unique preflight, immutable identity and idempotence",{skip:!isolated,timeout:120000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),"medreach-migration-test-"));
 const options={uri,expectedDatabase:"medreach_production_migration_test",log:()=>{}};
 await mongoose.connect(uri,{autoIndex:false,autoCreate:false});await mongoose.connection.dropDatabase();
 try{
  const report=await migrateProductionIndexes(options);
  assert.ok(report.plan.length>0);assert.equal(await mongoose.connection.db.collection("productionmigrationledger").countDocuments(),0);
  await assert.rejects(()=>migrateProductionIndexes({...options,apply:true,approvedChecksum:report.checksum}),/UNIQUE_BOOTSTRAP_NOT_APPROVED/);
  await assert.rejects(()=>migrateProductionIndexes({...options,apply:true,approvedChecksum:report.checksum,allowUniqueBootstrap:true}),/EXPIRY_POLICY_NOT_APPROVED/);
  // Duplicated heartbeat identity must be detected before any ledger/index write.
  await mongoose.connection.db.collection("workerheartbeats").insertMany([{workerId:"duplicate"},{workerId:"duplicate"}]);
  await assert.rejects(()=>migrateProductionIndexes({...options,apply:true,approvedChecksum:report.checksum,allowUniqueBootstrap:true,approveExpiryIndexes:true}),/UNIQUE_DUPLICATES_FOUND/);
  assert.equal(await mongoose.connection.db.collection("productionmigrationledger").countDocuments(),0);
  await mongoose.connection.db.collection("workerheartbeats").deleteMany({});
  const archivePath=join(directory,"fixture.enc");await writeFile(archivePath,"synthetic encrypted archive receipt fixture");
  const backup={schemaVersion:1,database:options.expectedDatabase,targetFingerprint:report.targetFingerprint,reportChecksum:report.checksum,archivePath,archiveSha256:await fileSha256(archivePath),encrypted:true,restoreVerified:true,verifiedAt:new Date().toISOString()};
  await migrateProductionIndexes({...options,apply:true,approvedChecksum:report.checksum,allowUniqueBootstrap:true,approveExpiryIndexes:true,backup});
  const after=await migrateProductionIndexes(options);assert.equal(after.checksum,report.checksum);assert.equal(after.plan.length,0,JSON.stringify(after.plan));
  assert.equal((await migrateProductionIndexes({...options,apply:true,approvedChecksum:report.checksum})).alreadyApplied,true);
  assert.equal((await mongoose.connection.db.collection("productionmigrationledger").findOne({})).backupSha256,backup.archiveSha256);
  await mongoose.connection.db.collection("productionmigrationledger").updateOne({},{$set:{checksum:"tampered"}});
  await assert.rejects(()=>migrateProductionIndexes(options),/MANIFEST_CHANGED/);
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();await rm(directory,{recursive:true,force:true});}
});
