import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {targetIdentity} from "../scripts/migrateProductionIndexes.js";
import {validateVerifiedBackupReceipt,fileSha256,createEncryptedBackup,verifyEncryptedRestore} from "../scripts/verifiedBackup.js";
test("production migration requires explicit exact target and excludes internal databases",()=>{
 assert.throws(()=>targetIdentity("mongodb://127.0.0.1/medreach","different"));
 assert.throws(()=>targetIdentity("mongodb://127.0.0.1/admin","admin"));
 assert.throws(()=>targetIdentity("https://example.org/medreach","medreach"));
 assert.equal(targetIdentity("mongodb://one:secret@db.example/medreach","medreach").fingerprint,targetIdentity("mongodb://two:rotated@db.example/medreach","medreach").fingerprint);
});
test("backup receipt is bound to real bytes, target, report and recent restore",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"medreach-receipt-test-"));
 try{
  const archivePath=join(directory,"encrypted.bin");await writeFile(archivePath,"encrypted fixture");
  const receipt={schemaVersion:1,database:"medreach",archivePath,archiveSha256:await fileSha256(archivePath),restoreVerified:true,encrypted:true,verifiedAt:new Date().toISOString(),targetFingerprint:"fingerprint",reportChecksum:"reviewed-report"};
  const expected={database:"medreach",targetFingerprint:"fingerprint",reportChecksum:"reviewed-report"};
  assert.equal(await validateVerifiedBackupReceipt(receipt,expected),true);
  await assert.rejects(()=>validateVerifiedBackupReceipt({...receipt,restoreVerified:false},expected));
  await assert.rejects(()=>validateVerifiedBackupReceipt({...receipt,verifiedAt:"invalid"},expected));
  await assert.rejects(()=>validateVerifiedBackupReceipt({...receipt,verifiedAt:new Date(Date.now()-86400001).toISOString()},expected));
  await assert.rejects(()=>validateVerifiedBackupReceipt(receipt,{...expected,reportChecksum:"other"}));
  await writeFile(archivePath,"modified archive");await assert.rejects(()=>validateVerifiedBackupReceipt(receipt,expected),/ARCHIVE_CHANGED/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test("backup and restore reject unsafe execution before starting tools",async()=>{
 await assert.rejects(()=>createEncryptedBackup({uri:"mongodb://localhost/medreach",database:"medreach"}),/QUIESCENCE_REQUIRED/);
 const previous=process.env.EMAIL_ENABLED;process.env.EMAIL_ENABLED="true";
 try{await assert.rejects(()=>verifyEncryptedRestore({}),/EMAIL_MUST_BE_DISABLED/);}finally{if(previous===undefined)delete process.env.EMAIL_ENABLED;else process.env.EMAIL_ENABLED=previous;}
});
