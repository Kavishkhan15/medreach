# Backend inventory and reliability verification

Verified locally on 26 October 2026 using native Node v24.15.0. This is a code and
local-test completion record, not production deployment certification. Frontend
files, live hosting, SMTP configuration and canonical database records were not
changed by this backend implementation.

## Implemented behavior

| Area | Contract |
| --- | --- |
| Inventory | Generic organisation/resource snapshots with nullable capacity, occupied, blocked and held values; availability is derived only when inputs are known. Zero remains distinct from unknown. |
| Authorised reporting | Current active Provider Admin and matching active membership required; version comparison and observation timestamps reject concurrent/stale overwrites. System Admin does not bypass the provider-only reporting rule. |
| Freshness | Public numerical inventory requires fresh provider-confirmed evidence within 30 minutes. Demo, stale, future and incomplete evidence is withheld. |
| History and audit | Snapshot and recoverable event journal commit atomically. History/audit projections use deterministic identities, bounded leased recovery and visible exhaustion. |
| Requests | Submission and provider acceptance do not consume inventory or reserve beds. Existing duplicate protection and healthcare workflows remain. |
| Background processing | Separate API, notification, expiry and recovery processes; persisted job keys, renewable fenced leases, bounded attempts and worker heartbeats. |
| Shared limits | MongoDB counters coordinate API replicas; unavailable shared state fails closed. Production index checks are read-only. |
| Email | Persisted intent, encrypted replay-safe content, provider idempotency and signed raw-body webhooks. Submission is distinct from delivery. Uncertain sends require review. |
| Emergency handling | Explicit bed/blood/ambulance emergency classification, assigned recipient eligibility, acknowledgement and bounded escalation; email does not acknowledge or confirm care. |
| Operations | System Admin diagnostics, incident records, reasoned job retry and inventory-journal recovery. No private job payload/lease secrets in diagnostics. |

## API additions

- `GET /api/inventory/:kind/:organizationId`: safe public current state.
- `PUT /api/inventory/:kind/:organizationId/:resourceKey`: assigned Provider Admin
  update with `expectedVersion`, `observedAt` and validated inventory fields.
- `GET /api/inventory/:kind/:organizationId/:resourceKey/history`: protected,
  bounded version pagination. Current-state reads do not load full history.
- `GET /api/emergency-coordination/:sourceType/:sourceId` and
  `POST /api/emergency-coordination/:sourceType/:sourceId/acknowledge`: protected
  role/organisation-scoped coordination; acknowledgement requires a version.
- `POST /api/webhooks/resend`: signature-verified receipt processing with durable
  deduplication, bounded reconciliation and terminal review states.
- `/api/admin/backend/health`, `/jobs`, `/incidents`, `/jobs/:id/retry`, and
  `/inventory/recover`: System Admin operations. Mutations require a reason.
- `POST /api/email/deliveries/:id/resolve`: System Admin investigation outcome.

Consult route validators for accepted enums and request fields. Historical
`hospital_admin` compatibility remains only where existing workflows require it;
it does not grant new inventory or acknowledgement permissions.

## Data preservation and synthetic demonstration

Read-only audit confirmed the canonical local MongoDB process uses
`/home/anonymous/medreach/data`. The final audit observed 60 users, 30 hospitals,
28 resource providers, 256 jobs, 56 memberships, 216 legacy observations,
11 emergency requests, five blood requests, three ambulance bookings and four
job applications. These match the pre-change key collection counts. Live token
expiry and concurrent user activity can change operational counts between audits.
No canonical inventory, account migration, index migration or cleanup was applied.

The separate guarded `medreach_demo_inventory` database received six synthetic
hospitals, 12 inventory snapshots and six capabilities, with no accounts or email.
Each has General capacity 50 and ICU capacity 15; scenarios cover full/partial
availability, nearly full ICU, full General beds, blocked beds and stale/unknown.
They are explicitly demo data and are never published as real availability.
See [data-tool guards](../../backend/scripts/INVENTORY_DATA_TOOLS.md).

The audit flagged existing missing historical references, including ten emergency
hospital references, 79 hospital job references, 140 provider job references and
one active membership belonging to a non-provider role. They need individual
review. No automatic deletion, reassignment, promotion or invented replacement
records were performed. Legacy notification records without lifecycle metadata
remain historical; old `sent` values are not retroactively certified delivery.

## Checks executed

| Check | Result |
| --- | --- |
| Full backend verification with all 24 database gates enabled | **465 passed, 0 failed, 0 skipped** |
| Focused final inventory/demo/performance verification | 31 passed, 0 failed/skipped |
| Focused final notification/status/coordination recovery verification | 50 passed, 0 failed/skipped |
| Operational health and access tests | 5 passed, 0 failed/skipped |
| Production API/worker index safety tests | 2 passed, 0 failed/skipped |
| Real processes | Two APIs, two notification workers, one expiry worker and one recovery worker passed readiness, shared login limiting, nine task-type completion, restart and cleanup checks |
| Backend lint | 0 errors, 7 existing warnings in Careers, assistant and emergency helper code |
| Whitespace review | `git diff --check` passed |
| Syntax and documentation | 188 backend/script files passed syntax checks; new documentation links resolved |

Focused counts overlap the full suite and must not be added to it. Tests cover
competing inventory updates, stale/future observations, forged organisations,
revoked memberships, invalid values, duplicate requests/webhooks, delivery
failure/uncertainty, expired leases, bounded retries, projection outages, recovery,
account security, existing Careers and request workflows. Local synthetic restore
and migration guards were exercised; no real backup was restored over original data.

Run the complete suite from the repository root:

```sh
/home/anonymous/.nvm/versions/node/v24.15.0/bin/node scripts/verify-backend-tests.mjs
/home/anonymous/.nvm/versions/node/v24.15.0/bin/node node_modules/eslint/bin/eslint.js --config backend/eslint.config.mjs backend/src backend/scripts
```

The environment's default Node command is a wrapper; the native binary was used
to verify actual assertions. All test writes used guarded disposable loopback
databases. Email transports were mocked/disabled: no real inbox delivery is claimed.
Frontend browser tests and builds were not rerun for this backend-only task.

The [real-process benchmark](backend-process-readiness.md) recorded zero errors
across 300 directory requests. At concurrency 1/10/30, p95 was
8.19/43.77/85.79 ms. These are single-machine synthetic measurements, not an SLA
or evidence of hosted production capacity.

## Before commercial deployment

1. Review historical relationship anomalies and provider-confirmed data quality.
   Real hospitals have not been given invented bed counts.
2. Back up the confirmed target, review additive indexes and apply an explicitly
   authorised production migration before startup. Automatic production index
   creation is disabled; missing correctness indexes block startup.
3. Configure a dedicated envelope key and signed Resend webhook, supervise all
   three worker roles, and exercise external delivery/bounce/recovery in staging.
4. Configure retained off-host backups, scheduled restore drills, external error
   and incident alert delivery, and operational ownership. Internal diagnostics
   do not replace an external monitoring service.
5. Perform representative sustained hosted load, live database-interruption,
   crash/failover, clinical workflow and operational escalation validation. The
   five-minute acknowledgement default is configurable operator policy, not a
   clinically validated response guarantee.
6. The existing exact status-filter totals still scan hospital batches; pagination
   bounds memory but does not make that total computation constant-time.

See the [release runbook](../../backend/PRODUCTION_READINESS.md) for separate
process commands, key rotation, index migration, backup guards and rollback.
No commit, push, deployment, remote database access or production migration was
performed.
