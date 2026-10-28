import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {runReadinessProbe} from "../scripts/probeHostedReadiness.js";
test("external readiness detects database outage without MongoDB and deduplicates recovery alerts",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"medreach-probe-test-"));
 try{
  let ready=false,sends=0;const options={url:"https://controlled.example/health/ready",webhookUrl:"https://monitor.example/receive",webhookSecret:"a".repeat(32),statePath:join(directory,"state.json"),fetchImpl:async(_url,request)=>{
   if(request.method==="POST"){sends++;assert.match(request.headers["X-MedReach-Signature"],/^v1=/);return {ok:true};}
   return {ok:ready,json:async()=>({ok:true,check:"readiness"})};
  }};
  assert.equal((await runReadinessProbe(options)).ready,false);assert.equal(sends,1);
  await runReadinessProbe(options);assert.equal(sends,1);
  ready=true;assert.equal((await runReadinessProbe(options)).ready,true);assert.equal(sends,2);
  await runReadinessProbe(options);assert.equal(sends,2);
  ready=false;options.fetchImpl=async(_url,request)=>request.method==="POST"?{ok:false}:{ok:false};
  for(let index=0;index<8;index++)await runReadinessProbe(options);
  const state=JSON.parse(await readFile(options.statePath,"utf8"));assert.equal(state.pending.attempts,5);
  assert.equal((await runReadinessProbe(options)).alert,"exhausted");
 }finally{await rm(directory,{recursive:true,force:true});}
});
test("external readiness refuses credentials, insecure transport and liveness-only success",async()=>{
 await assert.rejects(()=>runReadinessProbe({url:"http://example.org/health/ready"}),/CONFIG_INVALID/);
 await assert.rejects(()=>runReadinessProbe({url:"https://user:secret@example.org/health/ready"}),/CONFIG_INVALID/);
 assert.equal((await runReadinessProbe({url:"https://example.org/health/ready",fetchImpl:async()=>({ok:true,json:async()=>({ok:true,check:"liveness"})})})).ready,false);
});
