# MedReach Backend REST API Specification

The MedReach platform exposes an isomorphic REST API powering all three frontend variants (Bootstrap, Tailwind, and Skeleton). The API is built on Express 4 with MongoDB/Mongoose persistence, adhering to deterministic healthcare data integrity and strict multi-tenant access control.

---

## Global API Conventions

### Base URL & Environment
- **Local Development:** `http://localhost:4000`
- **Hosted / Production:** Configured via `NEXT_PUBLIC_API_URL` (e.g., `https://api.medreach.example`). Frontends embed this during build time.

### Transport & Encoding
- All requests must use HTTPS in production.
- Request payloads must be JSON (`Content-Type: application/json`).
- Standard response envelopes:
  - Success collections: `{ data: [...] }` or entity-specific `{ hospital: {...} }`, `{ request: {...} }`
  - Mutation feedback: `{ success: true, message: "...", record?: {...} }`
  - Error responses: `{ error: "Error message", details?: [...] }`

### Authentication & Sessions
- **Session Transport:** HttpOnly, Secure, SameSite cookies:
  - `medreach.token`: Short-lived access JWT (default 15 minutes).
  - `medreach.refresh`: Hashed rotating refresh token (default 7 days).
- **Bearer Tokens:** Accepted in `Authorization: Bearer <jwt>` for automated API clients.
- **CSRF & Isolation:** Protected by CORS whitelisting (`CORS_ORIGINS`) and credentials isolation (`credentials: "include"`).

### Idempotency Keys
Mutating submissions (bed requests, blood requisitions, ambulance dispatch, job applications) accept an optional `Idempotency-Key` header (8–200 characters). Duplicate submissions with the same key replay the original response without executing duplicate database mutations or sending redundant notification emails.

---

## 1. Health & Diagnostics

