# MedReach Database Schema & Data Dictionary

This document serves as the authoritative specification of the MedReach MongoDB data layer (Mongoose 8.x, MongoDB 7.0+). The data layer enforces **privacy-by-design**, **append-only volatile resource tracking**, and **strict organizational isolation** across the three operational frontends (Bootstrap, Tailwind, Skeleton).

---

## Architecture & Design Invariants

```text
┌─────────────────┐       ┌──────────────────────┐       ┌────────────────────────┐
│  User Accounts  │──────<│ Provider Memberships │>──────│ Healthcare Orgs        │
│  (Auth & Roles) │       │ (Hospital / Resource)│       │ (Hospital, Blood, Amb) │
└─────────────────┘       └──────────────────────┘       └────────────────────────┘
         │                                                            │
         │ (1:N)                                                      │ (1:N)
         ▼                                                            ▼
┌──────────────────┐                                     ┌────────────────────────┐
│ Activity & Leases│                                     │ Resource Requests      │
│ (Tokens, Audits) │                                     │ (Bed, Blood, Ambulance)│
└──────────────────┘                                     └────────────────────────┘
```

1. **Privacy-by-Design:** No electronic health records (EHR) or longitudinal diagnostic histories are stored. Citizen profiles retain only essential dispatch parameters (`name`, `email`, `region`, `emergencyContact`).
2. **Volatile Resource Evidence:** Static facilities (`HospitalFacility`) record verified capabilities (`yes | no | unknown`), whereas live operational bed and ICU statuses are stored in an append-only time series (`AvailabilityObservation`). We never mutate historical evidence.
3. **Multi-Tenant Provider Isolation:** `ProviderMembership` explicitly scopes `provider_admin` accounts to assigned organizations. Cross-tenant access is rejected at the query layer.
4. **Idempotency & Replay Protection:** Inbound requests (emergency beds, blood, ambulance dispatch) store cryptographic hashes of idempotency keys (`idempotencyKeyHash`) with unique sparse indexes to reject duplicates.
5. **Secret Redaction by Default:** Sensitive authentication artifacts (`passwordHash`, `authVersion`, `trackingTokenHash`, `submissionFingerprint`, `provisioningKey`) configure `select: false` in Mongoose schemas to prevent accidental serialization in API responses.

---

## Entity-Relationship Diagram

A high-resolution SVG diagram of all collections and relationship edges is maintained at [`docs/diagrams/database-er.svg`](diagrams/database-er.svg) (source: [`docs/diagrams/database-er.mmd`](diagrams/database-er.mmd)).

---

## Complete Collections Data Dictionary

### 1. `users` (`User.js`)
Stores authenticated actors across all three roles: `system_admin`, `provider_admin`, and `user`.

| Field | BSON / Mongoose Type | Required | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Yes | Auto | Unique user primary identifier. |
| `email` | `String` | Yes | None | Unique, lowercase, trimmed, validated via RFC email regex. |
| `passwordHash` | `String` | No | None | Bcrypt hash with salt work factor 12. **`select: false`**. |
| `name` | `String` | Yes | None | Full name, max 120 characters, trimmed. |
| `role` | `String` | Yes | `"user"` | Enum: `["user", "provider_admin", "system_admin", "admin", "hospital_admin", "user_admin"]`. |
| `accountStatus`| `String` | Yes | `"active"` | Enum: `["active", "suspended", "pending"]`. |
| `region` | `String` | No | None | Locality binding (e.g., `"Mumbai"`). Indexed for localized discovery. |
| `emergencyContact` | `String` | No | None | Emergency phone contact for dispatch, max 120 chars. |
| `emailVerifiedAt` | `Date` | No | None | Timestamp when email verification was completed. |
| `lastLogin` | `Date` | No | None | Timestamp of the most recent successful authentication. |
| `savedHospitals` | `Array<ObjectId>` | No | `[]` | References to favorited `Hospital` documents. |
| `authVersion` | `Number` | Yes | `0` | Monotonically increasing revision counter for immediate revocation. **`select: false`**. |
| `provisioningKey`| `String` | No | None | Unique sparse token for automated account provisioning. **`select: false`**. |
| `demoAccount` | `Boolean` | No | `false` | Distinguishes demo accounts from production credentials. |
| `notificationEmail` | `String` | No | None | Opt-in email for emergency dispatch alerts. Max 150 chars. |
| `notificationsEnabled` | `Boolean` | No | `false` | Global toggle for receiving emergency broadcast alerts. |
| `createdAt` | `Date` | Yes | Auto | Document creation timestamp. |
| `updatedAt` | `Date` | Yes | Auto | Last document modification timestamp. |

