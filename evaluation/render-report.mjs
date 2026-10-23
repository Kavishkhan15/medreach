// Produce a curated, non-sensitive Markdown report from completed hosted evidence.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const load=name=>JSON.parse(readFileSync(`${root}evaluation/results/${name}.json`,'utf8'));
const hosted=load('hosted'), security=load('hosted-security'), audit=load('security'), lighthouse=load('lighthouse');
if(!hosted.summary?.length||hosted.observations.length!==180||lighthouse.reports.length!==6||lighthouse.reports.some(r=>r.status!=='measured'))throw new Error('Hosted evidence is incomplete; do not publish a completed evaluation.');
const cell=value=>String(value??'Not measured').replaceAll('|','/').replaceAll('\n',' ');
const ms=value=>Number.isFinite(value)?(value/1000).toFixed(2)+' s':'Not measured';
const number=value=>Number.isFinite(value)?value.toFixed(3):'Not measured';
const expected401=hosted.observations.flatMap(row=>row.httpErrors).filter(e=>e.status===401&&e.url.endsWith('/api/auth/me')).length;
const unexpected=hosted.observations.flatMap(row=>row.httpErrors.filter(e=>!(e.status===401&&e.url.endsWith('/api/auth/me'))).map(e=>({...e,variant:row.variant,route:row.route})));
const runtime=hosted.observations.reduce((n,row)=>n+row.runtimeErrorCount,0);
const failedRequests=hosted.observations.reduce((n,row)=>n+row.failedRequests.length,0);
const failures=hosted.observations.filter(row=>row.status!==200);
const overflows=hosted.observations.filter(row=>(row.measurements?.horizontalOverflowPx??0)>0);
const lines=[
  '# Hosted MedReach evaluation', '', '[Evaluation guide](README.md) · [Project overview](../README.md)', '',
  `Repeated navigation measurements collected **${hosted.startedAt} → ${hosted.finishedAt}**. The measurement tooling is based on repository revision \`${hosted.sourceCommit.slice(0,7)}\` plus the local evaluation changes. Deployed revisions were not independently identified.`, '',
  '## Scope', '',
  'Bootstrap, Tailwind and Skeleton were evaluated at their public Vercel URLs, using the shared Railway API. The owner reports one Atlas database. No direct Atlas access, database changes, account modifications, healthcare submissions, notifications or local application-server measurements were performed.', '',
  ...Object.entries(hosted.targets).map(([name,url])=>`- **${name}:** ${url}`),
  `- **Shared API:** ${hosted.api}`, '',
  `The repeated browser run used ${hosted.observations.length} public page visits: ten routes × three variants × two profiles × three samples. Chrome ${hosted.environment.browser}; ${hosted.environment.platform}/${hosted.environment.arch}; Node ${hosted.environment.node}.`, '',
  'Desktop: 1440×900, no added throttle. Mobile: 390×844, 4× CPU slowdown, 150 ms added latency, 1.6 Mbps download and 0.75 Mbps upload. Fresh contexts; CDN/server caches uncontrolled. Visits observe the initial viewport until 2.5 seconds after load. Fixed interleaved variant order can introduce bias. These repeated navigation/diagnostic runs block non-GET/HEAD browser requests, including automatic refresh POSTs, for safety. Lighthouse observes the natural signed-out refresh behavior separately. These are laboratory observations, not real-user Core Web Vitals.', '',
  '## Lighthouse homepage scores', '',
  `Tool: **${lighthouse.tool}**, collected ${lighthouse.generatedAt} → ${lighthouse.finishedAt}. One diagnostic audit per variant/profile; scores can vary between runs. Performance, accessibility, best-practices and SEO scores are separate categories, not a security certification.`, '',
  '| Variant | Profile | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...lighthouse.reports.map(r=>`| ${r.variant} | ${r.profile} | ${cell(r.scores.performance)} | ${cell(r.scores.accessibility)} | ${cell(r.scores['best-practices'])} | ${cell(r.scores.seo)} | ${ms(r.metrics['largest-contentful-paint'])} | ${ms(r.metrics['total-blocking-time'])} | ${number(r.metrics['cumulative-layout-shift'])} |`), '',
  'Lighthouse uses its own preset and simulation settings, retained in the JSON reports. Its metrics should not be pooled with the separately throttled repeated observations below.', '',
  ...lighthouse.reports.filter(r=>r.warnings?.length).flatMap(r=>[`- **${r.variant} ${r.profile} audit warning:** ${r.warnings.map(cell).join('; ')}`]), '',
  'Any timeout warning means that audit may be incomplete. Preserve the score as an observed diagnostic result, not a definitive ranking; repeat under the same conditions before research conclusions.', '',
  '## Repeated route observations', '',
  'LCP and CLS below are medians of three bounded observations. Mobile p75 with only three samples is the largest sample, not a stable population percentile. INP was not measured because these read-only visits did not perform user interactions.', '',
  '| Route | Variant | Desktop LCP | Mobile LCP | Mobile LCP p75 (n=3) | Mobile CLS |',
  '| --- | --- | ---: | ---: | ---: | ---: |',
];
for(const route of [...new Set(hosted.summary.map(r=>r.route))])for(const variant of Object.keys(hosted.targets)) {
  const desktop=hosted.summary.find(r=>r.variant===variant&&r.route===route&&r.profile==='desktop');
  const mobile=hosted.summary.find(r=>r.variant===variant&&r.route===route&&r.profile==='mobile');
  lines.push(`| ${route} | ${variant} | ${ms(desktop?.metrics.observedLcpMs.median)} | ${ms(mobile?.metrics.observedLcpMs.median)} | ${ms(mobile?.metrics.observedLcpMs.p75)} | ${number(mobile?.metrics.observedCls.median)} |`);
}
lines.push('', '## Public API response timings', '',
  'Three sequential unauthenticated GET samples per endpoint, including body download. This is a small observed sample, not a load test or p95/p99 claim. No returned provider/job documents were retained.', '',
  '| Endpoint | Status codes | Median | p75 (n=3) |', '| --- | --- | ---: | ---: |',
  ...hosted.backend.map(r=>`| \`${r.path}\` | ${r.statuses.join(', ')} | ${ms(r.medianMs)} | ${ms(r.p75Ms)} |`), '',
  '## Passive security evidence', '',
  '| Frontend | Homepage status | Header presence | CORS origin allowed by API |', '| --- | ---: | ---: | --- |',
  ...security.frontends.map(r=>`| ${r.variant} | ${cell(r.status)} | ${r.headerPresenceCount??0}/${r.headerTotal??6} | ${security.cors.find(x=>x.variant===r.variant)?.originMatches?'Yes':'Not confirmed'} |`), '',
  'Headers checked: HSTS, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy. Presence alone does not validate policy strength.', '',
  ...security.frontends.map(r=>`- **${r.variant} CSP:** ${r.cspScope??'Unavailable'}.`), '',
  ...security.protectedEndpoints.map(r=>`- Unauthenticated \`${r.path}\`: HTTP **${cell(r.status)}**; denial ${r.unauthenticatedDenied?'confirmed':'not confirmed'}.`), '',
  `Repository dependency audit: **${audit.status}**, ${audit.counts?.total??'unknown'} known vulnerabilities (${audit.generatedAt}). This audits lockfile \`${audit.lockfileSha256}\`; deployed dependencies were not independently inventoried.`, '',
  '**Composite security safety score: not measured.** The prior hardcoded example inputs have been removed. Public headers and a dependency audit do not provide all eight required measured dimensions. No active exploit scans, authenticated cross-provider tests, production cookie/session tests, email tests or Atlas security/configuration review were performed.', '',
  '## Runtime and layout findings', '',
  `- Public page visits: **${hosted.observations.length-failures.length}/${hosted.observations.length} HTTP 200**.`,
  `- JavaScript runtime exceptions observed: **${runtime}**.`,
  `- Unexpected HTTP error responses: **${unexpected.length}**.`,
  `- Request-failure events recorded: **${failedRequests}**. This initial collector retained URL paths but not error reasons; navigation/prefetch/context-close aborts cannot be distinguished from network failures from these records alone. They are not counted as confirmed service outages.`,
  `- Expected signed-out auth checks: **${expected401} HTTP 401** responses from \`/api/auth/me\`.`,
  `- Samples with measured horizontal overflow: **${overflows.length}**.`, '',
);
if(unexpected.length) lines.push(...unexpected.slice(0,10).map(r=>`- ${r.variant} ${r.route}: HTTP ${r.status} at ${r.url}`),'');
if(overflows.length)lines.push(...overflows.slice(0,10).map(r=>`- Overflow: ${r.variant} ${r.profile} ${r.route}, ${r.measurements.horizontalOverflowPx}px.`),'');
const cookieSources=new Set();
const unfinishedRequests=new Map();
for(const report of lighthouse.reports) {
  const raw=JSON.parse(readFileSync(`${root}${report.json}`,'utf8'));
  for(const item of raw.audits?.['network-requests']?.details?.items??[]) {
    if(!item.finished&&item.url){const url=new URL(item.url);const key=`${url.origin}${url.pathname} (HTTP ${item.statusCode})`;unfinishedRequests.set(key,(unfinishedRequests.get(key)||0)+1);}
  }
  for(const item of raw.audits?.['third-party-cookies']?.details?.items??[]) {
    if(item.url)cookieSources.add(`${item.name} at ${new URL(item.url).origin}`);
  }
}
if(cookieSources.size)lines.push('### Cross-site cookie and console findings', '',
  ...[...cookieSources].map(source=>`- Lighthouse cookie observation: **${source}** (cookie values are not published).`), '',
  'The API and frontend use different site domains. These observations concern API authentication cookies, not proof of tracking or an authentication bypass. Signed-in behavior with third-party cookie blocking was not tested. Assess a same-site frontend/API domain arrangement before relying on cross-site cookies across all browsers.', '',
  'Lighthouse console warnings include signed-out 401 responses. They can lower the best-practices grade even when access denial is expected; they are distinct from JavaScript runtime exceptions and provider-data API failures.', '');