### `GET /health`
Liveness and MongoDB connection status.
- **Access:** Public
- **Response (200 OK):**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-10-14T08:00:00.000Z"
}
```

### `GET /health/ready`
Kubernetes / Railway readiness probe. Returns `200 OK` only when MongoDB connection is active and server is not draining. Returns `503 Service Unavailable` during shutdown or disconnection.

---

## 2. Authentication & User Profile (`/api/auth`)

### `POST /api/auth/register`
Register a new citizen account.
- **Access:** Public
- **Body:**
```json
{
  "name": "Priya Sharma",
  "email": "priya.sharma@example.com",
  "password": "SecurePassword123!"
}
```
- **Response (201 Created):** Sets session cookies and returns `{ user: {...} }`.

### `POST /api/auth/login`
Authenticate using email and password.
- **Access:** Public (Rate-limited: 5 attempts / 15 min per IP)
- **Body:**
```json
{
  "email": "priya.sharma@example.com",
  "password": "SecurePassword123!"
}
```
- **Response (200 OK):** Sets `medreach.token` and `medreach.refresh` cookies, returns `{ user: {...} }`.

### `POST /api/auth/refresh`
Rotate refresh token family and issue fresh access token.
- **Access:** Public (requires `medreach.refresh` cookie)
- **Response (200 OK):** Returns `{ success: true }`. *If token reuse is detected, the entire session family is revoked immediately.*

### `POST /api/auth/logout`
Revoke active session family and clear client cookies.
- **Access:** Authenticated
- **Response (200 OK):** `{ message: "Logged out" }`.

### `GET /api/auth/me`
Retrieve currently authenticated user and saved hospital favorites.
- **Access:** Authenticated
- **Response (200 OK):**
```json
{
  "user": {
    "_id": "670c...",
    "name": "Priya Sharma",
    "email": "priya.sharma@example.com",
    "role": "user",
    "region": "Mumbai",
    "savedHospitals": ["670d..."],
    "regionOnboardingRequired": false
  }
}
```

### `PUT /api/auth/profile`
Update user profile and locality.
- **Access:** Authenticated
- **Body:** `{ "name": "Priya S.", "region": "Mumbai", "emergencyContact": "+91 98765 40000" }`

---

## 3. Hospital Directory & Live Facilities (`/api/hospitals`)

### `GET /api/hospitals`
Search and filter verified hospitals.
- **Access:** Public
- **Query Parameters:**
  - `q`: Free-text search matching name, specialties, locality, or services.
  - `city`: Filter by city (e.g., `Mumbai`).
  - `locality`: Filter by ward/locality (e.g., `Parel`).
  - `specialty`: Filter by medical specialty (e.g., `Cardiology`).
  - `lat`, `lng`: Geolocation coordinates for proximity sorting (`2dsphere`).
  - `page`: Page index (default: `1`).
  - `limit`: Number of items (default: `20`, max: `50`).
- **Response (200 OK):**
```json
{
  "hospitals": [
    {
      "_id": "670c...",
      "name": "King Edward Memorial Hospital (KEM)",
      "slug": "kem-hospital-mumbai-12345",
      "hospitalType": "Municipal",
      "locality": "Parel",
      "city": "Mumbai",
      "location": { "type": "Point", "coordinates": [72.8427, 18.9986] },
      "specialties": ["Emergency Medicine", "Cardiology", "Trauma Care"],
      "emergencyDepartmentStatus": "available",
      "ambulanceStatus": "available",
      "verificationStatus": "verified"
    }
  ],
  "total": 30,
  "page": 1,
  "pages": 2
}
```

### `GET /api/hospitals/:slug`
Retrieve hospital detail, verified facilities, and contact information.
- **Access:** Public

### `GET /api/hospitals/:id/availability`
Retrieve real-time append-only facility status observations.
- **Access:** Public
- **Response (200 OK):**
```json
{
  "observations": [
    {
      "facility": "ICU",
      "status": "available",
      "quantity": 4,
      "retrievedAt": "2026-10-14T08:15:00.000Z",
      "confidence": "HIGH"
    }
  ]
}
```

### `POST /api/hospitals/:id/availability`
Submit verified facility observation report (e.g. ICU bed census).
- **Access:** Authenticated (`system_admin` or assigned `provider_admin`)
- **Body:** `{ "facility": "ICU", "status": "limited", "quantity": 2, "confidence": "HIGH" }`

---

## 4. Bed Requisitions & Emergency Triage (`/api/emergency-requests`)

### `POST /api/emergency-requests/emergency`
Submit high-priority emergency bed requisition.
- **Access:** Public / Guest permitted
- **Headers:** `Idempotency-Key` (Optional)
- **Body:**
```json
{
  "hospitalId": "670c...",
  "emergencyType": "Acute Myocardial Infarction",
  "requiredFacility": "ICU",
  "patientAgeGroup": "adult",
  "patientReference": "Suresh Sharma",
  "patientSummary": "Severe chest pain, SpO2 91%",
  "contactPhone": "+91 98765 40000",
  "contactEmail": "family@example.com",
  "ambulanceRequired": true,
  "ambulancePickupAddress": "Worli, Mumbai"
}
```
- **Response (201 Created):**
```json
{
  "request": {
    "requestId": "REQ-EMG-2026-081",
    "status": "REQUESTED",
    "hospital": "670c...",
    "expiresAt": "2026-10-14T10:15:00.000Z"
  },
  "trackingToken": "tok_sec_9918237461928"
}
```
*Note: The plain-text `trackingToken` is returned only once upon guest submission. The database stores only its SHA-256 hash.*

### `POST /api/emergency-requests/standard`
Submit routine or elective admission request. Requires logged-in citizen account.

### `GET /api/emergency-requests`
List requests scoped to caller:
- Citizens receive their own submitted requests.
- `provider_admin` receives requests assigned to their hospital.
- `system_admin` receives all requests across the network.

### `PATCH /api/emergency-requests/:id`
Advance request lifecycle state.
- **Access:** Assigned `provider_admin` or `system_admin`
- **Body:**
```json
{
  "status": "ACCEPTED",
  "hospitalResponse": "ICU Bed 12 reserved. Triage team alerted."
}
```

---

## 5. Blood Bank Directory & Requisitions (`/api/blood-requests` & `/api/blood-banks`)

### `GET /api/blood-banks`
Search licensed blood component centers with group inventory filters.
- **Access:** Public

### `POST /api/blood-requests/urgent`
Dispatch high-priority 6-hour urgent blood requisition.
- **Access:** Public / Citizen
- **Body:**
```json
{
  "providerId": "670e...",
  "bloodGroup": "O+",
  "patientOrDonorName": "Suresh Sharma",
  "units": 2,
  "urgency": "Immediate / 6 hours",
  "contactPhone": "+91 98765 40000"
}
```
- **Response (201 Created):** Returns `{ reference: "BLD-REQ-2026-099", status: "REQUESTED" }`.

### `POST /api/blood-requests/pledge`
Record citizen voluntary blood donation appointment pledge.
- **Access:** Public / Citizen

---

## 6. Ambulance Dispatch & Bookings (`/api/ambulances`)

### `GET /api/ambulances`
List certified ambulance providers and vehicle capabilities (ALS, BLS, Neonatal).
- **Access:** Public

### `POST /api/ambulances/book`
Dispatch or schedule ambulance transport.
- **Access:** Public / Citizen
- **Body:**
```json
{
  "providerId": "670f...",
  "isEmergency": true,
  "patientName": "Suresh Sharma",
  "patientAge": 54,
  "pickupAddress": "Worli, Mumbai",
  "contactPhone": "+91 98765 40000",
  "notes": "ALS defibrillator required."
}
```
- **Response (201 Created):** Returns `{ reference: "AMB-2026-012", status: "RECORDED" }`.

---

## 7. Medical Careers & Staffing (`/api/careers`)

### `GET /api/careers/jobs`
Search verified hospital and diagnostic clinical job postings.
- **Access:** Public
- **Query Parameters:** `category` (`Doctor`, `Nurse`, `Technician`), `employmentType`, `city`.

### `POST /api/careers/apply`
Submit employment application for a clinical position.
- **Access:** Public / Citizen
- **Body:** `{ "jobId": "670g...", "candidateName": "Dr. Ananya Roy", "candidateEmail": "ananya@example.com", "phone": "+91 98111 22233", "sop": "MBBS with 4 years trauma experience." }`
- **Response (201 Created):** Returns `{ reference: "CAR-APP-2026-004", status: "submitted" }`.

---

## 8. Provider Onboarding & Administration (`/api/providers`)

### `POST /api/providers/register`
Submit self-service provider onboarding application.
- **Access:** Public / Healthcare Provider
- **Body:**
```json
{
  "kind": "diagnostic",
  "name": "Apex Advanced Diagnostic & Imaging Centre",
  "address": "Powai, Mumbai",
  "phone": "+91 22 6700 3300",
  "contactEmail": "admin@apexdiagnostics.example",
  "contactName": "Dr. Sarah Chen",
  "city": "Mumbai",
  "explanation": "NABH-accredited 24/7 imaging center."
}
```

### `GET /api/providers/mine`
List organizations assigned to the currently authenticated `provider_admin`.
- **Access:** `provider_admin`

### `GET /api/providers/:kind/:id/report`
Aggregate metrics for an assigned organization (request counts, fulfillment rate, occupancy).
- **Access:** Assigned `provider_admin` or `system_admin`

---

## 9. System Administration (`/api/admin`)

### `GET /api/admin/overview`
High-level dashboard KPIs: registered providers, pending applications, active emergency requests, and audit logs.
- **Access:** `system_admin`

### `GET /api/admin/provider-approvals`
List pending provider registration applications.
- **Access:** `system_admin`

### `POST /api/admin/provider-approvals/:id/approve`
Approve application, instantiate the organization record, and automatically provision administrator credentials.
- **Access:** `system_admin`

### `POST /api/admin/provider-approvals/:id/reject`
Reject application with reason code.
- **Access:** `system_admin`

### `GET /api/admin/emergency`
Unified oversight queue showing all emergency and normal requests (bed, blood, diagnostic, ambulance).
- **Access:** `system_admin`

---

## 10. Universal Request Tracking (`/api/tracking`)

### `GET /api/tracking/lookup?ref=<reference>`
Public, non-sensitive status check by reference ID.
- **Access:** Public
- **Response (200 OK):**
```json
{
  "reference": "REQ-EMG-2026-081",
  "kind": "bed",
  "status": "ACCEPTED",
  "updatedAt": "2026-10-14T08:20:00.000Z"
}
```
*Note: Public lookup exposes only reference, kind, status, and timestamp. All clinical notes, patient names, and addresses remain protected.*

### `GET /api/tracking/private/:reference`
Retrieve detailed triage notes and hospital responses.
- **Access:** Requires either account ownership OR the secret `X-MedReach-Tracking-Token` header.