**Indexes:**
- `{ email: 1 }` (Unique)
- `{ region: 1 }`
- `{ provisioningKey: 1 }` (Unique, Sparse)

---

### 2. `auth_tokens` (`AuthToken.js`)
Manages rotating refresh sessions, password reset tokens, and email verification tokens.

| Field | BSON / Mongoose Type | Required | Constraints & Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Yes | Unique token record ID. |
| `user` | `ObjectId` | No | Ref to `User`. Indexed. |
| `purpose` | `String` | Yes | Enum: `["verify_email", "reset_password", "refresh_session", "provider_activation", "notification_email"]`. |
| `tokenHash` | `String` | Yes | SHA-256 hash of the plain-text token. Unique. |
| `familyId` | `String` | No | UUIDv4 grouping a refresh token rotation chain. Indexed. |
| `replacedBy` | `ObjectId` | No | Ref to successor `AuthToken` upon legitimate token rotation. |
| `expiresAt` | `Date` | Yes | Absolute expiration timestamp. Backed by MongoDB TTL index. |
| `usedAt` | `Date` | No | Timestamp of first token consumption. |
| `revokedAt` | `Date` | No | Timestamp of token revocation (e.g., family breach). |
| `revokeReason`| `String` | No | Reason code (e.g., `"token_reuse_detected"`, `"logout"`). Max 80 chars. |
| `ipHash` | `String` | No | One-way hash of client IP address for anomaly detection. |
| `userAgentHash`| `String` | No | One-way hash of client User-Agent string. |
| `metadata` | `Mixed` | No | Purpose-specific payload data. **`select: false`**. |

**Indexes:**
- `{ expiresAt: 1 }` (TTL: `expireAfterSeconds: 0`)
- `{ tokenHash: 1 }` (Unique)
- `{ familyId: 1, purpose: 1 }`
- `{ user: 1, purpose: 1, revokedAt: 1, expiresAt: -1 }`

---

### 3. `hospitals` (`Hospital.js`)
Verified acute care, municipal, trust, and private hospital directory.

| Field | BSON / Mongoose Type | Required | Constraints & Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Yes | Unique hospital identifier. |
| `name` | `String` | Yes | Registered hospital name, max 200 chars. |
| `slug` | `String` | Yes | URL-safe identifier (e.g., `kem-hospital-mumbai-12345`). Unique. |
| `hospitalType` | `String` | No | Enum: `["Government", "Private", "Trust", "Municipal", "Teaching", "Specialty"]`. |
| `address` | `String` | No | Physical street address. |
| `locality` | `String` | No | Ward / suburb (e.g., `"Parel"`, `"Bandra"`). Indexed. |
| `city` | `String` | No | City name (e.g., `"Mumbai"`). Indexed. |
| `region` | `String` | No | Broader geographic region. Indexed. |
| `location` | `Object` | Yes | GeoJSON Point: `{ type: "Point", coordinates: [lng, lat] }`. |
| `phone` | `String` | No | Standard reception telephone. |
| `emergencyPhone`| `String` | No | 24/7 emergency department hotline. |
| `website` | `String` | No | Official website URL. |
| `specialties` | `Array<String>` | No | Medical specialties (mirrored to `departments`). |
| `services` | `Array<String>` | No | Available clinical services (e.g., `"24x7 Emergency"`). |
| `operatingHours`| `String` | No | Working hours description. |
| `verificationStatus` | `String` | Yes | Enum: `["unverified", "pending", "verified", "rejected", "stale"]`. |
| `verificationDate` | `Date` | No | Date when hospital credentials were authenticated. |
| `sourceIds` | `Array<ObjectId>` | No | References to contributing `DataSource` records. |
| `admins` | `Array<ObjectId>` | No | Assigned `User` administrators. |

**Indexes:**
- `{ location: "2dsphere" }` (Geospatial proximity search)
- `{ name: "text", city: "text", locality: "text", departments: "text", specialties: "text", services: "text" }` (Full-text search)
- `{ slug: 1 }` (Unique)

---

### 4. `resource_providers` (`ResourceProvider.js`)
Standalone and hospital-affiliated support organizations: blood banks, diagnostic imaging labs, and ambulance dispatch fleets.

