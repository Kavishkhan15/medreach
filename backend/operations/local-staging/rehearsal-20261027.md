# Local staging rehearsal — 27 October 2026

Run against owned synthetic fixtures only, with native Node v24.15.0 and the existing local MongoDB process. No application/Atlas database was written. All owned test databases and child processes were cleaned up. External messages were disabled. No schedule, remote resource or deployment was created.

## Process evidence

The real-process run started at 2026-10-26T20:25:31Z (27 October in India). It brought up API replicas on ports 4411 and 4412, two notification workers, one expiry worker and one recovery worker. Thirty-six approved synthetic hospitals supplied the directory load.

Both APIs became ready and started no background workers themselves. Twelve invalid logins alternating replicas produced ten 401 responses followed by two 429 responses. Four worker heartbeats appeared; all nine task types completed, with 21 completed jobs at the coordination checkpoint, no duplicate job keys and no completed jobs requiring retry. SIGKILL of a notification worker was followed by a replacement heartbeat. A stopped/restarted API retained service through the other replica. Invalid database configuration exited without listening.

| Concurrent requests | Total requests | p50 ms | p95 ms | Requests/second | Errors |
| --- | --- | --- | --- | --- | --- |
| 1 | 100 | 6.39 | 8.00 | 148.44 | 0 |
| 10 | 100 | 25.23 | 39.06 | 379.15 | 0 |
| 30 | 100 | 53.20 | 100.85 | 467.40 | 0 |

This short local run is not a capacity commitment. Database, APIs, workers and load driver shared one host. No live database outage, real notification delivery, large provider population or in-flight external side-effect recovery was exercised.

## Encrypted restore evidence

An actual AES-256-GCM encrypted `mongodump` archive of three synthetic business records was restored with `mongorestore` into the empty, dedicated restore database. The backup tool verified all BSON content and index definitions. Additional reads checked hospital/request and hospital/inventory references and preserved `available: null`. Restore elapsed 182 ms; total drill elapsed 316 ms. The generated key and encrypted fixture archive were removed after verification. This proves the synthetic path only; it does not establish production RPO/RTO, retained backups or HTTP application functionality after restoration.

## Artifact evidence

A metadata-only scan found 16 candidate artifacts in `.migration-backups`, `data` and `output`: three compressed database archives, one BSON file and twelve supporting JSON manifests/sidecars. SHA-256 checksums, byte sizes and modification times were recorded privately. No contents were parsed or copied into this document. All artifacts remain `authority: unverified`; neither filename nor timestamp authorises historical relationship repair.

Private machine-readable results are in `output/local-staging-20261027/`. Draft schedules and operating targets remain disabled/unapproved in this directory. No retention deletion is enabled.

## Exact historical-ID crosswalk

The three existing compressed database archives were scanned directly in memory with no database connection or restoration. The reviewed manifest contains 1,679 missing-target findings covering 221 distinct target collection/ID pairs. **No exact missing target IDs were found in these snapshots.** No restoration candidates or executable repairs were produced. The crosswalk exports only identifiers, paths and checksums; no names, contact information or document values. Backup authority and per-block archive CRC remain unverified. Existing audit history is insufficient to infer replacement relationships.
