// Passive public checks only: no credentials, payload injection, forms or writes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const targets={bootstrap:'https://medreachmumbai.vercel.app',tailwind:'https://medreach-tailwind.vercel.app',skeleton:'https://medreach-skeleton.vercel.app'};
const api='https://medreach-production.up.railway.app';
const headers=['strict-transport-security','content-security-policy','x-frame-options','x-content-type-options','referrer-policy','permissions-policy'];
const evidence={generatedAt:new Date().toISOString(),scope:'Passive unauthenticated GETs only; no exploit, authentication, tenant-isolation, TLS-configuration or Atlas-configuration testing',frontends:[],cors:[],protectedEndpoints:[]};
async function get(url,origin) {
  const response=await fetch(url,{headers:origin?{Origin:origin}:{},signal:AbortSignal.timeout(30000),redirect:'manual'});
  // Consume without retaining documents or private values.
  await response.arrayBuffer();
  return {status:response.status,headers:response.headers};
}
for(const [variant,base] of Object.entries(targets)) {
  try {
    const response=await get(base+'/');
    const present=Object.fromEntries(headers.map(key=>[key,response.headers.get(key)]));
    evidence.frontends.push({variant,url:base,status:response.status,headers:present,headerPresenceCount:headers.filter(key=>present[key]).length,headerTotal:headers.length,
      cspScope:present['content-security-policy']?.includes('script-src')?'script-src present; policy strength requires review':'No script-src observed; this is not a strict nonce-based script CSP'});
  } catch { evidence.frontends.push({variant,status:null,error:'Request unavailable; no security pass can be inferred'}); }
  try {
    const cors=await get(api+'/api/hospitals?limit=1',base);
    evidence.cors.push({variant,status:cors.status,allowedOrigin:cors.headers.get('access-control-allow-origin'),credentials:cors.headers.get('access-control-allow-credentials'),originMatches:cors.headers.get('access-control-allow-origin')===base});
  } catch { evidence.cors.push({variant,status:null,originMatches:false,error:'CORS response unavailable'}); }
}
for(const path of ['/api/admin/users','/api/admin/provider-accounts','/api/admin/provider-approvals']) {
  try { const response=await get(api+path); evidence.protectedEndpoints.push({path,status:response.status,unauthenticatedDenied:[401,403].includes(response.status)}); }
  catch { evidence.protectedEndpoints.push({path,status:null,unauthenticatedDenied:null}); }
}
const dir=fileURLToPath(new URL('../results/',import.meta.url));mkdirSync(dir,{recursive:true});writeFileSync(dir+'hosted-security.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
if(evidence.frontends.some(r=>r.status!==200)||evidence.cors.some(r=>!r.originMatches)||evidence.protectedEndpoints.some(r=>r.unauthenticatedDenied!==true)) process.exitCode=1;
