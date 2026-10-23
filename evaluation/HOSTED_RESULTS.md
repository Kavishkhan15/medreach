# Hosted MedReach evaluation

[Evaluation guide](README.md) · [Project overview](../README.md)

Repeated navigation measurements collected **2026-10-23T11:13:07.089Z → 2026-10-23T11:29:48.161Z**. The measurement tooling is based on repository revision `2a2f24d` plus the local evaluation changes. Deployed revisions were not independently identified.

## Scope

Bootstrap, Tailwind and Skeleton were evaluated at their public Vercel URLs, using the shared Railway API. The owner reports one Atlas database. No direct Atlas access, database changes, account modifications, healthcare submissions, notifications or local application-server measurements were performed.

- **bootstrap:** https://medreachmumbai.vercel.app
- **tailwind:** https://medreach-tailwind.vercel.app
- **skeleton:** https://medreach-skeleton.vercel.app
- **Shared API:** https://medreach-production.up.railway.app

The repeated browser run used 180 public page visits: ten routes × three variants × two profiles × three samples. Chrome 155.0.8059.84; linux/x64; Node v24.22.1.

Desktop: 1440×900, no added throttle. Mobile: 390×844, 4× CPU slowdown, 150 ms added latency, 1.6 Mbps download and 0.75 Mbps upload. Fresh contexts; CDN/server caches uncontrolled. Visits observe the initial viewport until 2.5 seconds after load. Fixed interleaved variant order can introduce bias. These repeated navigation/diagnostic runs block non-GET/HEAD browser requests, including automatic refresh POSTs, for safety. Lighthouse observes the natural signed-out refresh behavior separately. These are laboratory observations, not real-user Core Web Vitals.

## Lighthouse homepage scores

Tool: **Lighthouse 13.5.0**, collected 2026-10-23T11:30:02.653Z → 2026-10-23T11:36:33.829Z. One diagnostic audit per variant/profile; scores can vary between runs. Performance, accessibility, best-practices and SEO scores are separate categories, not a security certification.

| Variant | Profile | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bootstrap | mobile | 73 | 96 | 73 | 100 | 3.81 s | 0.32 s | 0.034 |
| tailwind | mobile | 70 | 96 | 73 | 100 | 3.38 s | 0.62 s | 0.034 |
| skeleton | mobile | 82 | 96 | 73 | 100 | 2.56 s | 0.44 s | 0.030 |
| bootstrap | desktop | 83 | 96 | 73 | 100 | 1.91 s | 0.00 s | 0.021 |
| tailwind | desktop | 84 | 96 | 73 | 100 | 1.89 s | 0.00 s | 0.022 |
| skeleton | desktop | 89 | 96 | 73 | 100 | 1.51 s | 0.00 s | 0.019 |

Lighthouse uses its own preset and simulation settings, retained in the JSON reports. Its metrics should not be pooled with the separately throttled repeated observations below.

- **bootstrap mobile audit warning:** The page loaded too slowly to finish within the time limit. Results may be incomplete.
- **tailwind mobile audit warning:** The page loaded too slowly to finish within the time limit. Results may be incomplete.
- **skeleton mobile audit warning:** The page loaded too slowly to finish within the time limit. Results may be incomplete.
- **bootstrap desktop audit warning:** The page loaded too slowly to finish within the time limit. Results may be incomplete.
- **tailwind desktop audit warning:** The page loaded too slowly to finish within the time limit. Results may be incomplete.
- **skeleton desktop audit warning:** The page loaded too slowly to finish within the time limit. Results may be incomplete.

Any timeout warning means that audit may be incomplete. Preserve the score as an observed diagnostic result, not a definitive ranking; repeat under the same conditions before research conclusions.

## Repeated route observations

LCP and CLS below are medians of three bounded observations. Mobile p75 with only three samples is the largest sample, not a stable population percentile. INP was not measured because these read-only visits did not perform user interactions.

