# Backend directory fetch optimisation — 29 October 2026

## Change

Ordinary hospital directory pages, cursor pages and hospital detail reads now load records, latest observations, capability claims, conflict summaries and selected source metadata in one MongoDB command. A shared composer retains the existing response shape and evidence-selection policy. Freshness is checked again after database I/O, so a slow query cannot extend an observation's lifetime.

Diagnostic, blood-bank and ambulance directory reads check parent-hospital archival in the provider query, removing a sequential global archived-ID lookup. Archived parents, inactive providers and pending/rejected providers remain excluded. Legacy approval semantics are unchanged.

The pipeline explicitly applies Mongoose `select:false` exclusions, since aggregation does not apply those defaults. Provider emails, internal lease tokens and review journals are not returned. Public availability is never cached. No frontend components, accounts, existing records or indexes were changed.

Text search, geospatial search and derived availability-status filtering retain their existing specialised paths. Exact totals remain exact: a separate indexed count branch shares the command, while cursor clients with `includeTotal=false` omit it. Pagination limits apply before evidence joins. No all-directory facet materialisation or precomputed availability summary was added.

## Measurements and limits

Seven alternating hosted samples per endpoint, repeated after deployment, produced these warm upper medians (first sample excluded):

| Public endpoint | Before | After | After repeat | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `/api/hospitals?limit=12` | 212.8 ms | 152.5 ms | 152.3 ms | 28.3% |
| `/api/diagnostics` | 199.2 ms | 122.0 ms | 126.4 ms | 38.8% |
| `/api/hospitals?pagination=cursor&includeTotal=false&limit=12` | 213.8 ms | 158.5 ms | 152.4 ms | 25.9% |

Every sample returned HTTP 200. Payload sizes remained 13,093, 14,228 and 13,219 bytes respectively. Railway's hospital request logs dropped from approximately 135 ms to 78–80 ms of API processing, including 76–78 ms in the joined read. All four Railway services completed deployment and API readiness returned HTTP 200.

Railway request logs attributed about 135 ms to the API: approximately 66 ms for directory queries followed by 67 ms for evidence loading. The normal hospital page now issues one command instead of eight in the measured dataset. Its Atlas query plan examined 12 hospital documents and 12 directory-index keys for a 12-record page; evidence lookups used hospital indexes.

There is a trade-off: a nearby read-only Atlas client measured a 12.54 ms baseline median versus 23.71 ms for the joined query. Those numbers include client/database I/O and are not hosted endpoint latency. Joined execution performs more database-side work in exchange for avoiding sequential network trips. Hosted before/after sampling is therefore the release comparison; fewer commands alone do not prove a universal speedup. The current live dataset has no availability-evidence records, so evidence-rich correctness is additionally tested with isolated fixtures.

Repeat the same small, read-only hosted comparison with:

```sh
node backend/scripts/benchmarkFetchReads.js \
  https://medreach-production.up.railway.app /tmp/medreach-fetch-samples.json
```

The script makes 21 sequential public GETs, excludes each endpoint's first sample from warm statistics, records status and payload size, and refuses to overwrite an existing report. Six warm samples are a spot check, not a sustained-load p95 or a guarantee about every user's connection. Report cold results separately because connection state and deployment warm-up affect them.

## Verification and rollback

- Full backend suite: 641 passed, zero failed/skipped.
- Bootstrap browser journeys: 20 passed, including hospital discovery, provider/admin access, private tracking and diagnostic requests.
- Focused real-MongoDB checks compare joined data with the original batch composer, verify observed/retrieved timestamp precedence, reject future evidence, withhold expired/unverified quantities, preserve confirmed zero, and exclude archived parents and private fields.
- Backend lint: zero errors; seven existing warnings.

Two browser expectations were brought up to date with the existing Bootstrap overview title and diagnostic tracking option. No product UI was changed.

The release uses existing indexes and makes no database migration. Reverting the application commit restores the previous read strategy without a data rollback. Do not replace these checks with caching that can expose stale numerical availability or private responses.
