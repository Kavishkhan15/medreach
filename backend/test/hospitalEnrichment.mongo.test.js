import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Hospital } from '../src/models/Hospital.js';
import { User } from '../src/models/User.js';
import { DataSource } from '../src/models/DataSource.js';
import { HospitalFieldClaim } from '../src/models/HospitalFieldClaim.js';
import { HospitalEnrichment } from '../src/models/HospitalEnrichment.js';
import { BackgroundJob } from '../src/models/BackgroundJob.js';
import { env } from '../src/config/env.js';
import { enrichHospitalData } from '../src/services/hospitalEnrichmentService.js';
import { requestHospitalEnrichment, readHospitalEnrichment, reviewHospitalEnrichment, drainHospitalEnrichment, listHospitalEnrichments } from '../src/services/hospitalEnrichmentWorkflow.js';
const uri=process.env.MEDREACH_ENRICHMENT_TEST_MONGO_URI;
const isolated=/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_enrichment_test$/.test(uri||'');
test('background hospital extraction is bounded, reviewed and independent of public reads',{skip:!isolated,timeout:60000},async t=>{
 await mongoose.connect(uri);await mongoose.connection.dropDatabase();
 t.after(async()=>{await mongoose.connection.dropDatabase();await mongoose.disconnect()});
 await Promise.all([Hospital,User,DataSource,HospitalFieldClaim,HospitalEnrichment,BackgroundJob].map(m=>m.init()));
 const [admin,provider]=await User.create([{name:'Synthetic system',email:'system@enrichment.test',role:'system_admin'},{name:'Synthetic provider',email:'provider@enrichment.test',role:'provider_admin'}]);
 const actor={id:String(admin._id)},badActor={id:String(provider._id)};
 let sequence=0;
 const scenario=async()=>{
  const i=++sequence,hospital=await Hospital.create({name:`Synthetic extraction hospital ${i}`,approvalStatus:'approved',address:'Existing registered address'});
  const source=await DataSource.create({name:'Synthetic public source',type:'manual_verification',sourceKey:`enrichment-${i}`,url:'https://example.test/directory'});
  const claim=await HospitalFieldClaim.create({hospital:hospital._id,field:'phone',value:'02212345678',source:source._id,sourcePageUrl:'https://example.test/directory',evidenceText:'Telephone 02212345678. Address Existing registered address.',evidenceKind:'source_excerpt',confidence:'HIGH',observedAt:new Date(),parserVersion:'fixture-1',verificationStatus:'unverified'});
  return {hospital,claim,source};
 };
 const request=({hospital},who=actor)=>requestHospitalEnrichment({actor:who,hospitalId:String(hospital._id),reason:'Synthetic operator extraction request'});
 const extractor=async snapshot=>({phone:{value:'02212345678',evidenceId:snapshot.evidence[0].id,quote:'Telephone 02212345678.'}});
 const review=(id,version,who=actor,decision='approve')=>reviewHospitalEnrichment({actor:who,id:String(id),input:{decision,expectedVersion:version,reason:'Synthetic review of exact source evidence',fields:['phone'],confirmedEvidence:true}});
 await t.test('ordinary GET does not call an AI model or create work even with AI configured',async()=>{
  const fixture=await scenario(),before=await BackgroundJob.countDocuments(),settings={aiProvider:env.aiProvider,aiApiKey:env.aiApiKey,aiModel:env.aiModel};
  try{Object.assign(env,{aiProvider:'gemini',aiApiKey:'synthetic-never-send',aiModel:'fixture-model'});const record=await enrichHospitalData(fixture.hospital.slug);assert.equal(record.phone,'Not available.');assert.equal(record.enriched,false);assert.equal(record.emergencyPhone,'Not available.');assert.doesNotMatch(record.sourceName,/Verified Profile/);}
  finally{Object.assign(env,settings)}
  assert.equal(await BackgroundJob.countDocuments(),before);assert.equal(await HospitalEnrichment.countDocuments(),0);
 });
 await t.test('same evidence deduplicates requests, providers cannot request/review, and proposals are unpublished',async()=>{
  const fixture=await scenario();await assert.rejects(request(fixture,badActor),e=>e.status===403);
  const a=await request(fixture),b=await request(fixture);assert.equal(String(a._id),String(b._id));
  const job=await BackgroundJob.findOne({key:`hospital-enrichment:${a._id}`});assert.deepEqual(job.payload,{candidateId:String(a._id)});assert.equal(job.maxAttempts,3);
  await drainHospitalEnrichment({extractor});const candidate=await readHospitalEnrichment({actor,id:String(a._id)});assert.equal(candidate.status,'awaiting_review');assert.equal(candidate.job.status,'completed');
  assert.equal((await enrichHospitalData(fixture.hospital.slug)).phone,'Not available.');
  await assert.rejects(review(a._id,candidate.version,badActor),e=>e.status===403);
  await review(a._id,candidate.version);const visible=await enrichHospitalData(fixture.hospital.slug);assert.equal(visible.phone,'02212345678');assert.equal(visible.address,'Existing registered address');assert.equal(visible.enriched,true);assert.equal(String(visible.enrichmentReview.reviewedBy),String(admin._id));assert.equal(visible.enrichmentReview.fields.phone.sourceUrl,'https://example.test/directory');
  assert.equal((await Hospital.findById(fixture.hospital._id)).phone,undefined,'review must not mutate canonical hospital facts');
  await Hospital.updateOne({_id:fixture.hospital._id},{$set:{phone:'02299999999'}});const newer=await enrichHospitalData(fixture.hospital.slug);assert.equal(newer.phone,'02299999999');assert.equal(newer.enriched,false);
 });
 await t.test('changed evidence supersedes queued work without external extraction',async()=>{
  const fixture=await scenario(),candidate=await request(fixture);await HospitalFieldClaim.updateOne({_id:fixture.claim._id},{$set:{evidenceText:'Telephone 02200000000.'}});let calls=0;
  await drainHospitalEnrichment({extractor:async()=>{calls++;return {}}});assert.equal(calls,0);assert.equal((await HospitalEnrichment.findById(candidate._id)).status,'superseded');
 });
 await t.test('review detects stale evidence and rejected candidates never publish',async()=>{
  const fixture=await scenario(),candidate=await request(fixture);await drainHospitalEnrichment({extractor});const pending=await HospitalEnrichment.findById(candidate._id);
  await HospitalFieldClaim.updateOne({_id:fixture.claim._id},{$set:{verificationStatus:'rejected'}});
  await assert.rejects(review(candidate._id,pending.version),e=>e.code==='ENRICHMENT_EVIDENCE_CHANGED');assert.equal((await enrichHospitalData(fixture.hospital.slug)).phone,'Not available.');
  const fresh=await scenario(),next=await request(fresh);await drainHospitalEnrichment({extractor});const row=await HospitalEnrichment.findById(next._id);await review(next._id,row.version,actor,'reject');assert.equal((await enrichHospitalData(fresh.hospital.slug)).enriched,false);
 });
 await t.test('two workers and duplicate recovery cannot duplicate extraction or approval',async()=>{
  const fixture=await scenario(),candidate=await request(fixture);let calls=0;const extracting=async snapshot=>{calls++;await new Promise(r=>setTimeout(r,15));return extractor(snapshot)};
  await Promise.all([drainHospitalEnrichment({extractor:extracting}),drainHospitalEnrichment({extractor:extracting})]);assert.equal(calls,1);
  let row=await HospitalEnrichment.findById(candidate._id);const version=row.version;
  // Simulate crash after candidate commit but before generic job completion.
  await BackgroundJob.updateOne({key:`hospital-enrichment:${candidate._id}`},{$set:{status:'running',owner:'dead-worker',leaseToken:'dead-token',leaseUntil:new Date(0)},$unset:{completedAt:1}});
  await drainHospitalEnrichment({extractor:async()=>{calls++;return {}}});assert.equal(calls,1);assert.equal((await HospitalEnrichment.findById(candidate._id)).version,version);
  const results=await Promise.allSettled([review(candidate._id,version),review(candidate._id,version)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 });
 await t.test('invented output retries at most three times and remains observable as exhausted',async()=>{
  const fixture=await scenario(),candidate=await request(fixture);let calls=0;
  for(let i=0;i<3;i++){await BackgroundJob.updateOne({key:`hospital-enrichment:${candidate._id}`},{$set:{runAt:new Date(0)}});await drainHospitalEnrichment({extractor:async()=>{calls++;return {bedsAvailable:15}}});}
  assert.equal(calls,3);const result=await readHospitalEnrichment({actor,id:String(candidate._id)});assert.equal(result.job.status,'exhausted');assert.equal(result.job.errorCode,'INVALID_ENRICHMENT_PROPOSAL');
  await drainHospitalEnrichment({extractor:async()=>{calls++;return {}}});assert.equal(calls,3);assert.equal((await enrichHospitalData(fixture.hospital.slug)).enriched,false);
 });
 await t.test('timeouts release the candidate lease and late extractor resolution cannot publish',async()=>{
  const fixture=await scenario(),candidate=await request(fixture);
  const result=await drainHospitalEnrichment({timeoutMs:5,extractor:async snapshot=>{await new Promise(r=>setTimeout(r,40));return extractor(snapshot)}});assert.equal(result.failed,1);
  await new Promise(r=>setTimeout(r,60));const row=await HospitalEnrichment.findById(candidate._id).select('+extractLeaseToken').lean();assert.equal(row.status,'queued');assert.equal(row.extractLeaseToken,undefined);
  assert.equal((await readHospitalEnrichment({actor,id:String(candidate._id)})).job.errorCode,'ENRICHMENT_TIMEOUT');
 });
 await t.test('intent survives enqueue failure and administration lists bounded summaries without snapshots',async()=>{
  const fixture=await scenario(),original=BackgroundJob.findOneAndUpdate;
  BackgroundJob.findOneAndUpdate=async()=>{throw new Error('Synthetic enqueue interruption')};
  try{await assert.rejects(request(fixture),/Synthetic enqueue interruption/)}finally{BackgroundJob.findOneAndUpdate=original}
  const row=await HospitalEnrichment.findOne({hospital:fixture.hospital._id});assert.equal(row.status,'queued');assert.equal(row.jobEnqueuedAt,undefined);
  await drainHospitalEnrichment({extractor});assert.equal((await HospitalEnrichment.findById(row._id)).status,'awaiting_review');
  const page=await listHospitalEnrichments({actor,limit:'2'});assert.equal(page.data.length,2);assert.ok(page.nextCursor);assert.ok(page.data.every(item=>!Object.hasOwn(item,'snapshot')&&!Object.hasOwn(item,'proposed')));
  const next=await listHospitalEnrichments({actor,limit:2,before:page.nextCursor});assert.ok(!next.data.some(item=>page.data.some(first=>String(first._id)===String(item._id))));
  await assert.rejects(listHospitalEnrichments({actor:badActor}),e=>e.status===403);
  await assert.rejects(listHospitalEnrichments({actor,limit:101}),e=>e.status===400);
  await assert.rejects(listHospitalEnrichments({actor,status:{$ne:'approved'}}),e=>e.status===400);
 });
});
