# Data Model

Mongoose models in `backend/src/models`. Hospital matching, confidence,
freshness, and ranking remain **deterministic and rule-based**. The existing
optional assistant is separate, and the proposed Gemini refinement pipeline
may only create cited claims for review; neither is an authority for current
availability. Every published derived value must be explainable from
inspectable inputs.

## Models

### User
- `email`, optional `passwordHash` (`select:false`, bcrypt cost 12), `name`
- `role` enum: `user | hospital_admin | system_admin | admin`
- `accountStatus`, `lastLogin`, `savedHospitals`, `emailVerifiedAt`, internal `authVersion`
- `isAdmin` virtual; `toJSON` strips the password hash and auth version

### AuthToken
- One collection for hashed, expiring, single-use `verify_email`, `reset_password`, and `refresh_session` records.
- Refresh rows have a random family ID, used/revoked/replaced timestamps and hashed IP/user-agent fingerprints. Raw refresh/reset tokens are never stored.
- TTL index on `expiresAt`; indexes on user/purpose/revocation and family/purpose support session and replay operations.

For an existing database, rerun `npm --workspace @medreach/backend run migrate:auth-security` after deployment. The idempotent migration initializes missing `authVersion` values, removes retired sign-in identifiers and transient state records, and synchronizes the `User` and `AuthToken` indexes. It preserves user accounts and passwords.

### Hospital
- `name`, `slug`, `description`
- `hospitalType` enum: `Government | Private | Trust | Municipal | Teaching |
  Specialty`
- `address`, `locality`, `city`, `region`, `pincode`
- `location` — GeoJSON with a `2dsphere` index
- `phone`, `emergencyPhone`, `website`
- `specialties` (mirrored to `departments`), `services`, `operatingHours`
- `emergencyDepartmentStatus` / `ambulanceStatus` — availability enums
- Legacy fields: `emergencyStatus`, `bedsTotal`, `bedsAvailable`
- `verificationStatus` enum: `unverified | pending | verified | rejected |
  stale`; `verificationDate`
- `sourceIds`, `admins`
- Indexes: text + `2dsphere`

### HospitalFacility
- `hospital`, `facility` enum, `capability` (`yes | no | unknown`)
- `capabilityConflict` records whether non-rejected sources disagree, even when
  a verified claim selects a value.
- Legacy `status` remains in storage for compatibility but crawler writes keep it
  `unknown`. It is **not** used as current availability by the public API.
- `count` is legacy storage; the public API only publishes a quantity from a
  recent, verified `AvailabilityObservation`.
- `lastUpdated`, `source`, `confidence`
- Unique index on `hospital + facility`

### FacilitySourceClaim
- One current capability assertion per `hospital + facility + DataSource`, with
  source page URL, observed timestamp, confidence, and review status.
- The resolver keeps unreviewed disagreements as `unknown`. A verified claim
  can select a value while the dispute flag remains; opposed verified claims
  remain `unknown`. `CrawlResult` retains earlier crawl payloads for history.
- System administrators review source claims at `/api/admin/facility-claims`;
  the action is audited and recalculates the materialized `HospitalFacility`.

### AvailabilityObservation (append-only time-series)
- `hospital`, `facility`, `status`, `quantity`
- `source`, `observedAt`, `retrievedAt`, `confidence`, `verificationStatus`
- `verifiedBy` identifies an assigned hospital staff or system administrator
  when the observation was entered through the protected API.
- Index: `hospital + facility + retrievedAt` (descending)

The public hospital and facility endpoints compose these two collections using
[`hospital-facility-view.schema.json`](contracts/hospital-facility-view.schema.json).
Current availability requires a verified observation no older than 30 minutes;
otherwise status and quantity are `unknown` and `null`. A static source may
confirm capability but cannot imply current beds. The old hospital-level
`bedsAvailable: 0` default is suppressed as `null` in public read views.

### DataSource
- `name`, `type` enum: `official_api | hospital_site | government |
  authorized_feed | manual | other`
- `url`, `accessMethod`
- `reliability` (0..1) defaulted from `type` via `SOURCE_RELIABILITY`
- `enabled`, `lastSuccessfulFetch`, `lastFailedFetch`

### CrawlJob
- `source`, `status` enum: `queued | running | success | partial | failed |
  blocked | rate_limited | parsing_error`
- timings, `recordsFound`, `recordsUpdated`, `errorMessages`, `retryCount`

### CrawlResult
- `job`, `source`, `hospital`, `payload`, `rawHash`
- `valid`, `validationErrors`, `confidence`, `applied`

### AuditLog
- `user`, `action` enum, `entityType`, `entityId`
- `before`, `after`
- `ipHash` — SHA-256, **never** the raw IP
- `requestId`

## Deterministic FRESHNESS thresholds
- `RECENT` — < 10 min
- `UPDATED_RECENTLY` — < 60 min
- `STALE` — < 6 h
- `OUTDATED` — older than the above
- `UNKNOWN` — no timestamp available

## Deterministic CONFIDENCE
Levels `HIGH | MEDIUM | LOW | UNKNOWN`, derived from source reliability,
recency, verification status, and parse quality.

## Transparent RANKING weights
Weighted, inspectable scoring with per-factor reasons:

| Factor | Weight |
|--------|--------|
| emergencySuitability | 0.30 |
| specialtyMatch | 0.20 |
| facilityAvailability | 0.20 |
| travelEfficiency | 0.20 |
| dataConfidence | 0.10 |
