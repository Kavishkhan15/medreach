# Backend operations and release checklist

For the subsequent integrity, archival, MFA, import, export and operational-alert
implementation, see the [current implementation record](../docs/testing/backend-commercial-hardening-20261026.md)
and [production release runbook](../docs/operations/production-release.md).
The guarded local v1 index tooling below remains unchanged; the separate v2
production migration has an explicit review/backup/expiry-approval process.

The API now records durable work but does not process queued email, request expiry,
or recovery itself. Deploy and supervise four separate processes from `backend/`:
`npm start`, `npm run worker:notification`, `npm run worker:expiry`, and
`npm run worker:recovery`. Each worker needs the same database and encryption
configuration. Restart failed processes with bounded backoff and allow SIGTERM
shutdown. A missing worker unique index prevents worker startup.

For local development, start the API/frontend with the existing launcher and run
`npm run workers:local` in a separate terminal. This launcher stops the worker group
when one exits. Frontend launch commands and configuration are unchanged. Keep
`EMAIL_ENABLED=false` for demonstrations and tests. Workers can expire requests,
so select an explicitly isolated demo dataset when demonstrating them.

## Additive index migration

`npm run migrate:operations-indexes` is read-only by default. It requires an explicit
`MEDREACH_INDEX_MONGO_URI`; it never loads `.env`. Only exact loopback port 27017
URIs for `medreach`, `medreach_migrations_test`, and `medreach_demo_inventory` are
accepted. Canonical `medreach` is permitted only for dry runs. This task did not
apply migrations to the canonical dataset.

```sh
cd backend
NODE_ENV=test EMAIL_ENABLED=false \
MEDREACH_INDEX_MONGO_URI=mongodb://127.0.0.1:27017/medreach_migrations_test \
npm run migrate:operations-indexes
# Review the full report, then apply only to this isolated test database:
NODE_ENV=test EMAIL_ENABLED=false \
MEDREACH_INDEX_MONGO_URI=mongodb://127.0.0.1:27017/medreach_migrations_test \
npm run migrate:operations-indexes -- --apply
```

Version `2026-10-26-operations-indexes-v1` covers worker jobs/heartbeats,
inventory/observation journals, webhook receipts, emergency coordination/incidents,
notification delivery, and request recovery indexes. The manifest includes observed
inventory freshness and pending recovery queries. Duplicate unique-key groups are
reported before any write; the script does not merge or delete records.
The declared TTL indexes expire completed job records and inactive heartbeats
after seven days; MongoDB performs that retention asynchronously. A collision blocks
application and requires a separately reviewed data decision. MongoDB can also
refuse conflicting existing index options or newly racing duplicates.

The ledger `indexmigrationledger` stores the manifest checksum, start/completion,
and completed collections. `createIndexes()` only adds indexes; it never calls
`syncIndexes()` or drops existing indexes. Completed reapplication is a no-op;
failed partial applications can retry because index creation is idempotent.
An interrupted `applying` record deliberately blocks another run: inspect running
processes and existing indexes before a separately reviewed ledger recovery.
Keep this version's manifest stable; schema changes require a new version.

Production retains `autoIndex=false` and `autoCreate=false`. This guarded script
intentionally cannot write a production, remote, or canonical database. A future
production migration needs separate authorization, a verified backup/restore,
reviewed target identity and scoped credentials; complete that before deployment.
For rollback, stop new workers and roll back compatible application code while
retaining additive indexes and ledger records. Do not drop collections or indexes
as an automatic rollback. Review any incompatible index separately.

## Secrets and email

Before enabling production mail, configure a verified sending domain, sender,
provider credential, and dedicated random `EMAIL_ENVELOPE_KEY` of at least 32
characters, different from `JWT_SECRET`. Keep secrets in the deployment secret
store; the example file contains no usable credentials. Rotate any previously
exposed SMTP, Resend, JWT and database credentials at their issuer and replace them
across all services. JWT rotation invalidates access tokens; review refresh session
revocation separately. Do not log credential values or connection strings.

Stored replayable mail uses authenticated encryption. For envelope-key rotation,
retain the current key as `EMAIL_ENVELOPE_PREVIOUS_KEY`, set a new current key on
all processes, restart them together, and verify old queued envelopes drain before
removing the previous key. Version 1 legacy envelopes used JWT_SECRET: preserve the
old JWT as the previous envelope key while draining those records before another
rotation. Only one previous key is supported; do not stack rotations. Backups need
the corresponding historical keys in a separately protected recovery store.

