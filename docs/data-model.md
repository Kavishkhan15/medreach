# Data Model

Mongoose models live in `backend/src/models` and serve all three frontend
variants. Hospital matching, confidence, freshness and ranking remain
**deterministic and rule-based**. The optional assistant phrasing provider and
Gemini refinement suggestions do not establish current availability.
Published derived values must remain explainable from inspectable inputs.
See [API contracts](api.md), [privacy and stored data](privacy.md) and
[current verification](release-qa.md).

## Models

### User

- `email`, optional `passwordHash` (`select:false`, bcrypt cost 12), `name`
- `role` enum: `user | hospital_admin | system_admin | admin`
- `accountStatus`, `lastLogin`, `savedHospitals`, `emailVerifiedAt`, internal `authVersion`
- `region`, `emergencyContact`, `disabledAt`, timestamps; `regionOnboardingRequired`
  is derived from whether region is empty
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

### HospitalFieldClaim

- One current source assertion per `hospital + field + source` for name,
  address, locality, pincode, phone, emergency phone, website or specialties.
- Stores value, source page URL(s), evidence text/kind, observed time, parser
  version, confidence, asserted/reviewed actor and review history.
- Unverified/conflicting claims retain their provenance. Seed import is not
  automatic verification. Canonical field resolution is separate from current
  facility availability.

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

- `name`, optional unique `sourceKey`, `type` enum: `hospital_site |
  government_directory | official_api | authorized_feed | manual_verification`
  plus accepted legacy aliases `government | manual | other`
- `url`, `accessMethod`
- `reliability` (0..1) defaulted from `type` via `SOURCE_RELIABILITY`
- `enabled`, `lastSuccessfulFetch`, `lastFailedFetch`
- `crawlFrequencyMs`, `rateLimitMs`, health/robots status, failure counters,
  failure reason, admin notes and optional linked hospital; operational
  configuration does not authorize arbitrary crawler URLs

### CrawlJob

- `source`, `status` enum: `queued | running | success | partial | failed |
  blocked | rate_limited | parsing_error`
- timings, `recordsFound`, `recordsUpdated`, `errorMessages`, `retryCount`

### CrawlResult

- `job`, `source`, `hospital`, `payload`, `rawHash`
- `valid`, `validationErrors`, `confidence`, `applied`

### CrawlerSetting, DataConflict and HospitalFieldConflict

- `CrawlerSetting` is a unique key/value store for persistent global scheduler
  settings, including the paused flag.
- `DataConflict` records facility-capability disagreements with participating
  claims, open/resolved status, selected claim/value, method and history.
- `HospitalFieldConflict` does the same for directory fields, preserving claim
  references, selected value and resolution history. Resolving a conflict does
  not delete source evidence.

### ResourceProvider

- `kind`: `blood_bank | diagnostic | ambulance`; active flag and optional
  linked hospital/derived capability.
- Name, address, locality, city, phone, website, operating hours, services,
  listed blood groups, coverage/provider type and optional GeoJSON location.
- Provider email is `select:false`; public directory endpoints omit it.
- Source name/URL, observation time, service evidence, confidence,
  `verificationStatus` (`unverified | verified | rejected`) and `demo`.
- Verification defaults to unverified. Listed services/blood groups do not
  establish live inventory or availability.

### EmergencyRequest (standard and emergency bed requests)

- Unique public `requestId` (`MR-…`), optional user, hospital, emergency
  category, required facility and explicit `isEmergency` mode.
- Contact phone/email, optional age group/patient reference/summary, locality,
  transport flag/pickup address and hospital response.
- `status`: `REQUESTED | SENT | UNDER_REVIEW | INFORMATION_REQUESTED |
  ACCEPTED | REJECTED | EXPIRED | CANCELLED | COMPLETED`.
- `expiresAt`, `respondedAt`, timestamps and timeline entries containing status,
  actor/role, time, patient note or hospital response.
- Hidden tracking-token/idempotency-key hashes; sparse unique idempotency index.
  A guest token protects private detail/actions, while public status lookup uses
  the reference alone. Expiry changes status; it is not record deletion.
- Timeline/state transitions are checked and audited. Email delivery history is
  read from `EmailDelivery`; no personal notification collection is used.

### BloodRequest

- Unique reference: `BR-YYYYMMDD-XXXXXX` for requests or
  `BDP-YYYYMMDD-XXXXXX` for donation pledges.
- Type `REQUEST | DONATION`, optional provider/user, blood-bank name,
  blood group, patient/donor name, phone/email and notes.
- Request fields: units (1–50), urgency, `isUrgent`, hospital/doctor notes.
  Donation fields: age, weight and preferred date.
