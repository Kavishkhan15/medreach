/** Disposable loopback-only API benchmark. Never reads or writes application data. */
import mongoose from 'mongoose';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { Hospital } from '../src/models/Hospital.js';
import { HospitalFacility } from '../src/models/HospitalFacility.js';
import { AvailabilityObservation } from '../src/models/AvailabilityObservation.js';
import { HospitalFieldClaim } from '../src/models/HospitalFieldClaim.js';
import { HospitalFieldConflict } from '../src/models/HospitalFieldConflict.js';
import { FacilitySourceClaim } from '../src/models/FacilitySourceClaim.js';
import { DataSource } from '../src/models/DataSource.js';
const uri='mongodb://127.0.0.1:27017/medreach_evidence_benchmark_test';
const output=process.argv[2];
if(!output || process.env.NODE_ENV!=='test' || process.env.EMAIL_ENABLED!=='false') throw Error('Explicit test mode, disabled email and new output path required');
let owned=false, server;const marker=randomUUID();let readBytes=0, readCommands=0;
try {
 await mongoose.connect(uri,{monitorCommands:true,maxPoolSize:10});
 if((await mongoose.connection.db.listCollections().toArray()).length)throw Error('Benchmark database must be empty');
 await mongoose.connection.db.collection('_benchmark_owner').insertOne({marker});owned=true;
 const history=Array.from({length:100},(_,i)=>({status:'open',at:new Date(),value:'Synthetic historical review '.repeat(8),note:String(i)}));
 const hospitals=Array.from({length:60},(_,i)=>({_id:new mongoose.Types.ObjectId(),name:`Synthetic benchmark hospital ${String(i).padStart(3,'0')}`,slug:`synthetic-benchmark-${i}`,approvalStatus:'approved',archivedAt:null}));
 const source=new mongoose.Types.ObjectId(),now=new Date();
 await DataSource.collection.insertOne({_id:source,name:'Synthetic benchmark source',type:'manual_verification',sourceKey:'synthetic-benchmark',url:'https://example.test'});
 await Hospital.collection.insertMany(hospitals);
 await HospitalFacility.collection.insertMany(hospitals.flatMap(h=>['Emergency Department','ICU'].map(facility=>({hospital:h._id,facility,capability:'yes',confidence:'HIGH',lastUpdated:now,source}))));
 await AvailabilityObservation.collection.insertMany(hospitals.flatMap(h=>[{hospital:h._id,facility:'Emergency Department',status:'available',quantity:0,verificationStatus:'verified',observedAt:now,retrievedAt:now,confidence:'HIGH',source},{hospital:h._id,facility:'ICU',status:'available',quantity:15,verificationStatus:'verified',observedAt:new Date(+now-3600000),retrievedAt:now,source}]));
 await HospitalFieldClaim.collection.insertMany(hospitals.flatMap(h=>['phone','address'].map(field=>({hospital:h._id,field,source,value:field==='phone'?'02212345678':'Synthetic location',verificationStatus:'verified',confidence:'HIGH',observedAt:now,sourcePageUrl:'https://example.test',evidenceKind:'manual_assertion',parserVersion:'fixture',reviewHistory:history}))));
 await FacilitySourceClaim.collection.insertMany(hospitals.flatMap(h=>['Emergency Department','ICU'].map(facility=>({hospital:h._id,facility,source,capability:'yes',verificationStatus:'verified',confidence:'HIGH',observedAt:now,sourcePageUrl:'https://example.test',parserVersion:'fixture',unusedHistoricalPayload:history}))));
 await HospitalFieldConflict.collection.insertMany(hospitals.map(h=>({hospital:h._id,field:'phone',status:'resolved',claims:[new mongoose.Types.ObjectId()],history})));
 await Promise.all([Hospital,HospitalFacility,AvailabilityObservation,HospitalFieldClaim,HospitalFieldConflict,FacilitySourceClaim,DataSource].map(m=>m.init()));
 mongoose.connection.getClient().on('commandSucceeded',event=>{if(['find','aggregate'].includes(event.commandName)){readCommands++;readBytes+=mongoose.mongo.BSON.calculateObjectSize(event.reply)}});
 server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const url=`http://127.0.0.1:${server.address().port}/api/hospitals?limit=20`;
 const one=async()=>{const start=performance.now(),response=await fetch(url);if(!response.ok)throw Error(`Unexpected HTTP ${response.status}`);const body=await response.json();if(body.data.length!==20||body.data[0].bedsAvailable!==null||body.data[0].facilities.find(f=>f.facility==='ICU').count!==null||body.data[0].facilities.find(f=>f.facility==='Emergency Department').count!==0)throw Error('Availability contract failed');return performance.now()-start};
 for(let i=0;i<5;i++)await one();
 const results=[];
 for(const concurrency of [1,10]){readBytes=0;readCommands=0;let times=[];const start=performance.now();for(let i=0;i<100;i+=concurrency)times.push(...await Promise.all(Array.from({length:concurrency},one)));times.sort((a,b)=>a-b);results.push({concurrency,requests:100,p50Ms:times[49],p95Ms:times[94],p99Ms:times[98],requestsPerSecond:100000/(performance.now()-start),mongoReadCommands:readCommands,mongoReplyBytes:readBytes});}
 const report={recordedAt:new Date(),synthetic:true,hospitals:60,evidenceHistoryEntries:100,endpoint:'/api/hospitals?limit=20',results,qualification:'Single-host loopback API+database; synthetic review-heavy evidence. Not hosted latency or capacity. No production data.'};
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));
}finally{if(server)await new Promise(resolve=>server.close(resolve));if(owned&&await mongoose.connection.db.collection('_benchmark_owner').findOne({marker}))await mongoose.connection.dropDatabase();await mongoose.disconnect();}
