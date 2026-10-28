import { createCipheriv,createDecipheriv,randomBytes,createHash } from "node:crypto";
import { createReadStream,createWriteStream } from "node:fs";
import { mkdtemp,writeFile,readFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { targetIdentity } from "./migrateProductionIndexes.js";
export async function fileSha256(path){const hash=createHash("sha256");for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest("hex");}
export async function validateVerifiedBackupReceipt(receipt,{database,targetFingerprint,reportChecksum,maxAgeMs=86400000,now=new Date()}={}){
 const at=new Date(receipt?.verifiedAt);
 if(receipt?.schemaVersion!==1||receipt?.database!==database||receipt?.restoreVerified!==true||receipt?.encrypted!==true||!receipt?.archivePath||!Number.isFinite(at.getTime())||now-at>maxAgeMs||at>now||(targetFingerprint&&receipt.targetFingerprint!==targetFingerprint)||(reportChecksum&&receipt.reportChecksum!==reportChecksum)||!/^([a-f0-9]{64})$/.test(receipt.archiveSha256||""))throw Error("BACKUP_RECEIPT_INVALID");
 if(await fileSha256(receipt.archivePath)!==receipt.archiveSha256)throw Error("BACKUP_ARCHIVE_CHANGED");return true;
}
function keyFromEnv(){const key=Buffer.from(process.env.MEDREACH_BACKUP_ENCRYPTION_KEY||"","base64");if(key.length!==32)throw Error("BACKUP_KEY_INVALID");return key;}
async function toolConfig(uri){const directory=await mkdtemp(join(tmpdir(),"medreach-backup-"));const path=join(directory,"config.yml");await writeFile(path,JSON.stringify({uri}),{mode:0o600});return {directory,path};}
function launch(program,args){const child=spawn(program,args,{stdio:["pipe","pipe","pipe"]});child.stderr.resume();const done=new Promise((resolve,reject)=>{child.once("error",()=>reject(Error("BACKUP_TOOL_UNAVAILABLE")));child.once("exit",code=>code===0?resolve():reject(Error("BACKUP_TOOL_FAILED")));});done.catch(()=>{});return {child,done};}
export async function createEncryptedBackup({uri,database,archivePath,receiptPath,sourceQuiesced=false,reportChecksum}={}){
 if(!sourceQuiesced)throw Error("BACKUP_QUIESCENCE_REQUIRED");const target=targetIdentity(uri,database);const key=keyFromEnv();const iv=randomBytes(12);const config=await toolConfig(uri);const absolute=resolve(archivePath);let tool;
 try{
  const output=createWriteStream(absolute,{flags:"wx",mode:0o600});
  // 12-byte nonce followed by AES-256-GCM ciphertext; tag is in the receipt.
  output.write(iv);const cipher=createCipheriv("aes-256-gcm",key,iv);
  tool=launch("mongodump",["--config",config.path,"--archive","--gzip","--quiet"]);tool.child.stdin.end();
  await Promise.all([pipeline(tool.child.stdout,cipher,output),tool.done]);
  const receipt={schemaVersion:1,database,targetFingerprint:target.fingerprint,archivePath:absolute,archiveSha256:await fileSha256(absolute),encrypted:true,algorithm:"aes-256-gcm",authTag:cipher.getAuthTag().toString("base64"),createdAt:new Date().toISOString(),consistency:"operator_quiesced",restoreVerified:false,...(reportChecksum?{reportChecksum}:{})};
  await writeFile(receiptPath,JSON.stringify(receipt,null,2),{flag:"wx",mode:0o600});return receipt;
 }catch(error){tool?.child.kill();throw error;}finally{await rm(config.directory,{recursive:true,force:true});}
}
function stableOptions(value){
 if(Array.isArray(value))return value.map(stableOptions);
 if(value&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableOptions(value[key])]));
 return value;
}
export function indexDefinition(index){
 const {v: _version,ns: _namespace,buildUUID: _build,key,...options}=index;
 // Compound key order changes index semantics; options are normalised only to
 // remove BSON property ordering differences after mongorestore.
 return {key:Object.entries(key),options:stableOptions(options)};
}
export async function contentDigest(client,database){
 const result={};const db=client.db(database);
 for(const collection of (await db.listCollections({type:"collection"}).toArray()).sort((a,b)=>a.name.localeCompare(b.name))){
  const hash=createHash("sha256");let count=0;
  for await(const document of db.collection(collection.name).find({}).sort({_id:1})){hash.update(mongoose.mongo.BSON.serialize(document));count++;}
  const indexes=(await db.collection(collection.name).listIndexes().toArray()).sort((a,b)=>a.name.localeCompare(b.name)).map(indexDefinition);
  result[collection.name]={count,sha256:hash.digest("hex"),indexes};
 }
 return result;
}
export async function verifyEncryptedRestore({sourceUri,targetUri,receiptPath}={}){
 if(process.env.EMAIL_ENABLED!=="false")throw Error("BACKUP_RESTORE_EMAIL_MUST_BE_DISABLED");
 const receipt=JSON.parse(await readFile(receiptPath,"utf8"));targetIdentity(sourceUri,receipt.database);
 if(!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_backup_restore_test$/.test(targetUri||""))throw Error("BACKUP_RESTORE_TARGET_REFUSED");
 if(receipt.targetFingerprint!==targetIdentity(sourceUri,receipt.database).fingerprint||await fileSha256(receipt.archivePath)!==receipt.archiveSha256)throw Error("BACKUP_ARCHIVE_CHANGED");
 const key=keyFromEnv();const [source,target]=[sourceUri,targetUri].map(uri=>new mongoose.mongo.MongoClient(uri,{serverSelectionTimeoutMS:5000,maxPoolSize:2}));let config,tool;
 const started=Date.now();
 try{
  await Promise.all([source.connect(),target.connect()]);
  if((await target.db().listCollections().toArray()).length)throw Error("BACKUP_RESTORE_TARGET_NOT_EMPTY");
  const restoreConnection=new URL(targetUri);restoreConnection.pathname="/";
  config=await toolConfig(restoreConnection.href);const iv=Buffer.alloc(12);const archive=createReadStream(receipt.archivePath,{start:12});const handle=await import("node:fs/promises").then(fs=>fs.open(receipt.archivePath,"r"));try{await handle.read(iv,0,12,0);}finally{await handle.close();}
  const decipher=createDecipheriv("aes-256-gcm",key,iv);decipher.setAuthTag(Buffer.from(receipt.authTag,"base64"));
  tool=launch("mongorestore",["--config",config.path,"--archive","--gzip","--stopOnError","--nsFrom",`${receipt.database}.*`,"--nsTo","medreach_backup_restore_test.*","--quiet"]);tool.child.stdout.resume();
  await Promise.all([pipeline(archive,decipher,tool.child.stdin),tool.done]);
  const [expected,actual]=await Promise.all([contentDigest(source,receipt.database),contentDigest(target,"medreach_backup_restore_test")]);
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Object.assign(Error("BACKUP_CONTENT_MISMATCH_SOURCE_MUST_REMAIN_QUIESCED"),{comparison:{expected,actual}});
  const verified={...receipt,restoreVerified:true,verifiedAt:new Date().toISOString(),restoreDurationMs:Date.now()-started,recoverableAgeMs:Date.now()-new Date(receipt.createdAt),content:actual};
  await writeFile(receiptPath,JSON.stringify(verified,null,2),{mode:0o600});return verified;
 }catch(error){tool?.child.kill();throw error;}finally{await Promise.all([source.close(),target.close()]);if(config)await rm(config.directory,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{
 if(process.argv[2]==="create")await createEncryptedBackup({uri:process.env.MEDREACH_BACKUP_SOURCE_URI,database:process.env.MEDREACH_BACKUP_DATABASE,archivePath:process.env.MEDREACH_BACKUP_ARCHIVE,receiptPath:process.env.MEDREACH_BACKUP_RECEIPT,sourceQuiesced:process.argv.includes("--source-quiesced"),reportChecksum:process.env.MEDREACH_BACKUP_REPORT_CHECKSUM});
 else if(process.argv[2]==="verify")await verifyEncryptedRestore({sourceUri:process.env.MEDREACH_BACKUP_SOURCE_URI,targetUri:process.env.MEDREACH_RESTORE_VERIFY_URI,receiptPath:process.env.MEDREACH_BACKUP_RECEIPT});else throw Error("BACKUP_COMMAND_INVALID");
 console.log(JSON.stringify({event:"backup_operation_completed",operation:process.argv[2]}));
}catch(error){console.error(/^BACKUP_[A-Z_]+$/.test(error.message)?error.message:"BACKUP_OPERATION_FAILED");process.exitCode=1;}}
