# Local MongoDB recovery and consolidation

[Documentation](docs/README.md) · [Project overview](README.md)

Date: 11 October 2026. This setup affects this local workstation only.

**Historical recovery receipt.** Counts and PIDs below describe the 11 October
recovery and service correction. They are not a current inventory: later
approved account provisioning increased the user total. Current recorded
counts and release checks belong in [Release QA](docs/release-qa.md).
The canonical directory and preservation rules remain applicable.

## Active dataset

- Canonical storage: `/home/anonymous/medreach/data`.
- MongoDB listens on `127.0.0.1:27017`; MedReach database name: `medreach`.
- Both root and backend working-directory environment checks resolve to this
  existing local URI. No environment or SMTP settings were changed.
- The entire root `data/` directory is ignored by Git and has mode `0700`.
- MongoDB 8.0.32 opened the recovered dataset successfully. Startup uses a
  65,536-file descriptor limit, avoiding the earlier 1,024-descriptor exhaustion.

The original source `/home/anonymous/medreach-data` remains unchanged. Its startup
history identifies PID 57637, used during the earlier verified inventory. The
recovered records include the individually approved System Admin conversion.
No accounts were created, passwords changed, records reseeded or datasets reset.

## Verified records

All 34 application collections matched the recovered snapshot by count,
document hash and index definition before application startup.

| Collection | Documents |
| --- | ---: |
| users | 3 |
| hospitals | 30 |
| resourceproviders | 28 |
| jobs | 256 |
| jobapplications | 4 |
| emergencyrequests | 10 |
| bloodrequests | 5 |
| ambulancebookings | 2 |
| hospitalfacilities | 163 |
| availabilityobservations | 216 |
| auditlogs | 468 |
| authtokens | 83 |
| emaildeliveries | 187 |

The application dataset contains 2,773 documents in total. No collection count
decreased relative to the earlier inventory. Additional audit, authentication
and email history accumulated before this recovery; those records were retained.
The existing System Admin still has all 30 hospital and 37 job references.
Historical crawler data and provenance were preserved.

## Recoverable backups

Private recovery folder, outside the repository:

`/home/anonymous/.local/share/medreach-recovery/20261011T185227`

- `original-medreach-data.tar.gz`: complete inactive source, including journals.
  Its 1,337 files were checked against SHA-256 hashes before recovery; an extracted
  working copy was checked again and successfully opened by MongoDB.
- `recovered-medreach.archive.gz`: logical backup of the recovered application
  database. A fresh isolated restore verified all document values, counts and
  index definitions across all 34 collections. The newly created restore test
  database was then removed.
- `manifest.json`, `recovered-inventory.json`, `logical-backup-verification.json`
  and `canonical-verification.json` record verification evidence privately.
- `disposable-*.tar.gz`: verified archives of the disposable directories removed
  below. Original October 7 migration archives were also retained unchanged.

The first logical verification target was found to contain an older pre-existing
restore dataset. Verification therefore used a fresh uniquely named namespace;
the original application dataset was not overwritten.

These backups reside on the same local disk and do not protect against failure
of that disk. Copy a verified archive to independent storage when appropriate.

## MongoDB service

Canonical config: [mongod.conf](scripts/local-mongodb/mongod.conf).
Prepared system-service override: [medreach-local.conf](scripts/local-mongodb/medreach-local.conf).

The initial system-service startup failed with
`SERVER-121912`: the packaged unit's `GLIBC_TUNABLES=glibc.pthread.rseq=0`
enables a TCMalloc path incompatible with this machine's kernel. The earlier
manual canonical instance shut down cleanly during service installation.

