import {createHmac,randomUUID} from "node:crypto";
import {readFile,writeFile,rename} from "node:fs/promises";
import {pathToFileURL} from "node:url";
function trustedHttps(value){let url;try{url=new URL(value);}catch{throw Error("PROBE_CONFIG_INVALID");}if(url.protocol!=="https:"||url.username||url.password||url.hash)throw Error("PROBE_CONFIG_INVALID");return url.href;}
async function save(path,state){const temporary=`${path}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(state),{mode:0o600,flag:"wx"});await rename(temporary,path);}
// Run from an independent host/scheduler. This tool has no MongoDB dependency.
export async function runReadinessProbe({url,probeId="medreach-api",webhookUrl,webhookSecret,statePath,fetchImpl=fetch,now=new Date()}={}){
 const target=trustedHttps(url);if(!/^[a-zA-Z0-9_-]{1,80}$/.test(probeId))throw Error("PROBE_CONFIG_INVALID");
 if((webhookUrl||webhookSecret)&&(!webhookUrl||!webhookSecret||webhookSecret.length<32||!statePath))throw Error("PROBE_CONFIG_INVALID");
 if(webhookUrl)trustedHttps(webhookUrl);
 let state={schemaVersion:1,sequence:0,lastObserved:"unknown"};
 if(statePath)try{state=JSON.parse(await readFile(statePath,"utf8"));if(state.schemaVersion!==1||!Number.isSafeInteger(state.sequence))throw Error("PROBE_STATE_INVALID");}catch(error){if(error.code!=="ENOENT")throw Error("PROBE_STATE_INVALID",{cause:error});}
 let ready=false;
 try{const response=await fetchImpl(target,{redirect:"error",signal:AbortSignal.timeout(10000)});const body=response.ok?await response.json():null;ready=response.ok&&body?.ok===true&&body?.check==="readiness";}catch{/* Report safe status only, never response bodies or credentials. */}
 const status=ready?"ready":"unavailable";
 if(status!==state.lastObserved){
  state.sequence++;state.lastObserved=status;
  if(status==="unavailable"||state.sequence>1)state.pending={eventId:`${probeId}:${state.sequence}`,probeId,sequence:state.sequence,status,occurredAt:now.toISOString(),attempts:0};
  if(statePath)await save(statePath,state);
 }
 let alert="not_configured";
 if(webhookUrl&&state.pending){
  if(state.pending.attempts>=5)alert="exhausted";
  else{
   // Persist the consumed attempt before the external effect. Receiver must
   // deduplicate eventId after a crash between acceptance and local commit.
   state.pending.attempts++;await save(statePath,state);
   const {attempts:_,...event}=state.pending;const body=JSON.stringify(event);const timestamp=String(Math.floor(now.getTime()/1000));
   const signature=`v1=${createHmac("sha256",webhookSecret).update(`${timestamp}.${body}`).digest("hex")}`;
   let accepted=false;
   try{const response=await fetchImpl(webhookUrl,{method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),headers:{"Content-Type":"application/json","Idempotency-Key":event.eventId,"X-MedReach-Timestamp":timestamp,"X-MedReach-Signature":signature},body});accepted=response.ok;await response.body?.cancel?.();}catch{/* Safe bounded retry on the next scheduled run. */}
   alert=accepted?"accepted":state.pending.attempts>=5?"exhausted":"retry_pending";
   if(accepted)delete state.pending;await save(statePath,state);
  }
 }else if(webhookUrl)alert="unchanged";
 return {ready,alert,checkedAt:now.toISOString()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{
 const result=await runReadinessProbe({url:process.env.MEDREACH_PROBE_READY_URL,probeId:process.env.MEDREACH_PROBE_ID,webhookUrl:process.env.MEDREACH_PROBE_WEBHOOK_URL,webhookSecret:process.env.MEDREACH_PROBE_WEBHOOK_SECRET,statePath:process.env.MEDREACH_PROBE_STATE_PATH});
 console.log(JSON.stringify({event:"external_readiness_probe",...result}));if(!result.ready||["exhausted","retry_pending"].includes(result.alert))process.exitCode=1;
}catch{console.error(JSON.stringify({event:"external_readiness_probe",code:"PROBE_FAILED"}));process.exitCode=1;}}