| Route | Variant | Desktop LCP | Mobile LCP | Mobile LCP p75 (n=3) | Mobile CLS |
| --- | --- | ---: | ---: | ---: | ---: |
| / | bootstrap | 1.84 s | 1.84 s | 5.05 s | 0.033 |
| / | tailwind | 1.70 s | 1.51 s | 1.55 s | 0.033 |
| / | skeleton | 1.53 s | 1.49 s | 1.71 s | 0.030 |
| /hospitals | bootstrap | 1.94 s | 1.95 s | 1.97 s | 0.033 |
| /hospitals | tailwind | 1.73 s | 1.99 s | 6.61 s | 0.033 |
| /hospitals | skeleton | 3.92 s | 1.47 s | 1.52 s | 0.030 |
| /emergency | bootstrap | 1.82 s | 1.80 s | 1.81 s | 0.033 |
| /emergency | tailwind | 1.20 s | 1.34 s | 1.66 s | 0.033 |
| /emergency | skeleton | 1.23 s | 1.65 s | 1.94 s | 0.030 |
| /blood-banks | bootstrap | 1.64 s | 1.87 s | 1.99 s | 0.048 |
| /blood-banks | tailwind | 1.69 s | 1.35 s | 1.52 s | 0.093 |
| /blood-banks | skeleton | 2.01 s | 1.47 s | 1.92 s | 0.097 |
| /diagnostics | bootstrap | 1.96 s | 1.76 s | 1.77 s | 0.078 |
| /diagnostics | tailwind | 3.99 s | 4.50 s | 4.72 s | 0.078 |
| /diagnostics | skeleton | 4.20 s | 4.39 s | 4.50 s | 0.100 |
| /ambulances | bootstrap | 1.70 s | 1.78 s | 1.96 s | 0.078 |
| /ambulances | tailwind | 3.50 s | 1.51 s | 2.16 s | 0.078 |
| /ambulances | skeleton | 3.32 s | 1.47 s | 1.62 s | 0.100 |
| /careers | bootstrap | 1.60 s | 1.64 s | 2.70 s | 0.033 |
| /careers | tailwind | 1.76 s | 1.34 s | 1.50 s | 0.033 |
| /careers | skeleton | 1.92 s | 1.47 s | 2.08 s | 0.089 |
| /map | bootstrap | 1.61 s | 2.22 s | 2.53 s | 0.033 |
| /map | tailwind | 1.35 s | 1.34 s | 1.90 s | 0.045 |
| /map | skeleton | 1.68 s | 1.50 s | 2.02 s | 0.030 |
| /track | bootstrap | 1.97 s | 1.76 s | 2.23 s | 0.033 |
| /track | tailwind | 1.91 s | 1.50 s | 1.97 s | 0.033 |
| /track | skeleton | 1.87 s | 1.46 s | 2.08 s | 0.030 |
| /login | bootstrap | 1.63 s | 1.78 s | 2.03 s | 0.033 |
| /login | tailwind | 1.88 s | 2.05 s | 2.11 s | 0.033 |
| /login | skeleton | 1.54 s | 1.63 s | 1.87 s | 0.030 |

## Public API response timings

Three sequential unauthenticated GET samples per endpoint, including body download. This is a small observed sample, not a load test or p95/p99 claim. No returned provider/job documents were retained.

| Endpoint | Status codes | Median | p75 (n=3) |
| --- | --- | ---: | ---: |
| `/health/ready` | 200, 200, 200 | 0.28 s | 1.49 s |
| `/api/hospitals?limit=1` | 200, 200, 200 | 1.05 s | 3.87 s |
| `/api/blood-banks?limit=1` | 200, 200, 200 | 0.75 s | 0.76 s |
| `/api/diagnostics?limit=1` | 200, 200, 200 | 1.05 s | 1.06 s |
| `/api/ambulances?limit=1` | 200, 200, 200 | 0.68 s | 0.68 s |
| `/api/jobs?limit=1` | 200, 200, 200 | 2.26 s | 2.49 s |

## Passive security evidence

| Frontend | Homepage status | Header presence | CORS origin allowed by API |
| --- | ---: | ---: | --- |
| bootstrap | 200 | 6/6 | Yes |
| tailwind | 200 | 6/6 | Yes |
| skeleton | 200 | 6/6 | Yes |

Headers checked: HSTS, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy. Presence alone does not validate policy strength.

- **bootstrap CSP:** No script-src observed; this is not a strict nonce-based script CSP.
- **tailwind CSP:** No script-src observed; this is not a strict nonce-based script CSP.
- **skeleton CSP:** No script-src observed; this is not a strict nonce-based script CSP.

- Unauthenticated `/api/admin/users`: HTTP **401**; denial confirmed.
- Unauthenticated `/api/admin/provider-accounts`: HTTP **401**; denial confirmed.
- Unauthenticated `/api/admin/provider-approvals`: HTTP **401**; denial confirmed.

Repository dependency audit: **passed**, 0 known vulnerabilities (2026-10-23T11:15:02.756Z). This audits lockfile `d19d86416359d1196f74e036441d3c8121151b797d82cda8596f45885ffeb3b3`; deployed dependencies were not independently inventoried.

