// Read-only hosted laboratory observations. No forms, sessions, DB connections or writes.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = fileURLToPath(new URL('../../', import.meta.url));
const targets = {
  bootstrap: 'https://medreachmumbai.vercel.app',
  tailwind: 'https://medreach-tailwind.vercel.app',
  skeleton: 'https://medreach-skeleton.vercel.app',
};
const api = 'https://medreach-production.up.railway.app';
const routes = ['/', '/hospitals', '/emergency', '/blood-banks', '/diagnostics', '/ambulances', '/careers', '/map', '/track', '/login'];
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, cpuRate: 1, latencyMs: 0, downloadBytesPerSecond: -1, uploadBytesPerSecond: -1 },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
    cpuRate: 4, latencyMs: 150, downloadBytesPerSecond: 200000, uploadBytesPerSecond: 93750 },
};
const samples = 3;
const observationMs = 2500;
const headerNames = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cache-control', 'x-vercel-cache', 'content-encoding'];
const cleanUrl = value => { try { const u = new URL(value); return `${u.origin}${u.pathname}`; } catch { return 'invalid-url'; } };
const percentile = (values, q) => { const a = values.filter(Number.isFinite).sort((a,b) => a-b); return a.length ? a[Math.ceil(q*a.length)-1] : null; };
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse','HEAD'], { cwd: root, encoding:'utf8' }).trim(),
  toolSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  lockfileSha256: createHash('sha256').update(readFileSync(`${root}package-lock.json`)).digest('hex'),
  environment: { node: process.version, platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model },
  method: { samples, observationMs, profiles, cache: 'fresh browser context per navigation; CDN/server caches uncontrolled',
    ordering: 'route, profile, repetition, then variant; sequential, no load test',
    scope: 'Unauthenticated initial-viewport lab observations; navigation only. No INP interactions, field data, full-page accessibility audit or active vulnerability scan.',
    transfer: 'Resource Timing transferSize; zero may mean cache or missing cross-origin Timing-Allow-Origin. Not total wire traffic.',
    deployedRevision: 'Not independently verified; local sourceCommit/lockfile identify the measurement tooling only.' },
  targets, api, observations: [], backend: [],
};
const output = `${root}evaluation/results/hosted.json`;
function save() { mkdirSync(`${root}evaluation/results`, { recursive:true }); writeFileSync(output, JSON.stringify(report,null,2)+'\n'); }
const browser = await chromium.launch({ headless:true, channel: process.env.MEDREACH_PLAYWRIGHT_CHANNEL || 'chrome' });
report.environment.browser = browser.version();
try {
  for (const route of routes) for (const [profile, settings] of Object.entries(profiles)) for (let repetition=1; repetition<=samples; repetition++) for (const [variant, base] of Object.entries(targets)) {
    const context = await browser.newContext({ viewport: settings.viewport, isMobile: Boolean(settings.isMobile), hasTouch: Boolean(settings.hasTouch), deviceScaleFactor: settings.deviceScaleFactor || 1, serviceWorkers:'block' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled:true });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate:settings.cpuRate });
    await cdp.send('Network.emulateNetworkConditions', { offline:false, latency:settings.latencyMs, downloadThroughput:settings.downloadBytesPerSecond, uploadThroughput:settings.uploadBytesPerSecond });
    const item = { variant, route, profile, repetition, startedAt:new Date().toISOString(), failedRequests:[], httpErrors:[], runtimeErrorCount:0, blockedWrites:0 };
    await context.route('**/*', async handler => {
      if (!['GET','HEAD'].includes(handler.request().method())) { item.blockedWrites++; return handler.abort('blockedbyclient'); }
      return handler.continue();
    });
    page.on('requestfailed', req => { if (['GET','HEAD'].includes(req.method())) item.failedRequests.push(cleanUrl(req.url())); });
    page.on('response', res => { if (res.status() >= 400) item.httpErrors.push({url:cleanUrl(res.url()), status:res.status()}); });
    page.on('pageerror', () => { item.runtimeErrorCount++; });
    await page.addInitScript(() => {
      window.__medreachLab = { lcp:null, cls:0, longTaskMs:0, supported:PerformanceObserver.supportedEntryTypes };
      const state = window.__medreachLab;
      if (state.supported.includes('largest-contentful-paint')) new PerformanceObserver(list => { for (const e of list.getEntries()) state.lcp=e.startTime; }).observe({type:'largest-contentful-paint', buffered:true});
      let first=0, last=0, sum=0;
      if (state.supported.includes('layout-shift')) new PerformanceObserver(list => { for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        if (sum && e.startTime-last<1000 && e.startTime-first<5000) sum+=e.value;
        else { first=e.startTime; sum=e.value; }
        last=e.startTime; state.cls=Math.max(state.cls,sum);
      }}).observe({type:'layout-shift', buffered:true});
      if (state.supported.includes('longtask')) new PerformanceObserver(list => { for (const e of list.getEntries()) state.longTaskMs+=e.duration; }).observe({type:'longtask', buffered:true});
    });
    try {
      const response = await page.goto(`${base}${route}`, { waitUntil:'load', timeout:45000 });
      item.status = response?.status() ?? null;
      item.finalUrl = cleanUrl(page.url());
      const headers = await response?.allHeaders() || {};
      item.headers = Object.fromEntries(headerNames.map(name => [name, headers[name] ?? null]));
      await page.waitForTimeout(observationMs);
      item.measurements = await page.evaluate(() => {
        const state=window.__medreachLab, nav=performance.getEntriesByType('navigation')[0], resources=performance.getEntriesByType('resource');
        return {
          ttfbMs:nav ? nav.responseStart-nav.startTime : null,
          fcpMs:performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
          observedLcpMs:state.lcp, observedCls:state.supported.includes('layout-shift') ? state.cls : null,
          observedLongTaskMs:state.supported.includes('longtask') ? state.longTaskMs : null, inpMs:null,
          loadMs:nav?.loadEventEnd || null, resourceCount:resources.length,
          reportedTransferBytes:resources.reduce((n,e)=>n+e.transferSize,nav?.transferSize || 0),
          zeroTransferResources:resources.filter(e=>!e.transferSize).length,
          h1Count:document.querySelectorAll('h1').length,
          horizontalOverflowPx:Math.max(0,document.documentElement.scrollWidth-innerWidth),
          apiOrigins:[...new Set(resources.filter(e=>e.name.includes('/api/')).map(e=>new URL(e.name).origin))],
        };
      });
    } catch (error) { item.errorType=error.name; item.status ??= null; }
    report.observations.push(item); save();
    console.log(`${variant} ${profile} ${route} #${repetition}: HTTP ${item.status ?? 'unavailable'} LCP ${item.measurements?.observedLcpMs?.toFixed(0) ?? 'unmeasured'}ms`);
    await context.close();
  }
  // Public, read-only shared API checks. No returned documents or private values are retained.
  const request = await browser.newContext();
  for (const path of ['/health/ready','/api/hospitals?limit=1','/api/blood-banks?limit=1','/api/diagnostics?limit=1','/api/ambulances?limit=1','/api/jobs?limit=1']) {
    const timings=[]; const statuses=[];
    for(let i=0;i<3;i++) { const start=performance.now(); try { const res=await request.request.get(api+path,{timeout:30000}); statuses.push(res.status()); await res.body(); timings.push(performance.now()-start); await res.dispose(); } catch { statuses.push(null); } }
    report.backend.push({path,statuses,completedSamples:timings.length,medianMs:percentile(timings,.5),p75Ms:percentile(timings,.75)});
  }
  await request.close();
} finally { report.finishedAt=new Date().toISOString(); save(); await browser.close(); }
report.summary=[];
for(const variant of Object.keys(targets)) for(const profile of Object.keys(profiles)) for(const route of routes) {
  const rows=report.observations.filter(r=>r.variant===variant&&r.profile===profile&&r.route===route);
  const successful=rows.filter(r=>r.status===200&&r.measurements);
  const metrics={};
  for(const metric of ['ttfbMs','fcpMs','observedLcpMs','observedCls','reportedTransferBytes','horizontalOverflowPx']) metrics[metric]={median:percentile(successful.map(r=>r.measurements[metric]),.5),p75:percentile(successful.map(r=>r.measurements[metric]),.75)};
  report.summary.push({variant,profile,route,samples:rows.length,successfulSamples:successful.length,metrics});
}
report.validity={allNavigations200:report.observations.every(r=>r.status===200),allBackend200:report.backend.every(r=>r.statuses.every(s=>s===200)),runtimeErrors:report.observations.reduce((n,r)=>n+r.runtimeErrorCount,0),httpErrors:report.observations.reduce((n,r)=>n+r.httpErrors.length,0)};
save();
console.log(`Saved ${output}`);
if(!report.validity.allNavigations200 || !report.validity.allBackend200) process.exitCode=1;