| Field | BSON / Mongoose Type | Required | Constraints & Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Yes | Unique provider ID. |
| `kind` | `String` | Yes | Enum: `["blood_bank", "diagnostic", "ambulance"]`. Indexed. |
| `name` | `String` | Yes | Organization legal trade name, max 180 chars. |
| `hospital` | `ObjectId` | No | Ref to parent `Hospital` if co-located. |
| `address` | `String` | No | Physical address, max 300 chars. |
| `locality` | `String` | No | Suburb / neighborhood. Indexed. |
| `city` | `String` | Yes | Default: `"Mumbai"`. |
| `phone` | `String` | No | Primary operational telephone. |
| `email` | `String` | No | Operational dispatch email. **`select: false`**. |
| `services` | `Array<String>` | No | Diagnostic tests, blood components, or vehicle types. |
| `listedBloodGroups` | `Array<String>`| No | Array of supported groups: `["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]`. |
| `location` | `Object` | No | Optional GeoJSON Point coordinates for routing. |
| `confidence` | `String` | Yes | Enum: `["HIGH", "MEDIUM", "LOW", "UNKNOWN"]`. Default: `"UNKNOWN"`. |
| `verificationStatus` | `String` | Yes | Enum: `["unverified", "verified", "rejected"]`. Default: `"unverified"`. |
| `approvalStatus` | `String` | No | Enum: `["pending", "approved", "rejected"]`. |
| `demo` | `Boolean` | Yes | Default: `false`. |

**Indexes:**
- `{ kind: 1, locality: 1 }`
- `{ hospital: 1, kind: 1, derivedFromCapability: 1 }` (Unique, partial filter)
- `{ location: "2dsphere" }` (Partial filter where coordinates exist)

---

### 5. `provider_memberships` (`ProviderMembership.js`)
Strict multi-tenant access control table assigning users to hospitals or resource providers.

| Field | BSON / Mongoose Type | Required | Constraints & Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Yes | Membership record ID. |
| `user` | `ObjectId` | Yes | Ref to `User` (`role: "provider_admin"`). Indexed. |
| `organization`| `ObjectId` | Yes | Ref to either `Hospital` or `ResourceProvider`. Indexed. |
| `kind` | `String` | Yes | Enum: `["hospital", "blood_bank", "diagnostic", "ambulance"]`. |
| `active` | `Boolean` | Yes | Default: `true`. Toggle for immediate access suspension. |
| `assignedBy` | `ObjectId` | Yes | Ref to `User` (`system_admin`) who granted authorization. |

**Indexes:**
- `{ user: 1, kind: 1, organization: 1 }` (Unique compound index preventing duplicate assignments)

---

### 6. `provider_applications` (`ProviderApplication.js`)
Self-service onboarding requests submitted by healthcare organizations.

| Field | BSON / Mongoose Type | Required | Constraints & Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Yes | Application ID. |
| `kind` | `String` | Yes | Enum: `["hospital", "blood_bank", "diagnostic", "ambulance"]`. |
| `name` | `String` | Yes | Registered facility name, max 180 chars. |
| `address` | `String` | Yes | Physical location, max 300 chars. |
| `phone` | `String` | No | Telephone contact, max 40 chars. |
| `website` | `String` | No | Organization portal URL. |
| `contactEmail`| `String` | Yes | Primary administrator email, lowercase. |
| `contactName` | `String` | No | Primary administrator contact person. |
| `city` | `String` | No | Operating municipality. |
| `status` | `String` | Yes | Enum: `["pending", "approved", "rejected"]`. Default: `"pending"`. |
| `organization`| `ObjectId` | Yes | Pre-allocated ObjectId for the target entity upon approval. |
| `account` | `ObjectId` | No | Ref to automatically provisioned `User` account upon approval. |
| `reviewedBy` | `ObjectId` | No | Ref to `User` (`system_admin`) who resolved the application. |
| `reviewedAt` | `Date` | No | Timestamp of review action. |
| `reviewNote` | `String` | No | Internal audit note regarding compliance verification. |
| `submissionFingerprint` | `String` | No | Rate-limiting & duplicate submission fingerprint. **`select: false`**. |

**Indexes:**
- `{ submissionFingerprint: 1 }` (Unique, Sparse)

---

### 7. `emergency_requests` (`EmergencyRequest.js`)
Bed requisitions submitted by citizens or emergency medical technicians. Supports both emergency (`isEmergency: true`) and routine elective (`isEmergency: false`) admissions.