MongoDB 8.0.32 is installed on Linux `7.0.0-38-generic`. The repository override
now explicitly sets `GLIBC_TUNABLES=glibc.pthread.rseq=1`, consistent with
[MongoDB 8.0.32's kernel compatibility test suite](https://raw.githubusercontent.com/mongodb/mongo/r8.0.32/buildscripts/resmokeconfig/suites/rseq_kernel_check.yml).
The correction was installed by the user and the service restarted successfully
at 19:45:01 IST. Both systemd and the running process confirm the environment
value above. MongoDB reports that TCMalloc per-CPU caches are disabled.

Verification confirmed the service is active and enabled for boot startup. PID
223188 remained running for at least 109 seconds with zero service restarts and
successful database pings. The running server reports its actual `dbPath` as
`/home/anonymous/medreach/data`. Exactly one MongoDB process is running. A reboot
was not performed, so boot startup is configured but has not been tested through
a reboot.

Commands used to apply the correction:

```sh
sudo install -m 644 /home/anonymous/medreach/scripts/local-mongodb/medreach-local.conf /etc/systemd/system/mongod.service.d/medreach-local.conf
sudo systemctl daemon-reload
sudo systemctl restart mongod
```

For a first installation only, `scripts/local-mongodb/install-service.sh`
requires verified dataset receipts, refuses an unexpected MongoDB
process or existing override, saves the previous configuration, gracefully stops
the manual canonical process, installs only the local service override and starts
the enabled system service. It does not edit `/etc/mongod.conf`, delete data or
run migrations. The service runs as `anonymous`, uses the canonical configuration
and sets `LimitNOFILE=65536`.

After installation, verify:

```sh
systemctl status mongod --no-pager
systemctl show mongod -p MainPID -p User -p ExecStart
pgrep -a -x mongod
curl -fsS http://127.0.0.1:4000/health/ready
```

There should be exactly one MongoDB process. MedReach uses the existing local
port, so application environment changes are unnecessary. Once installed, manage
MongoDB with `sudo systemctl start|stop|restart mongod`; avoid starting another
manual instance against an alternate directory.

## Completed cleanup

Removed only after archiving and validating each directory:

- `/tmp/mongodb-data`: empty MedReach application database and isolated tests.
- `/home/anonymous/medreach/.git/roles-test-mongo`: verified role-test instance.
- `/home/anonymous/medreach/.git/local-security-mongo`: verified security-test instance.
- The temporary `restore-verification` working directory inside the recovery folder.

Removed 13 disposable database namespaces from the canonical copy, each explicitly
named by the repository's test configuration or tests:

```text
medreach_ambulance_booking_test
medreach_ambulance_test
medreach_campaigns_test
medreach_careers_test
medreach_ci_test
medreach_e2e
medreach_emergency_guest_test
medreach_flow_contracts_test
medreach_fusion_integration
medreach_mumbai_network_test
medreach_public_tracking_test
medreach_test
medreach_urgent_blood_test
```

Preserved inactive datasets at `/var/lib/mongodb`, `/home/anonymous/.mongodb/data`
and `/home/anonymous/data/db`, because their contents were not fully verified.
Also retained `medreach_assistant_e2e`, `medreach_assistant_suite_e2e`,
`medreach_browser_test` and the older `medreach_restore_verify` namespace rather
than infer deletion eligibility from names alone. These namespaces share the
single canonical active directory; no separate instance serves them.

## Application verification

The actual Express application returned readiness HTTP 200 and loaded all 30
stored hospitals via `GET /api/hospitals?limit=100`. Native driver checks confirmed
the running server's actual `dbPath`. The normal backend entry point also started
successfully on port 4000, after confirming no pending notification or expiry
work would send messages during this check. No SMTP settings were changed.

Fresh checks after the successful system-service restart confirmed readiness
HTTP 200 and hospital API HTTP 200 with all 30 hospitals. The database still
contains 3 users, 30 hospitals, 28 resource providers and 256 jobs. Healthcare
document hashes match the recovery snapshot; all three password hashes and the
System Admin's 30 hospital and 37 job references are preserved.

Between recovery and this verification, existing application activity increased
audit records from 468 to 475 and authentication tokens from 83 to 87. Existing
login timestamps and account defaults also changed; password hashes and roles
were preserved. This service correction performed no account mutations.
Private receipts `rseq-service-verification.json` and
`rseq-service-stability.json` in the recovery folder record these checks.

No frontend design, SMTP settings, production database, remote environment,
commit, push or deployment was changed by this task.

## Backup reference

The backup approach follows MongoDB's guidance on preserving storage and journal
files and validating restores: [MongoDB filesystem backups](https://www.mongodb.com/docs/v8.0/tutorial/backup-with-filesystem-snapshots/)
and [MongoDB backup/restore tools](https://www.mongodb.com/docs/v8.0/tutorial/backup-and-restore-tools/).
