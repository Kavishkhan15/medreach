# Backend release handoff

These are reviewable deployment templates, not an installed or approved production release. `plan.json` keeps automatic deployment and production data changes disabled. None of these files creates paid services.

## Code and environment

Use one reviewed, pinned code revision for the API and all workers. Four Railway configuration templates share the repository/build:

| Role | Template | Proposed replicas | Readiness |
| --- | --- | ---: | --- |
| API | `api.railway.json` | 2 | `/health/ready` |
| Notification worker | `notification.railway.json` | 2 | persisted worker heartbeat, queue and incident checks |
| Request expiry | `expiry.railway.json` | 1 | persisted worker heartbeat and expiry journal checks |
| Recovery | `recovery.railway.json` | 1 | persisted worker heartbeat and recovery jobs |

Replica counts are a staging proposal, not a cost approval or capacity commitment. Workers have no HTTP readiness server. Their supervision must monitor process status plus the API's protected worker/queue health; do not point a worker at an API-only HTTP health URL.

Read-only Railway inspection on 27 October 2026 showed one API replica in `sfo`, started by `node backend/src/server.js`, with `/health/ready` configured. Atlas's region is still unverified. The supplied Railway link cannot establish the MongoDB region. Verify Atlas cluster region/tier and the API's actual connection waiting before choosing a shared target near users. Templates deliberately do not invent an approved region.

Provide secrets through the platform secret manager, never these files. Each API/worker needs its reviewed MongoDB, session and applicable notification-encryption configuration. Give the extraction provider key/model only to recovery workers when enabling that optional workflow. Public reads do not need an external AI call. Reserve key material needed to decrypt restored queued emails and backups in separately protected recovery custody; a new backup encryption key does not replace the email-envelope key.

`BACKEND_METRICS_ENABLED=false` is the default. Opting in enables bounded best-effort histograms with 48-hour disposable operational retention. It does not approve deletion of business data. Shared startup prerequisites must pass before driver telemetry is activated. The default connection maximum remains 10 per process: budget the total across every replica/worker against the actual cluster tier instead of increasing pools blindly.

## Migration and staging sequence

1. Pin the reviewed source revision and choose a tested compatible rollback revision. This workspace contains pre-existing uncommitted changes; do not publish unrelated files blindly.
2. Prepare an isolated database and outgoing-message-disabled staging environment. Run the complete gated backend suite, finite process rehearsal and sustained-failure rehearsal.
3. Generate the target-bound v4 migration dry run with `migrate:reliability-release`. Review its exact database identity, manifest checksum, duplicate preflight and expiry effects.
4. Create an encrypted archive from a verified quiescent source, then perform the existing content/index restore comparison to produce a verified archive-bound receipt. Never assert source quiescence while APIs/workers may still write.
5. Apply only the reviewed checksum with its verified backup receipt and explicit unique/expiry approvals. V4 is additive; it does not rewrite older v2/v3 migration manifests or automatically repair relationships.
6. Start workers and both API replicas from the same revision. Confirm readiness, all scheduled task heartbeats, shared throttling, queued work recovery, metrics (if enabled), permission/version boundaries and notification state semantics.
7. Verify independent alert delivery using an approved signed HTTPS receiver. Verify retained encrypted backup storage, separate keys and recovery targets. An alert recorded in MongoDB is not proof that an independent operator received it.
8. Approve any production migration/deployment separately using the actual target, region, costs and rollback evidence. These templates do not authorise it.

## Recovery without the original database

The existing `verifiedBackup.js verify` compares the archive restore to a still-quiescent source. After that verification, retain its receipt and an independently controlled SHA-256 digest of that receipt with the recovery register.

`backup:restore-retained` can now recover into the exact, empty loopback `medreach_backup_restore_test` database without a source connection. Set the archive key, receipt path, trusted receipt digest and isolated restore URI through a protected process environment, with `EMAIL_ENABLED=false`. No credentials or keys belong in command-line arguments or chat.

The tool verifies receipt and encrypted archive hashes, authenticates/decrypts the complete stream into a private temporary file before MongoDB writes, then verifies restored BSON content and index definitions against the trusted receipt. It refuses nonempty/remote targets, wrong keys, altered receipts and size/deadline violations. It removes its temporary plaintext; it does not silently clear a failed/partial target. It is an isolated recovery verifier, not a production restore command.

The disaster test removed the source fixture database before recovery, rejected a wrong key without target writes, restored exact content/indexes and preserved unknown availability. This proves the mechanism on synthetic data. It does not prove retained off-host backups, a production restoration time, application reads on a restored full production dataset or an installed backup schedule.

## Rollback and real operating responsibility

Do not remove additive indexes/collections on code rollback. Stop new extraction requests first; old code may not understand newly queued extraction tasks. Retain durable jobs and review candidates for a compatible release rather than delete them. Before rollback, verify the chosen revision understands current auth roles, token versions, request states and inventory invariants. Restarting the same revision in the local rehearsal is not an old-revision rollback proof.

Provider reporting readiness exposes missing/stale/unattributed observations and current staff capabilities. It intentionally does not infer a named owner or shift coverage from an account role. Actual reporting owners, contact ownership, escalation recipients and coverage must be reviewed before providers depend on the system. Existing stale-data incidents and signed alert delivery remain available, but live receiver acknowledgement and staffing are operating evidence, not facts code can invent.

Retention deletion, live schedules and external delivery remain disabled/unconfigured pending those reviews. No real provider availability was seeded, repaired or reclassified by this release work.