**Composite security safety score: not measured.** The prior hardcoded example inputs have been removed. Public headers and a dependency audit do not provide all eight required measured dimensions. No active exploit scans, authenticated cross-provider tests, production cookie/session tests, email tests or Atlas security/configuration review were performed.

## Runtime and layout findings

- Public page visits: **180/180 HTTP 200**.
- JavaScript runtime exceptions observed: **0**.
- Unexpected HTTP error responses: **0**.
- Request-failure events recorded: **13**. This initial collector retained URL paths but not error reasons; navigation/prefetch/context-close aborts cannot be distinguished from network failures from these records alone. They are not counted as confirmed service outages.
- Expected signed-out auth checks: **175 HTTP 401** responses from `/api/auth/me`.
- Samples with measured horizontal overflow: **0**.

### Cross-site cookie and console findings

- Lighthouse cookie observation: **token at https://medreach-production.up.railway.app** (cookie values are not published).
- Lighthouse cookie observation: **refresh_token at https://medreach-production.up.railway.app** (cookie values are not published).

The API and frontend use different site domains. These observations concern API authentication cookies, not proof of tracking or an authentication bypass. Signed-in behavior with third-party cookie blocking was not tested. Assess a same-site frontend/API domain arrangement before relying on cross-site cookies across all browsers.

Lighthouse console warnings include signed-out 401 responses. They can lower the best-practices grade even when access denial is expected; they are distinct from JavaScript runtime exceptions and provider-data API failures.

### Lighthouse load-timeout investigation

- **https://medreach-production.up.railway.app/api/auth/refresh (HTTP 401)** was marked unfinished at capture time in **6/6** audits.

All six audits reported a load-time warning. The shared unfinished refresh request is a candidate for follow-up; its presence does not prove that the backend took 45 seconds or establish the exact cause. Review guest-session probing and refresh response completion before using these scores as stable research rankings. The underlying authentication behavior was not changed.

### Longer network follow-up

12 additional hospital/emergency visits observed for eight seconds after load. 12 returned HTTP 200.

- Failures before closing: **9**.
- Failures during test cleanup: **0**.
- Recorded browser reasons: net::ERR_ABORTED.
- Unexpected Railway HTTP errors during this follow-up: **0**.
The observed aborts were hospital detail-page requests in desktop directory views. This is consistent with client prefetch cancellation; it does not establish a provider API outage.
Client aborts and cleanup cancellations do not by themselves establish a service outage. This follow-up does not retroactively classify every event in the first run.

## Improvement priorities

- Investigate mobile rendering on **tailwind /diagnostics**: observed median LCP 4.50 s.
- Investigate mobile rendering on **skeleton /diagnostics**: observed median LCP 4.39 s.

Recurring Lighthouse findings (diagnostic audits with a score below 1):

- **First Contentful Paint** (`first-contentful-paint`): 6/6 audits.
- **Largest Contentful Paint** (`largest-contentful-paint`): 6/6 audits.
- **Speed Index** (`speed-index`): 6/6 audits.
- **Browser errors were logged to the console** (`errors-in-console`): 6/6 audits.
- **Time to Interactive** (`interactive`): 6/6 audits.
- **Uses third-party cookies** (`third-party-cookies`): 6/6 audits.
- **Background and foreground colors do not have a sufficient contrast ratio.** (`color-contrast`): 6/6 audits.
- **Reduce unused JavaScript** (`unused-javascript`): 6/6 audits.
- **Issues were logged in the `Issues` panel in Chrome Devtools** (`inspector-issues`): 6/6 audits.
- **Use efficient cache lifetimes** (`cache-insight`): 6/6 audits.
- **Font display** (`font-display-insight`): 6/6 audits.
- **Improve image delivery** (`image-delivery-insight`): 6/6 audits.

Prioritize the actual failed audit details and repeat measurements after changes. Do not infer that framework choice alone caused differences. No product or hosting configuration was changed by this evaluation.

## Evidence and reproduction

Raw JSON/HTML reports are stored locally in ignored `evaluation/results/`. Run the commands in the [evaluation guide](README.md) to regenerate them. The aggregate summary preserves source timestamps and leaves missing axes explicitly unmeasured. Resource Timing byte totals may be incomplete for cross-origin resources.

No commit, push or deployment was performed for these evaluation changes.

References: [Lighthouse CLI and categories](https://github.com/GoogleChrome/lighthouse), [CLS definition](https://web.dev/articles/cls), [INP measurement limits](https://web.dev/articles/inp).