- Status: `REQUESTED | CONFIRMED | COMPLETED | CANCELLED`; timestamps.
- Hidden guest-token and idempotency hashes with sparse unique idempotency index.
  Standard/urgent urgency choices are validated by separate route contracts.
  These model states do not imply a public state-transition endpoint exists.

### AmbulanceBooking

- Unique `AMB-…` reference, provider/user and provider snapshot.
- Request snapshot persists patient name/age, transport flag, pickup address,
  contact details and notes before emails are attempted.
- Status enum: `RECORDED | UNDER_REVIEW | CONFIRMED | DISPATCHED | CANCELLED |
  COMPLETED`. The current API records/tracks bookings; it does not expose a
  general booking-state update endpoint.
- Separate user/admin/provider delivery entries retain status, attempted flag,
  attempt/sent time, safe error code and linked `EmailDelivery` ID.
- Delivery status: `not_available | pending | sent | failed | disabled`.
  A saved record or a sent message is not confirmation of dispatch.
- Hidden token/idempotency hashes; unique sparse idempotency index and
  user/provider history indexes.

### Job

- Linked hospital or provider, organization type/name, title/category,
  department, description/requirements, employment type, location,
  salary text and deadline.
- Status: `draft | pending | published | closed | rejected`; verification
  status defaults to `unverified` and review metadata identifies the reviewer.
- `createdBy`, `reviewedBy`, `demo` and timestamps. Predefined seeded listings
  are draft demo listings awaiting review; their presence does not prove a
  real verified vacancy.

### JobApplication and OrganizationApplication

- Server-generated immutable public references: `CAR-J` (job) or `CAR-O`
  (organization), followed by 14 uppercase hexadecimal characters.
- Both collections have unique sparse reference/idempotency indexes.
  Generation retries reference collisions; history serialization gives legacy
  applications a persistent reference if missing.
- Applicant and target organization/job, candidate name/phone/email,
  qualifications, experience, statement/SOP and resume metadata.
- Resume `fileUrl` can hold an external URL **or an embedded data URL**;
  this is not a separate file-storage-only model. Job applications also retain
  current organization; organization applications retain role of interest.
- Status: `submitted | under_review | shortlisted | rejected | withdrawn`;
  reviewer/time and timestamps.
- Unique applicant/job or applicant/organization indexes prevent duplicate
  applications. Submission/applicant-history serializers omit the application
  document `_id`; user-facing tracking and confirmation emails use `reference`.
  Authorized manager review still uses internal IDs internally.

### EmailDelivery

- Unique `eventKey`, recipient, template/subject, status
  (`disabled | pending | sent | failed`), attempt count, timestamps and bounded
  error metadata.
- Hidden AES-256-GCM encrypted `retryEnvelope` for replayable messages;
  `retryable`, hidden lease token/lease deadline and retry actor/time.
- Verification/password-reset templates do not retain replayable token-bearing
  content. Retry those flows by issuing fresh links.
- Optional source-model/id/channel fields connect ambulance delivery retries
  back to persisted booking metadata. System administrators control retries;
  SMTP acceptance is distinct from mailbox receipt.
- Independent bed/blood/career submission email batches cap concurrency at
  three per submission and await all attempts. Primary request/application
  state remains durable after secondary delivery failure.

### OwnershipClaim, BloodCampaign, Alert and RefinementCandidate

- `OwnershipClaim`: claimant/hospital, hospital email/domain, supporting
  document reference/explanation and review status/metadata.
- `BloodCampaign`: organizer/location/date, blood groups, contact/email,
  description, target count, creator and moderation status. A donor target
  is not an observed donation or inventory count.
- `Alert`: infrastructure/public notices, severity/region and administrative
  lifecycle; separate from the intentionally removed personal inbox.
- `RefinementCandidate`: cited facility/source evidence, proposed capability,
  model/prompt metadata and reviewer/status. Approval records a suggestion;
  separate source-claim review is required to change canonical results.

### AuditLog

- `user`, `action` enum, `entityType`, `entityId`
- `before`, `after`
- `ipHash` — SHA-256, **never** the raw IP
- `requestId`

Audit covers authentication, administrative decisions and request lifecycle,
not only verification-status changes. Some events carry no IP hash. Public
tracking never returns these actor/entity fields or request timeline content.

## Intentionally removed collections and interfaces

Google OAuth sign-in/state handling and the in-app `Notification` inbox/model/API
are removed. Existing databases may retain historical documents; removing a
model/route is not a database deletion or retention policy. Email delivery and
request timelines remain active.

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