| Field | BSON / Mongoose Type | Required | Constraints & Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Yes | Record ID. |
| `requestId` | `String` | Yes | Unique public tracking code (e.g., `REQ-EMG-2026-081`). Indexed. |
| `user` | `ObjectId` | No | Ref to `User` if logged in; `null` for guest submissions. Indexed. |
| `hospital` | `ObjectId` | Yes | Ref to target `Hospital`. Indexed. |
| `emergencyType`| `String` | Yes | Clinical emergency category (e.g., `"Cardiac Arrest"`). Max 80 chars. |
| `requiredFacility`| `String` | Yes | Enum from `FACILITY_TYPES` (e.g., `"ICU"`, `"Trauma Center"`). |
| `patientAgeGroup`| `String` | Yes | Enum: `["infant", "child", "adult", "older_adult", "unknown"]`. |
| `patientReference`| `String` | No | Patient pseudonym or name reference, max 80 chars. |
| `patientSummary`| `String` | No | Brief triage notes, symptoms, SpO2, vitals. Max 500 chars. |
| `contactPhone` | `String` | Yes | Caller phone number for hospital triage callback. |
| `contactEmail` | `String` | No | Email for automated status updates. |
| `isEmergency` | `Boolean` | Yes | Default: `true`. Distinguishes urgent triage from standard bookings. |
| `ambulanceRequired`| `Boolean`| Yes | Default: `false`. Requests hospital-arranged transport coordination. |
| `ambulancePickupAddress`| `String`| No | Street address for ambulance pickup. Max 300 chars. |
| `status` | `String` | Yes | Enum: `["REQUESTED", "SENT", "UNDER_REVIEW", "INFORMATION_REQUESTED", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED", "COMPLETED"]`. |
| `hospitalResponse`| `String` | No | Clinical triage explanation from hospital staff. |
| `expiresAt` | `Date` | Yes | Automated expiration threshold (e.g., +2 hours). Indexed. |
| `timeline` | `Array<Object>` | Yes | Array of status transitions: `{ status, actor, at, note, hospitalResponse, actorRole }`. |
| `trackingTokenHash`| `String` | No | SHA-256 hash of private guest tracking token. **`select: false`**. |
| `idempotencyKeyHash`| `String`| No | SHA-256 hash of submission Idempotency-Key. **`select: false`**. |

**Indexes:**
- `{ requestId: 1 }` (Unique)
- `{ hospital: 1, status: 1, createdAt: -1 }`
- `{ expiresAt: 1 }`
- `{ idempotencyKeyHash: 1 }` (Unique, Sparse)

---

### 8. `blood_requests` (`BloodRequest.js`)
Requisitions for urgent blood units or citizen blood donation pledges.

| Field | BSON / Mongoose Type | Required | Constraints & Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Yes | Document identifier. |
| `reference` | `String` | Yes | Public reference code (e.g., `BLD-REQ-2026-099`). Unique, indexed. |
| `type` | `String` | Yes | Enum: `["REQUEST", "DONATION"]`. Indexed. |
| `provider` | `ObjectId` | No | Ref to `ResourceProvider` (`kind: "blood_bank"`). Indexed. |
| `bloodBankName`| `String` | Yes | Organization display name, max 200 chars. |
| `bloodGroup` | `String` | Yes | Enum: `["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]`. |
| `patientOrDonorName`| `String`| Yes | Recipient patient or donor full name. |
| `units` | `Number` | No | Number of packed units (1–50) for `REQUEST`. Default: `1`. |
| `urgency` | `String` | Yes | Urgency tier (e.g., `"Immediate / 6 hours"`, `"Within 24 hours"`). |
| `isUrgent` | `Boolean` | Yes | Default: `false`. Triggers high-priority staff alert. |
| `status` | `String` | Yes | Enum: `["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "REJECTED"]`. |
| `contactPhone` | `String` | Yes | Verified phone for dispatch verification. |
| `contactEmail` | `String` | No | Optional notification email. |
| `notes` | `String` | No | Clinical doctor notes, cross-matching requirements, or donor health notes. |
| `user` | `ObjectId` | No | Ref to logged-in `User`. Indexed. |
| `trackingTokenHash` | `String` | No | SHA-256 hash of private guest tracking token. **`select: false`**. |
| `idempotencyKeyHash`| `String` | No | SHA-256 hash of client submission idempotency key. **`select: false`**. Unique, sparse. |

**Indexes:**
- `{ reference: 1 }` (Unique)
- `{ provider: 1, createdAt: -1 }`
- `{ user: 1, createdAt: -1 }`

---

### 9. `ambulance_bookings` (`AmbulanceBooking.js`)
Emergency and scheduled ambulance bookings.

