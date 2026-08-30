# Data Model

Mongoose models in `backend/src/models`. All scoring is **deterministic and
rule-based** — there is **no AI/ML/LLM** anywhere. Every derived value
(confidence, freshness, ranking) can be explained by inspectable inputs.

## Models

### User
- `email`, `passwordHash` (`select:false`, bcrypt), `name`
- `role` enum: `user | hospital_admin | system_admin | admin`
- `accountStatus`, `lastLogin`, `savedHospitals`
- `isAdmin` virtual; `toJSON` strips the password hash

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
- `hospital`, `facility` enum, `status` availability enum
- `count` — nullable; `null` means quantity is not exposed unless the source
  supports it
- `lastUpdated`, `source`, `confidence`
- Unique index on `hospital + facility`

### AvailabilityObservation (append-only time-series)
- `hospital`, `facility`, `status`, `quantity`
- `source`, `observedAt`, `retrievedAt`, `confidence`, `verificationStatus`
- Index: `hospital + facility + retrievedAt` (descending)

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
