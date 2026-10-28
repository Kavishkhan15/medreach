import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { BackendLatencyBucket } from '../models/BackendLatencyBucket.js';

export const LATENCY_BOUNDS_MS=Object.freeze([1,5,10,25,50,100,250,500,1000,2500,5000,10000,30000,60000,Infinity]);
const namespaces=new Set(['auth','hospitals','availability','inventory','emergency-coordination','blood-campaigns','organization-applications','admin','hospital-admin','providers','provider-imports','provider-adoption','privacy','integrations','contracts','emergency-requests','blood-banks','blood-requests','diagnostics','ambulances','jobs','applications','organizations','alerts','users','assistant','tracking','routing','analytics','email']);
// Only these code-owned mount names may distinguish nested routers. Match the
// longest fixed name first, never copy dynamic segments from the request URL.
const nestedMounts=Object.freeze(['/api/admin/hospital-enrichment','/api/admin/backend-metrics','/api/admin/provider-accounts','/api/admin/provider-approvals','/api/admin/backend','/api/admin/resources','/api/admin/refinement','/api/blood-banks/campaigns','/api/webhooks/resend'].sort((left,right)=>right.length-left.length));
const stageNames=new Set(['directoryQueryMs','evidenceMs','availabilityFilterMs']);
const dbCommands=new Set(['find','aggregate','getMore','insert','update','delete','findAndModify','count','distinct']);
const methods=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
export const backendMetricsEnabled=()=>process.env.BACKEND_METRICS_ENABLED==='true';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function metricRoute(req){
 const template=req.route?.path;
 if(typeof template!=='string'||template.length>160||!/^\/[A-Za-z0-9_/:.-]*$/.test(template))return '<unmatched>';
 const originalUrl=typeof req.originalUrl==='string'?req.originalUrl:'';
 const nested=nestedMounts.find(base=>originalUrl===base||originalUrl.startsWith(`${base}/`)||originalUrl.startsWith(`${base}?`));
 if(nested)return `${nested}${template==='/'?'':template}`;
 const namespace=/^\/api\/([a-z-]+)(?:[/?]|$)/.exec(originalUrl)?.[1];
 if(namespace&&namespaces.has(namespace)){
  return `/api/${namespace}${template==='/'?'':template}`;
 }
 if(/^\/health(?:[/?]|$)/.test(originalUrl))return `/health${template==='/'?'':template}`;
 return '<unmatched>';
}
function normalise(input){
 if(!input||!['request','stage','database','pool','telemetry'].includes(input.kind)||typeof input.metric!=='string'||!/^\w{1,60}$/.test(input.metric))return null;
 const duration=Number(input.durationMs);if(!Number.isFinite(duration)||duration<0)return null;
 const route=typeof input.route==='string'&&input.route.length<=240&&/^(?:\/[A-Za-z0-9_/:.-]*|<unmatched>|<system>)$/.test(input.route)?input.route:'<system>';
 return {kind:input.kind,metric:input.metric,route,method:methods.has(input.method)?input.method:'-',statusClass:/^[1-5]xx$/.test(input.statusClass||'')?input.statusClass:'-',durationMs:Math.min(duration,300000)};
}
export function histogramQuantile(histogram,count,quantile){
 if(!count)return null;let cumulative=0;
 for(let i=0;i<LATENCY_BOUNDS_MS.length;i++){cumulative+=Number(histogram?.[`b${i}`]||0);if(cumulative>=Math.ceil(count*quantile))return Number.isFinite(LATENCY_BOUNDS_MS[i])?LATENCY_BOUNDS_MS[i]:null;}
 return null;
}
/** Bounded, best-effort local accumulation; shared storage uses idempotent cumulative snapshots. */
export function createLatencyRecorder({enabled=backendMetricsEnabled,Model=BackendLatencyBucket,capacity=500,now=Date.now,intervalMs=1000,canFlush=()=>true}={}){
 const states=new Map(),instance=randomUUID();let timer=null,inFlight=null,droppedSamples=0,failedFlushes=0,closed=false;
 const enabledNow=()=>!closed&&enabled();
 function record(input,internal=false,weight=1){
  try{
   if(!enabledNow())return false;const event=normalise(input);if(!event)return false;
   const minute=Math.floor(now()/60000)*60000;
   let evicted=0;
   for(const [key,state]of states)if(state.minute<minute-60000){states.delete(key);if(state.flushedVersion!==state.version)evicted+=Math.max(0,state.count-state.flushedCount);}
   if(evicted){droppedSamples+=evicted;record({kind:'telemetry',metric:'evicted_unflushed',durationMs:0},true,evicted);}
   const dimensions={kind:event.kind,metric:event.metric,route:event.route,method:event.method,statusClass:event.statusClass};
   const key=JSON.stringify([minute,dimensions]);let state=states.get(key);
   if(!state){
    const regular=[...states.values()].filter(s=>s.kind!=='telemetry').length;
    if(!internal&&regular>=capacity){droppedSamples++;record({kind:'telemetry',metric:'dropped_samples',durationMs:0},true);return false;}
    // Health buckets are also bounded when a database outage spans many minutes.
    if(states.size>=capacity+4){droppedSamples++;return false;}
    state={...dimensions,minute,_id:hash(`${instance}:${key}`),count:0,sumMs:0,maxMs:0,slowCount:0,histogram:{},version:0,flushedVersion:0,flushedCount:0,failures:0};states.set(key,state);
   }
   state.count+=weight;state.sumMs+=event.durationMs*weight;state.maxMs=Math.max(state.maxMs,event.durationMs);if(event.durationMs>=250)state.slowCount+=weight;
   const bin=LATENCY_BOUNDS_MS.findIndex(bound=>event.durationMs<=bound);state.histogram[`b${bin}`]=(state.histogram[`b${bin}`]||0)+weight;state.version++;state.failures=0;
   if(!timer&&intervalMs>0){timer=setInterval(()=>{void flush();},intervalMs);timer.unref?.();}
   return true;
  }catch{return false;}
 }
 async function flush(){
  if(!enabledNow()||!canFlush())return false;if(inFlight)return inFlight;
  const batch=[...states.values()].filter(s=>s.flushedVersion!==s.version&&s.failures<3).slice(0,100).map(state=>({state,version:state.version,snapshot:{count:state.count,sumMs:state.sumMs,maxMs:state.maxMs,slowCount:state.slowCount,...Object.fromEntries(Object.entries(state.histogram).map(([key,value])=>[`histogram.${key}`,value]))}}));
  if(!batch.length)return false;
  const operations=batch.map(({state,snapshot})=>({updateOne:{filter:{_id:state._id},update:{$setOnInsert:{minute:new Date(state.minute),expiresAt:new Date(state.minute+48*3600000),kind:state.kind,metric:state.metric,route:state.route,method:state.method,statusClass:state.statusClass},$max:snapshot},upsert:true}}));
  inFlight=(async()=>{try{await Promise.resolve().then(()=>Model.bulkWrite(operations,{ordered:false,timeoutMS:1500}));for(const item of batch){item.state.flushedVersion=Math.max(item.state.flushedVersion,item.version);item.state.flushedCount=Math.max(item.state.flushedCount,item.snapshot.count);item.state.failures=0;}return true;}catch{failedFlushes++;for(const item of batch)item.state.failures++;return false;}finally{inFlight=null;}})();
  return inFlight;
 }
 return {record,flush,isFlushing:()=>Boolean(inFlight),status:()=>({enabled:enabledNow(),bufferedKeys:states.size,pendingKeys:[...states.values()].filter(s=>s.flushedVersion!==s.version).length,droppedSamples,failedFlushes,capacity,qualification:'Best-effort telemetry: crashes may lose unflushed samples; counters are not business accounting.'}),close:async()=>{if(timer)clearInterval(timer);await flush();closed=true;states.clear();}};
}
const recorder=createLatencyRecorder({canFlush:()=>mongoose.connection.readyState===1});
export const flushBackendMetrics=()=>recorder.flush();
export const backendMetricBufferStatus=()=>recorder.status();
export function recordRequestMetrics(req,res,durationMs){
 try{
  const route=metricRoute(req),method=req.method,statusClass=`${Math.floor(res.statusCode/100)}xx`;
  recorder.record({kind:'request',metric:'http',route,method,statusClass,durationMs});
  for(const [metric,value]of Object.entries(res.locals?.performance||{}))if(stageNames.has(metric))recorder.record({kind:'stage',metric,route,method,statusClass,durationMs:value});
 }catch{/* Measurement is never allowed to fail a request. */}
}
export function installMongoTelemetry(client,{enabled=backendMetricsEnabled,recorder:target=recorder}={}){
 if(!enabled())return ()=>{};const commands=new Map();
 const started=event=>{if(commands.size>=2000)return;const command=event.command||{};const own=command[event.commandName]===BackendLatencyBucket.collection.name||command.collection===BackendLatencyBucket.collection.name;commands.set(event.requestId,{name:event.commandName,skip:own});};
 const finished=(event,failed=false)=>{const command=commands.get(event.requestId);commands.delete(event.requestId);if(!command||command.skip||!dbCommands.has(command.name))return;target.record({kind:'database',metric:failed?'command_failed':command.name,durationMs:event.duration});};
 const succeeded=event=>finished(event),failed=event=>finished(event,true);
 const checkout=event=>{if(!target.isFlushing?.())target.record({kind:'pool',metric:'checkout',durationMs:event.durationMS});};
 const checkoutFailed=event=>{if(!target.isFlushing?.())target.record({kind:'pool',metric:event.reason==='timeout'?'checkout_timeout':'checkout_failed',durationMs:event.durationMS});};
 for(const [name,handler]of [['commandStarted',started],['commandSucceeded',succeeded],['commandFailed',failed],['connectionCheckedOut',checkout],['connectionCheckOutFailed',checkoutFailed]])client.on(name,handler);
 return ()=>{for(const [name,handler]of [['commandStarted',started],['commandSucceeded',succeeded],['commandFailed',failed],['connectionCheckedOut',checkout],['connectionCheckOutFailed',checkoutFailed]])client.off(name,handler);commands.clear();};
}
export async function readBackendMetrics({minutes=15,now=new Date()}={}){
 const size=Number(minutes);if(!Number.isInteger(size)||size<1||size>60)throw Object.assign(new Error('Metrics window must be 1–60 minutes'),{status:400});
 const histogram=Object.fromEntries(LATENCY_BOUNDS_MS.map((_,i)=>[`b${i}`,{$sum:{$ifNull:[`$histogram.b${i}`,0]}}]));
 const rows=await BackendLatencyBucket.aggregate([{$match:{minute:{$gte:new Date(Math.floor((+now-size*60000)/60000)*60000),$lte:now},expiresAt:{$gt:now}}},{$group:{_id:{kind:'$kind',metric:'$metric',route:'$route',method:'$method',statusClass:'$statusClass'},count:{$sum:'$count'},sumMs:{$sum:'$sumMs'},maxMs:{$max:'$maxMs'},slowCount:{$sum:'$slowCount'},...histogram}},{$sort:{count:-1}},{$limit:201}]).option({maxTimeMS:1500});
 return {enabled:backendMetricsEnabled(),windowMinutes:size,generatedAt:now,retentionHours:48,percentileMethod:'Non-cumulative fixed histogram; values are bucket upper bounds, not exact samples. null with observations means over 60 seconds.',truncated:rows.length>200,data:rows.slice(0,200).map(row=>{const bins=Object.fromEntries(LATENCY_BOUNDS_MS.map((_,i)=>[`b${i}`,row[`b${i}`]||0]));return {...row._id,count:row.count,meanMs:row.count?row.sumMs/row.count:null,maxMs:row.maxMs,slowCount:row.slowCount,p50UpperBoundMs:histogramQuantile(bins,row.count,.5),p95UpperBoundMs:histogramQuantile(bins,row.count,.95),p99UpperBoundMs:histogramQuantile(bins,row.count,.99)};}),localBuffer:backendMetricBufferStatus(),poolMeasurement:'Checkout events concurrent with a metrics flush are excluded to avoid self-measurement feedback.',queueHealthEndpoint:'/api/admin/backend/health'};
}