Resend webhook registration remains a manual deployment step. Register the public
HTTPS `/api/webhooks/resend` URL, configure the provider signing secret as
`RESEND_WEBHOOK_SECRET`, subscribe to the lifecycle events supported by the handler,
and test signed replay, duplicate handling and delivery/bounce reconciliation in
an isolated staging deployment. The application cannot configure the provider's
control panel. Provider acceptance is not proof of recipient delivery. Uncertain
send outcomes require operator investigation rather than blindly resending.

## Health and recovery

Use `/health/live` for process liveness and `/health/ready` for MongoDB readiness.
Readiness does not prove workers, email delivery, backups or provider dispatch work.
Inspect authenticated operational diagnostics and the persisted WorkerHeartbeat
records for all three roles, recent heartbeatAt/lastSuccessAt, degraded/stopped
status, and exhausted jobs. Alert on missing/stale roles, retry exhaustion, growing
queued age, webhook failures, and stale inventory reporting. Heartbeats run every
10 seconds; scheduled jobs use renewable leases and bounded attempts. Completion
requires owner/token/lease fencing. A stale handler cannot mark a reclaimed job
complete; downstream email and effect journals retain their own idempotency keys.

Before retrying an exhausted job, inspect its failure and downstream side effects,
confirm the handler is safe to replay, and use the authorized operational retry
workflow with a reason. Never clear semantic keys or reset attempt counts directly.
Test process termination and recovery under representative staging load before
claiming production operation. Graceful shutdown has a 30 second worker deadline;
noncooperative work can be interrupted and must recover from persisted leases.

## Backup and restore jobs

Configure an external managed backup service or scheduled job; application workers
do not schedule backups. Assign an owner, schedule, retention, alert destination,
RPO/RTO, encryption and off-host immutable storage. Preserve existing migration
backup directories and verification records unchanged. Use append-only timestamped
archives with checksums, include indexes and the migration ledger, and store keys
separately. Verify job completion and storage retention through the backup service.
No scheduler, remote backup, or retention service was installed by this task.

The existing `scripts/verify-mongo-backup.mjs` makes a temporary logical archive,
restores into a disposable target, and compares collection counts/indexes while
checking the source remained stable. Its scratch archive is deleted afterwards;
it is a drill, not retained backup storage. It drops its named restore target.
Use the safer wrapper for an isolated local demonstration:

```sh
NODE_ENV=development EMAIL_ENABLED=false \
MEDREACH_BACKUP_SOURCE_URI=mongodb://127.0.0.1:27017/medreach_demo_inventory \
MEDREACH_RESTORE_VERIFY_URI=mongodb://127.0.0.1:27017/medreach_restore_verify_test \
npm run backup:verify-local
```

The wrapper requires a noncanonical local test/demo source and an empty disposable
restore target, refusing remote/canonical endpoints and existing target collections.
The drill leaves the restored target for inspection. It requires mongodump and
mongorestore. Compare representative records and relationships and run application
read checks in the restored environment; matching counts/indexes alone cannot prove
all document content or application behavior. For real production restore drills,
use separately authorized isolated infrastructure with no outbound email, verify
checksums/content and recovery timing, then record evidence. Automate drills through
the backup service only after those permissions and target guards are reviewed.

## Local validation and remaining release work

`npm run audit:data` is read-only; `npm run demo:inventory` requires the isolated
demo URI and email disabled (see `scripts/INVENTORY_DATA_TOOLS.md`). Migration tests
are gated by exact `MEDREACH_MIGRATIONS_TEST_MONGO_URI` on loopback port 27017 with
database `medreach_migrations_test`; worker tests use only
`medreach_background_jobs_test`. Never point test variables at a real dataset.

Use native Node 24 with `--test --test-isolation=none --test-concurrency=1`.
Run `operationsMigration.mongo.test.js` and `localRestore.mongo.test.js` sequentially
because both reserve `medreach_migrations_test`. The restore test also reserves
`medreach_restore_verify_test` and refuses a populated initial target. Local tests validate
migration refusal, no-write dry runs, duplicate preflight, ledger idempotence,
preserved indexes, worker startup checks, persisted lease fencing and crash replay.
Deployment supervisors, provider webhook registration, real mail receipt, retained
backup schedules, production restore timing, and staging load/failover remain manual
release work. Do not interpret local test passes as operational verification.