if(unfinishedRequests.size)lines.push('### Lighthouse load-timeout investigation', '',
  ...[...unfinishedRequests].map(([request,count])=>`- **${request}** was marked unfinished at capture time in **${count}/6** audits.`), '',
  'All six audits reported a load-time warning. The shared unfinished refresh request is a candidate for follow-up; its presence does not prove that the backend took 45 seconds or establish the exact cause. Review guest-session probing and refresh response completion before using these scores as stable research rankings. The underlying authentication behavior was not changed.', '');
const diagnosticsPath=`${root}evaluation/results/network-diagnostics.json`;
if(existsSync(diagnosticsPath)) {
  const diagnostic=JSON.parse(readFileSync(diagnosticsPath,'utf8'));
  const failures=diagnostic.observations.flatMap(r=>r.failures);
  const apiFailures=diagnostic.observations.flatMap(r=>r.apiResponses).filter(r=>r.status>=400&&!(r.status===401&&r.url.endsWith('/api/auth/me')));
  lines.push('### Longer network follow-up', '',
    `${diagnostic.observations.length} additional hospital/emergency visits observed for eight seconds after load. ${diagnostic.observations.filter(r=>r.status===200).length} returned HTTP 200.`, '',
    `- Failures before closing: **${failures.filter(r=>r.phase==='observation').length}**.`,
    `- Failures during test cleanup: **${failures.filter(r=>r.phase==='cleanup').length}**.`,
    `- Recorded browser reasons: ${[...new Set(failures.map(r=>r.reason))].join(', ') || 'none'}.`,
    `- Unexpected Railway HTTP errors during this follow-up: **${apiFailures.length}**.`,
    'The observed aborts were hospital detail-page requests in desktop directory views. This is consistent with client prefetch cancellation; it does not establish a provider API outage.',
    'Client aborts and cleanup cancellations do not by themselves establish a service outage. This follow-up does not retroactively classify every event in the first run.', '');
}
const slow=hosted.summary.filter(r=>r.profile==='mobile'&&r.metrics.observedLcpMs.median>2500).sort((a,b)=>b.metrics.observedLcpMs.median-a.metrics.observedLcpMs.median);
lines.push('## Improvement priorities', '', ...(slow.length?slow.slice(0,6).map(r=>`- Investigate mobile rendering on **${r.variant} ${r.route}**: observed median LCP ${ms(r.metrics.observedLcpMs.median)}.`):['- No mobile route median exceeded 2.5 seconds in this bounded repeated run; inspect individual samples and Lighthouse findings before drawing conclusions.']));
const recurring=new Map();
for(const report of lighthouse.reports)for(const audit of report.failedAudits){const row=recurring.get(audit.id)||{title:audit.title,count:0};row.count++;recurring.set(audit.id,row);}
lines.push('', 'Recurring Lighthouse findings (diagnostic audits with a score below 1):', '', ...[...recurring.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,12).map(([id,r])=>`- **${r.title}** (\`${id}\`): ${r.count}/6 audits.`), '',
  'Prioritize the actual failed audit details and repeat measurements after changes. Do not infer that framework choice alone caused differences. No product or hosting configuration was changed by this evaluation.', '',
  '## Evidence and reproduction', '',
  'Raw JSON/HTML reports are stored locally in ignored `evaluation/results/`. Run the commands in the [evaluation guide](README.md) to regenerate them. The aggregate summary preserves source timestamps and leaves missing axes explicitly unmeasured. Resource Timing byte totals may be incomplete for cross-origin resources.', '',
  'No commit, push or deployment was performed for these evaluation changes.', '',
  'References: [Lighthouse CLI and categories](https://github.com/GoogleChrome/lighthouse), [CLS definition](https://web.dev/articles/cls), [INP measurement limits](https://web.dev/articles/inp).', '');
writeFileSync(`${root}evaluation/HOSTED_RESULTS.md`,lines.join('\n'));
console.log('Wrote evaluation/HOSTED_RESULTS.md from completed hosted evidence.');