| Field | BSON / Mongoose Type | Required | Constraints & Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Yes | Document identifier. |
| `reference` | `String` | Yes | Public tracking reference (e.g., `AMB-2026-012`). Unique, indexed. |
| `provider` | `ObjectId` | Yes | Ref to `ResourceProvider` (`kind: "ambulance"`). Indexed. |
| `user` | `ObjectId` | No | Ref to logged-in `User`. Indexed. |
| `isEmergency` | `Boolean` | Yes | Default: `false`. Urgent cardiac/trauma dispatch vs. standard transport. |
| `providerSnapshot`| `Object` | Yes | Embedded snapshot: `{ name, phone, email }`. |
| `requestSnapshot` | `Object` | Yes | Embedded snapshot: `{ patientName, patientAge, pickupAddress, contactPhone, notes }`. |
| `status` | `String` | Yes | Enum: `["RECORDED", "UNDER_REVIEW", "CONFIRMED", "DISPATCHED", "COMPLETED", "CANCELLED", "REJECTED"]`. |
| `delivery` | `Object` | Yes | Embedded delivery state for `{ user, admin, provider }`. |
| `trackingTokenHash`| `String`| Yes | SHA-256 hash of guest access token. **`select: false`**. |

**Indexes:**
- `{ reference: 1 }` (Unique)
- `{ provider: 1, createdAt: -1 }`
- `{ user: 1, createdAt: -1 }`
- `{ idempotencyKeyHash: 1 }` (Unique, Sparse)

---

### 10. `jobs` (`Job.js`) & `job_applications` (`JobApplication.js`)
Medical and clinical recruitment board connecting hospitals with verified staff.

- **`jobs`:** Managed by hospital and healthcare provider administrators. Categories: `Doctor`, `Nurse`, `Technician`, `Pharmacist`, `Administrative`, `Emergency Staff`, `Internship`. Supports statuses: `draft`, `pending`, `published`, `closed`.
- **`job_applications`:** Candidate submissions with resume uploads, qualification summaries, statement of purpose, and status tracking (`submitted`, `under_review`, `shortlisted`, `rejected`, `withdrawn`). Unique composite index on `{ job: 1, applicant: 1 }`.
- **`organization_applications` (`OrganizationApplication.js`):** Candidate applications submitted directly to specific healthcare organizations (`hospital` or `provider`). References format `CAR-O*`, tracking candidates across `submitted`, `under_review`, `shortlisted`, `rejected`, `withdrawn`.

---

### 11. `availability_observations` (`AvailabilityObservation.js`)
Append-only time-series for tracking live hospital facility status (e.g., ICU beds, ventilators).

| Field | BSON / Mongoose Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `hospital` | `ObjectId` | Yes | Ref to `Hospital`. Indexed. |
| `facility` | `String` | Yes | Enum from `FACILITY_TYPES`. |
| `status` | `String` | Yes | Enum: `["available", "limited", "unavailable", "unknown"]`. |
| `quantity` | `Number` | No | Available units (e.g., 4 free ICU beds). |
| `source` | `ObjectId` | No | Ref to `DataSource`. |
| `observedAt` | `Date` | No | Time recorded at source. |
| `retrievedAt`| `Date` | Yes | Default: `Date.now`. Time ingested into system. |
| `confidence` | `String` | Yes | Enum: `["HIGH", "MEDIUM", "LOW", "UNKNOWN"]`. |

**Indexes:**
- `{ hospital: 1, facility: 1, retrievedAt: -1 }` (Enables instant sub-millisecond retrieval of the newest observation)

---

### 12. Supporting Provenance & Audit Collections
- **`data_sources` (`DataSource.js`):** Ingestion provenance registry tracking source confidence, URLs, crawl history, and authority ratings.
- **`hospital_facilities` (`HospitalFacility.js`):** Static capabilities (`yes | no | unknown`) per hospital. Unique index on `{ hospital: 1, facility: 1 }`.
- **`audit_logs` (`AuditLog.js`):** Append-only audit record of administrative actions, role modifications, and status changes.
- **`email_deliveries` (`EmailDelivery.js`):** Transactional dispatch logging with SMTP message IDs, error codes, and retry counters.
- **`request_notifications` (`RequestNotification.js`):** Internal queuing and dispatch ledger for multi-channel email alerts.

---

## Schema Enums Summary (`backend/src/config/constants.js`)

```javascript
export const ROLES = {
  USER: "user",
  PROVIDER_ADMIN: "provider_admin",
  SYSTEM_ADMIN: "system_admin"
};

export const FACILITY_TYPES = [
  "ICU", "NICU", "PICU", "CCU", "Trauma ICU",
  "Emergency Department", "Trauma Center", "Cardiology",
  "Neurology", "Pediatrics", "Maternity", "Burns Unit",
  "Blood Bank", "Dialysis", "CT", "MRI", "Ventilator",
  "Operating Theatre", "Pharmacy", "Ambulance"
];

export const REQUEST_STATES = [
  "REQUESTED", "SENT", "UNDER_REVIEW", "INFORMATION_REQUESTED",
  "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED", "COMPLETED"
];
```
