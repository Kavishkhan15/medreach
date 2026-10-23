// Follow up transient request failures without submitting forms or retaining response bodies.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const targets={bootstrap:'https://medreachmumbai.vercel.app',tailwind:'https://medreach-tailwind.vercel.app',skeleton:'https://medreach-skeleton.vercel.app'};
const clean=value=>{const u=new URL(value);return u.origin+u.pathname;};
const report={startedAt:new Date().toISOString(),scope:'Diagnostic rechecks of hospital/emergency pages, eight seconds after load; no performance scores',observations:[]};
const browser=await chromium.launch({channel:process.env.MEDREACH_PLAYWRIGHT_CHANNEL||'chrome',headless:true});
try {
  for(const profile of ['desktop','mobile'])for(const route of ['/hospitals','/emergency'])for(const [variant,base] of Object.entries(targets)) {
    const mobile=profile==='mobile';
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
    await context.route('**/*',handler=>['GET','HEAD'].includes(handler.request().method())?handler.continue():handler.abort());
    const page=await context.newPage();
    if(mobile){const session=await context.newCDPSession(page);await session.send('Network.enable');await session.send('Emulation.setCPUThrottlingRate',{rate:4});await session.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});}
    let phase='observation';
    const row={variant,profile,route,status:null,failures:[],apiResponses:[],runtimeErrors:0};
    page.on('requestfailed',request=>{if(['GET','HEAD'].includes(request.method()))row.failures.push({url:clean(request.url()),reason:request.failure()?.errorText?.match(/net::[A-Z_]+/)?.[0]||'unknown',phase});});
    page.on('response',response=>{if(new URL(response.url()).origin==='https://medreach-production.up.railway.app')row.apiResponses.push({url:clean(response.url()),status:response.status()});});
    page.on('pageerror',()=>row.runtimeErrors++);
    try{const response=await page.goto(base+route,{waitUntil:'load',timeout:45000});row.status=response?.status();await page.waitForTimeout(8000);}catch(error){row.errorType=error.name;}
    phase='cleanup';await context.close();report.observations.push(row);
    console.log(`${variant} ${profile} ${route}: ${row.status}; failures before close ${row.failures.filter(f=>f.phase==='observation').length}`);
  }
} finally{await browser.close();report.finishedAt=new Date().toISOString();const dir=`${root}evaluation/results`;mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/network-diagnostics.json`,JSON.stringify(report,null,2)+'\n');}
