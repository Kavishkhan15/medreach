# Isolated local backend staging

This is a finite staging rehearsal, not an installed service or a hosted environment. Run from the repository root using native Node 24 or newer:

```sh
MEDREACH_STAGING_REPORT_DIRECTORY=/tmp/medreach-local-staging node backend/scripts/runLocalStaging.js
```

The supervisor reuses `verifyBackendProcesses.js`: two API replicas, two notification workers, an expiry worker and a recovery worker share the dedicated `medreach_process_readiness_test` database on numeric loopback. The script refuses a nonempty database, owns its temporary records with a random marker, then shuts down its children and drops only that owned database. Ports 4411 and 4412 must be free. `MEDREACH_PROCESS_TEST_URI` can select another numeric loopback MongoDB port, but no other database, credentials or URI options are accepted.

The child environment drops inherited credentials and explicitly disables external email, operational webhooks, AI and routing integrations. It does not open the canonical application database. A private JSON report records actual results and limitations; no account credentials or database records appear in it.

The rehearsal checks shared login limits across replicas, independent worker scheduling, unique job keys, API restart with a surviving replica, notification-worker SIGKILL and replacement heartbeat, bounded directory traffic, and safe failure on invalid database configuration. It does not claim that an idle worker crash proves exactly-once external delivery or that short local load establishes hosted capacity.

## Evidence artifacts

Run `inventoryEvidenceArtifacts.js` from the repository root with `MEDREACH_EVIDENCE_METADATA_PATH` pointing to a new private JSON file. It inventories `.migration-backups`, `data` and `output`, hashes candidate backup/import files without parsing record contents, and skips symbolic links. Filenames and matching checksums identify artifacts; they do not establish authority. No relationships are repaired by this command. Inspect artifact origin, source database, time, scope and actual record evidence in an isolated review before proposing any repair.

## Scheduling configuration

`operations-plan.json` is a disabled configuration draft. Neither a scheduler nor an external receiver is installed. `backup.env.template` and `probe.env.template` describe the existing tool inputs; actual values belong outside Git. Daily backup, 30-day retention, monthly restore drill, 24-hour recovery age and 60-minute restore time are proposals awaiting measured approval. Retention deletion remains disabled.

The backup tool currently requires verified source quiescence through dump and restore comparison. A timer must not assert `--source-quiesced` while APIs or workers can write. Approve an actual pause/resume procedure or a separately validated consistent snapshot method before scheduling. On restore, disable outgoing messages, verify content and indexes, run relationship checks and application reads in the isolated target, then record elapsed recovery time. Store notification decryption keys and the backup encryption key in a separately protected recovery location.

The independent readiness probe requires HTTPS; local plain HTTP rehearsal checks are handled by the process supervisor. Configure a verified HTTPS readiness URL, separate HTTPS alert receiver, private persistent state and a secret before enabling a 60-second draft probe cadence. A local scheduler does not provide independent monitoring during host failure. Backup failure and alert-delivery exhaustion must reach an operator through a separately monitored route before release.

Validate the disabled plan offline with `node backend/scripts/validateLocalOperationsPlan.js backend/operations/local-staging/operations-plan.json`. `validateProbeReceiver` checks HTTPS URLs, rejects embedded credentials/fragments, requires a 32-character secret and an absolute state path, and explicitly reports that connectivity and delivery remain unverified. No validation command sends a request.

Run `node backend/scripts/rehearseLocalBackup.js` for the owned synthetic encrypted-backup rehearsal. It refuses nonempty fixture/restore databases, uses a random transient encryption key, verifies content/indexes and exact fixture references after restoration, then removes only databases carrying its random ownership marker and deletes temporary recovery material. Its report is evidence of the synthetic path only.

`crosswalkHistoricalEvidence.js` reads namespace-framed BSON bytes directly from existing compressed archives without restoring them or connecting to a database. It compares exact missing target IDs and collection names against the reviewed manifest, exports only IDs and artifact/document checksums, and flags differing snapshots conservatively. Every candidate remains unapproved and nonexecutable. The archive framing parser does not validate archive block CRC or provenance authority. A restore must never be authorised from this crosswalk alone.
