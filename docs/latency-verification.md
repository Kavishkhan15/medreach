# Performance verification

Local measurements, 21 October 2026. These describe the tested repository,
not a hosted latency guarantee.

## Implemented improvements

| Area | Change |
| --- | --- |
| Provider Accounts | One user read plus batched memberships, hospitals and providers replaces per-account organisation lookups |
| Homepage | Independent resource updates; jobs/campaigns load near their sections; retries reload only the failed resource |
| Job preview | `GET /api/jobs?view=summary` omits full descriptions/populated organisations while retaining published filtering |
| JavaScript | Homepage map and booking/blood modal code split from the initial page module |
| Public API transfer | gzip-compatible compression and ETag revalidation on public directory index reads |
| Notifications | Persist replay-safe messages in an encrypted outbox; send outside the HTTP response path |
| Booking feedback | Distinguish queued, transport-accepted and uncertain notifications without implying dispatch |
| History reliability | Independent bed, blood and ambulance loading/error/empty/retry states; malformed responses are errors |

Authenticated/private responses remain uncacheable. Availability receives no
stale TTL cache. Password hashing strength, real healthcare data and backend
permission checks are preserved.

## Same-machine before/after

Original dataset, read-only queries with Mongoose automatic collection/index
creation disabled. Provider Accounts compares the implementation at HEAD with
the updated serializer against the same 55 provider accounts, three samples each.

| Metric | Before | After |
| --- | ---: | ---: |
| Provider Accounts database reads | 111 | 4 |
| Provider Accounts time, median | 75 ms | 11 ms |
| Provider Accounts samples | 99 / 75 / 59 ms | 11 / 11 / 10 ms |
| Homepage job response, 150 rows, raw | 136,869 bytes | 49,471 bytes |
| Homepage job response, gzip | 13,156 bytes if compressed | 3,240 bytes, compression enabled |
| Public job response Content-Encoding | absent in baseline audit | gzip |
| Public job cache policy | absent in baseline audit | public, no-cache |

The combined compact/compressed response is about 97.6% smaller than the
baseline uncompressed job payload. The standard full Careers endpoint remains
available; it now compresses to 13,156 bytes in this sample.

### Initial homepage script assets

Unique script URLs in each production homepage HTML, summed from emitted files;
gzip sizes calculated locally. This includes runtime/polyfills and is not a
Core Web Vitals score or a measured browser cache miss.

| Variant | Before raw / gzip | After raw / gzip |
| --- | ---: | ---: |
| Bootstrap | 673,922 / 207,197 bytes | 622,177 / 190,391 bytes |
| Tailwind | 682,594 / 208,661 bytes | 627,473 / 191,385 bytes |
| Skeleton | 674,791 / 207,301 bytes | 624,791 / 190,895 bytes |

Next.js build estimates report approximately 137 kB first-load JavaScript for
the updated homepage in each variant. Different measurement methods count
different assets; do not equate this estimate with the table above.

## Notification evidence

`backend/test/performance.mongo.test.js` verifies persistent queued content,
restart recovery, encrypted payloads, duplicate suppression, failure backoff and
uncertain outcomes. Real HTTP tests cover standard/emergency bed, normal/urgent
blood and ordinary/emergency ambulance requests. They assert that responses and
tracking succeed before transport, and that delayed sends recheck provider access.

These use mock transport in a disposable database. No test email was sent to
real recipients. Sent means provider acceptance, not confirmed delivery.

Account activation, address verification and recovery links retain inline,
non-replayable delivery. They can still wait for a transport timeout. The
existing inline batching tests cover direct `createApp()` usage; normal
`server.js` startup enables the outbox.

## Earlier audit and remaining limits

The preceding audit observed hosted hospital index responses of
3,749 / 2,232 / 1,104 ms versus local 39 / 13 / 8 ms. This is a small,
uncontrolled sample. It suggests inspecting hosting/database/network latency
before assigning a cause; no hosting settings were changed here.

The same audit measured a local login median of 289 ms across seven samples;
bcrypt verification at the existing cost accounted for about 270 ms.
Do not weaken hashing to improve a stopwatch measurement.

No production p95/INP/CLS claim, load-capacity claim, live email receipt or
post-deployment performance comparison is established by these checks.
Queue age, transport rate limits and database/hosting regions require
environment-specific verification.

## Dependency

Added `compression` ^1.8.2 to the backend, using
[Express's middleware](https://expressjs.com/en/resources/middleware/compression/).
It reduces public JSON transfer size at the cost of server compression work.
It adds no frontend JavaScript. No animation, media or map dependencies were added.

[Release QA](release-qa.md) owns current test/build results.
