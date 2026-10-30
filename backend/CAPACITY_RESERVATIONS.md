# Bed and diagnostic capacity

Scope: Bootstrap, ordinary hospital bed requests and diagnostic test requests.
Blood-bank requests and inventory are unchanged. Emergency hospital requests never
display bed counts and are never rejected because the verified bed count is zero.
An accepted emergency coordination request is not proof that care was delivered.

## Ordinary hospital beds

Fresh, provider-confirmed General and ICU counts appear in the ordinary request
form. Missing, demo, invalid or older-than-30-minute reports show unknown rather
than zero. Counts expire in the browser as well as at backend read time.

The existing isolated synthetic hospital fixture now starts with 30 General beds
and 10 ICU beds, with different occupied/blocked/stale scenarios. Existing fixture
rows, production organisations and recovered records are never reset. These
defaults do not establish real hospital capacity or availability.

An assigned active Provider Admin records real observed counts and explicitly
enables reservations for a hospital resource from the inventory workspace.
Submission then commits the request and a 10-minute hold in one MongoDB transaction.
Available = capacity - occupied - blocked - held. Confirmation does not deduct
again; admission converts held to occupied; discharge restores availability.
Cancellation, rejection and expiry release once. Held values cannot be manually
overwritten, and occupied counts cannot be reduced below recorded admissions.

Unconfigured, unverified and stale resources accept coordination requests without
claiming a reservation. Full verified opt-in resources reject ordinary allocation.
All request ownership, organisation permissions, duplicate-submission protection
and durable status effects remain in force.
Active reservations/admissions also prevent organisation archival. Transactional
organisation counters serialise allocation with lifecycle changes, including for
child providers attached to a hospital.

## Diagnostics

The directory and request form provide Routine / Emergency selection. Patients
select one or more tests, a date from today through 180 days ahead, and a preferred
time. A provider must still confirm the test and appointment time.

Daily capacity is keyed by centre, test and Asia/Kolkata date. Configuration is
versioned, permission checked and audited. Routine capacity cannot exceed 30 per
test/date. All selected tests allocate together: if one is full, no partial booking
or request is committed. Cancellation reopens capacity; completion continues to
count toward that day. Confirmed appointments do not expire with temporary holds.

After the capacity index migration, `DIAGNOSTIC_CAPACITY_ENABLED=true` enables the
30-slot platform policy for all approved centres and future dates, creating only
daily capacity records when needed. These rows are classified `platform_policy`,
not provider-confirmed clinical availability. The provider workspace can explicitly
configure a supported date/test even without the global default enabled.
Unapproved directory listings retain the existing MedReach review workflow and
cannot confirm appointments or disclose requests to unapproved provider accounts.

Emergency requests on a full routine day are recorded for priority review, without
stealing an appointment or promising an extra slot. A centre confirming such an
exception must record how it will accommodate the patient. Configured urgent
allocations may also use a separately reserved portion of the daily total.
Emergency notifications include system recipients and use the existing durable
acknowledgement/escalation recovery path (`sourceType=diagnostic`).

## Operations and rollout

1. Run the existing read-only data audit; retain the private report.
2. Run `node backend/scripts/migrateCapacityIndexes.js --dry-run` with explicit
   `MEDREACH_MIGRATION_URI` and exact `MEDREACH_MIGRATION_DATABASE`.
3. Review its target-bound checksum and duplicate report. The existing production
   migration framework requires a verified encrypted backup/restore receipt bound
   to that plan before `--apply --allow-unique-bootstrap` can create indexes.
   No clinical records or relationships are rewritten by this migration.
4. Verify the API and expiry workers use the same replica-set database. MongoDB
   transactions are mandatory; standalone MongoDB fails closed for allocation.
5. Deploy API and workers, then enable the global diagnostic policy if desired.
   Startup checks its unique indexes before accepting an enabled deployment.
6. Providers verify real hospital capacity and explicitly enable ordinary bed holds.

The expiry worker scans persisted held reservations every 30 seconds. Release and
request expiry happen in the same transaction; status effects recover through the
existing recovery worker. No TTL deletion discards a reservation before its release.
Confirmed allocations require explicit provider lifecycle updates.

Rollback: disable the global diagnostic default to stop creating new automatic
daily-policy rows. Existing configured days and active allocations still operate;
finish/release them before disabling individual resources. Do not deploy code that
ignores active reservations or drop their collections/indexes during rollback.

## Verification

`npm run backend:test:db` requires the existing isolated standalone test server on
27017 plus a separate replica set named `medreach-capacity-test` on 27018. Its
capacity database must be named `medreach_capacity_test`; tests refuse other targets.
CI starts and removes this extra test-only MongoDB container automatically.
The replica tests cover last-bed concurrency, transactional rollback, idempotent
confirmation/admission/discharge, expiry, unknown/demo safety, organisation isolation,
managed-count tampering, 31 concurrent requests against 30 slots, date isolation,
multi-test rollback, emergency overflow, cancellation and confirmed-slot preservation.
