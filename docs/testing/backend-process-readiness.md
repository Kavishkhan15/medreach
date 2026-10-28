# Local backend process readiness

The repeatable verification is `backend/scripts/verifyBackendProcesses.js`. It starts two real API processes on ports 4411 and 4412, two notification workers, one expiry worker, and one recovery worker. All children run in production mode with email disabled and a shared freshly generated random JWT secret. The secret and child logs are never printed.

## Run

From the repository root, with local MongoDB available:

```sh
/home/anonymous/.nvm/versions/node/v24.15.0/bin/node --test backend/test/processReadiness.test.js
MEDREACH_PROCESS_REPORT_PATH=/tmp/medreach-process-readiness-results.json /home/anonymous/.nvm/versions/node/v24.15.0/bin/node backend/scripts/verifyBackendProcesses.js
```

Native Node 24 or newer is required. The environment's default `node` wrapper is unreliable, so use the explicit native binary above. The optional report path receives JSON after all checks and cleanup finish successfully. A failing check exits nonzero. Local network permission may be required in a sandbox.

`MEDREACH_PROCESS_TEST_URI` optionally selects a different local MongoDB port. The only accepted database name is `medreach_process_readiness_test`; accepted hosts are numeric `127.0.0.1` and `[::1]`. Credentials, query options, SRV, other databases, and nonloopback hosts are rejected before connecting. Existing `MONGODB_URI` and `MONGO_URI` values are overridden for the harness and every child.

The harness refuses a nonempty test database and holds an exclusive `/tmp/medreach-process-readiness.lock` file. It creates an ownership marker, explicitly builds model indexes in that database, and inserts 36 synthetic approved hospitals with inventory classified as `demo`. It creates no user accounts or email delivery fixtures. Production automatic index creation remains disabled.

In a `finally` block it stops only the child processes it spawned, checks the database name and ownership marker, drops only its owned test database, disconnects, and removes the lock. An uncatchable process termination can leave the test database or lock behind. Inspect ownership and ensure no run remains active before manually removing those dedicated test artifacts; the script deliberately refuses to erase preexisting data.

## Verified run

The final run on 2026-10-26, 08:41:47–08:42:02 UTC used native Node v24.15.0 and passed:

- Both independent API processes answered `/health/ready` successfully. Before workers started, the heartbeat collection was empty, confirming APIs do not start background workers.
- Twelve invalid login requests alternated between replicas. The first ten returned 401; requests eleven and twelve returned 429, demonstrating the shared ten-attempt limit. No account or email was needed.
- Four distinct worker heartbeat records appeared, including two notification instances. Unique indexes existed on `BackgroundJob.key` and `WorkerHeartbeat.workerId`.
- All nine scheduled task types completed: notification delivery, request expiry, operational incidents, request status effects, emergency coordination, notification recovery, expiry effects, inventory journal recovery, and webhook recovery. At the worker checkpoint there were 15 completed jobs, zero duplicate keys, zero completed jobs requiring retries, and zero exhausted jobs. Job counts are a checkpoint snapshot because workers continue polling during directory measurements.
- After stopping API 4411, API 4412 still served the hospital directory. Restarted API 4411 became ready.
- A separate API child given a malformed database URI emitted the startup-failure marker, exited with code 1, and never emitted the listening marker. The surviving valid API remained ready. The canonical MongoDB process was never stopped or disconnected.
- Cleanup confirmed deletion of the owned test database after shutting down the spawned children.

Directory requests alternated between both APIs and queried `/api/hospitals?limit=12`. Every response was checked for status 200, 36 total fixture hospitals, and 12 returned hospitals. Each concurrency level issued exactly 100 requests. Latency includes consuming and parsing the full response; percentiles use the nearest ranks from the sorted 100 request durations. Throughput is total requests divided by the wall time for that level.

| Concurrent requests | Requests | p50 (ms) | p95 (ms) | Throughput (requests/s) | Errors |
| --- | --- | --- | --- | --- | --- |
| 1 | 100 | 6.20 | 8.19 | 152.03 | 0 |
| 10 | 100 | 23.03 | 43.77 | 409.37 | 0 |
| 30 | 100 | 58.67 | 85.79 | 458.07 | 0 |

These are measurements from one local run with a small synthetic dataset and cohosted MongoDB, APIs, workers, and request driver. They are not a production SLA or hosted load test. The scheduled worker checks exercise coordination and empty-queue handler completion; they do not prove external email delivery, emergency side effects, provider latency, large datasets, sustained capacity, or replica failover of MongoDB. The malformed-URI check covers startup configuration failure, not a live database outage.

## Guard test

`backend/test/processReadiness.test.js` checks acceptance of the exact numeric loopback target and rejection of canonical/other database names, remote hosts, localhost aliases, SRV, credentials, query overrides, fragments, and multihost strings. This test imports the harness without opening network connections or starting child processes. The real-process script is an explicit separate verification command.
