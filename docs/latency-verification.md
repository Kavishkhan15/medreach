# Submission latency verification

## Change — 2026-10-03

Bed requests (standard and guest emergency), blood requests/donation pledges,
and career applications now attempt independent emails concurrently, with a
limit of three tasks per submission. This replaces serial SMTP waits shared by
all three frontends. Email order is no longer guaranteed across recipients.

The primary record is saved first. The API still waits for every delivery
attempt before responding. Existing event keys, delivery records, leases,
encrypted retry payloads, access checks and tracking references are retained.
A failed recipient does not prevent other recipients from being attempted.
Job application staff-routing lookup failures still return the saved application
and attempt the applicant confirmation.

This is a per-submission concurrency limit, not a global SMTP rate limiter.
Hosted load testing should verify the provider's connection/rate limits before
increasing traffic. Authentication emails and ambulance delivery handling are
unchanged.

## Local measurement

Real Express routes and MongoDB, isolated disposable fixtures, one request at a
time, five samples per endpoint, three assigned hospital staff accounts. SMTP
was replaced with a local transport that waits 150 ms per email. No live emails
were sent, and no test providers/jobs were added to product data.

| Submission | Before median | After median | Reduction |
| --- | ---: | ---: | ---: |
| Standard bed | 778 ms | 320 ms | 59% |
| Standard blood | 312 ms | 161 ms | 48% |
| Job application | 621 ms | 317 ms | 49% |
| Organization application | 624 ms | 314 ms | 50% |

The same 5/2/4/4 email attempts completed before and after the change. Concurrent
delivery peaked at 3/2/3/3 after the change, compared with one before. These are
small local samples with simulated SMTP delay, not production latency promises.
Page rendering, external Maps, network distance and real SMTP delivery times
are outside this benchmark. A slow SMTP attempt still contributes to response
time because the API continues to await delivery outcomes.

Reproduce after starting local MongoDB:

```sh
NODE_ENV=test EMAIL_ENABLED=false AI_PROVIDER=rule_based \
  node backend/scripts/measureSubmissionLatency.js
```

The benchmark deletes and recreates only `medreach_latency_test`; an optional
`MEDREACH_LATENCY_TEST_MONGO_URI` must name exactly that isolated database.
Do not run concurrent copies against the same database.

## Regression checks

`backend/test/emailBatch.test.js` verifies overlapping work, the concurrency
limit, waiting for completion, empty batches and isolation of thrown/rejected
tasks. `backend/test/emailLatency.mongo.test.js` verifies standard/guest emergency
bed, standard/urgent blood, job and organization submissions; actual saved/public
references; recipient counts; durable failure/retry; idempotent submissions; and
staff-routing outages. Concurrency assertions avoid timing-based flaky tests.

See [Release QA](release-qa.md) for the full local regression results and the
remaining live deployment checks.
