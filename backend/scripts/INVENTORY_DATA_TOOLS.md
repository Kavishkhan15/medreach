# Safe inventory data tools

These native-driver tools do not import application models, initialise schemas,
run migrations, create accounts or send email.

## Read-only local audit

From the repository root:

```sh
node backend/scripts/auditBackendData.js > /tmp/medreach-backend-audit.json
```

The default is exactly `mongodb://127.0.0.1:27017/medreach`. An optional
`MEDREACH_AUDIT_MONGO_URI` may select a single explicit loopback port for that
same database. Remote hosts, multiple hosts, other database names and URI query
options are refused. Verify the running local MongoDB data directory separately
before auditing; a URI alone cannot establish which data directory backs a process.

The report includes collection counts, role/status counts, legacy account IDs,
bounded relationship samples, duplicate candidates, missing references,
notification/job states, stale inventory and inferred data classifications.
Source metadata implies historical/imported information, never live provider
confirmation. No classification is written back. Matching names are review
candidates, not an instruction to merge or delete records. Counts are live
observations, so concurrent application writes can change totals during an audit.

Names, contact addresses, password hashes, tokens and request contents are excluded.
Treat the report's IDs and operational counts as internal administrative information.
No automatic account conversion or data cleanup is performed.

## Isolated synthetic inventory demonstration

```sh
NODE_ENV=development EMAIL_ENABLED=false \
MEDREACH_INVENTORY_DEMO_MONGO_URI=mongodb://127.0.0.1:27017/medreach_demo_inventory \
node backend/scripts/createInventoryDemo.js
```

There is no default write target. The script refuses the canonical `medreach`
database, remote hosts, production mode, enabled/unspecified email and unrelated
records even if they exist in the named demo database. Keep real users and
healthcare records out of this isolated database.

The tool creates six explicitly named synthetic hospitals: fully available,
partially occupied, ICU nearly full, general full, blocked beds and stale/unknown.
Every synthetic hospital has General capacity 50 and ICU capacity 15. Simulated
counts obey `available = capacity - occupied - blocked - held`; incomplete
occupancy remains `null`. All inventory has `classification: demo` and
`reportingMethod: demo_fixture`. Public inventory responses withhold demo numbers.
The ICU capability uses the existing facility enum; General is represented by
the generic inventory resource key. No reservation holds are invented.

Deterministic IDs and insert-only operations allow retries after interruption.
Reruns retain existing IDs, observations and modified inventory values. Identity
collisions cause refusal; the tool never resets or overwrites a dataset. It creates
no users, credentials, memberships or observation/audit records attributed to a
nonexistent administrator. Use separately authorised test accounts for API demos.

## Regression checks

```sh
node --test --test-isolation=none backend/test/dataQualityAudit.test.js
MEDREACH_INVENTORY_DEMO_TEST_MONGO_URI=mongodb://127.0.0.1:27017/medreach_inventory_demo_test \
node --test --test-isolation=none backend/test/inventoryDemo.mongo.test.js
```

The database test is skipped unless its exact isolated loopback test target is
provided. It creates and removes only `medreach_inventory_demo_test`; it never
opens the canonical dataset. Tests cover refusal boundaries, synthetic scenarios,
zero/unknown semantics, rerun preservation, concurrent fixture calls, collision
refusal, relationships, duplicates and audit output privacy.
