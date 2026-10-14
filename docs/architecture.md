# MedReach System Architecture & Technical Design

This document details the software architecture, design patterns, and runtime topologies of the MedReach healthcare discovery and emergency coordination platform.

---

## 1. Architectural Overview

MedReach is designed around a single authoritative Express/MongoDB backend serving three distinct, independently built frontend variants: **Bootstrap 5**, **Tailwind CSS 4**, and **Skeleton CSS 2**.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             FRONTEND VARIANTS                               │
│                                                                             │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────┐   │
│   │ Bootstrap (Port 3000)│   │  Tailwind (Port 3001)│   │Skeleton (Port 3002)│   │
│   │ - Functional Ref    │   │  - Modern Utility   │   │- Minimalist Raw │   │
│   │ - Bootstrap 5.3.3   │   │  - Tailwind CSS 4   │   │- Skeleton CSS 2 │   │
│   └──────────┬──────────┘   └──────────┬──────────┘   └────────┬────────┘   │
│              │                         │                       │            │
│              └─────────────────────────┼───────────────────────┘            │
│                                        ▼                                    │
│                    ┌───────────────────────────────────────┐                │
│                    │     @medreach/core (Shared Library)   │                │
│                    │  Isomorphic Client, Auth, Validation  │                │
│                    └───────────────────┬───────────────────┘                │
└────────────────────────────────────────┼────────────────────────────────────┘
                                         │ HTTPS / JSON / Cookies
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SHARED BACKEND API                               │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Express 4 HTTP Server                        │   │
│   │    CORS Whitelist · Rate Limiting · JWT / Refresh Cookies · RBAC    │   │
│   └───────┬───────────────────────────┬─────────────────────────┬───────┘   │
│           │                           │                         │           │
│           ▼                           ▼                         ▼           │
│   ┌──────────────────┐        ┌───────────────┐        ┌────────────────┐   │
│   │ Lifecycle Service│        │ Email Dispatch│        │ Expiry Worker  │   │
│   │ Triage & Leases  │        │ SMTP Batches  │        │ Background 60s │   │
│   └───────┬──────────┘        └───────┬───────┘        └────────┬───────┘   │
└───────────┼───────────────────────────┼─────────────────────────┼───────────┘
            │                           │                         │
            └───────────────────────────┼─────────────────────────┘
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             DATA & SERVICES                                 │
│                                                                             │
│   ┌─────────────────────────────────────────┐     ┌─────────────────────┐   │
│   │             MongoDB 7.0+                │     │   SMTP Mailer       │   │
│   │  2dsphere Geo · Full-Text · Append-Only │     │   Transactional     │   │
│   └─────────────────────────────────────────┘     └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

A full high-resolution diagram is available at [`docs/diagrams/system-architecture.svg`](diagrams/system-architecture.svg).

---

## 2. Frontend Variants & Parity Philosophy

MedReach implements three complete frontends to facilitate rigorous human-computer interaction (HCI) and responsive web design research (extending Almeida & Sousa, 2026):

| Dimension | Bootstrap 5 (`variants/bootstrap`) | Tailwind CSS 4 (`variants/tailwind`) | Skeleton CSS 2 (`variants/skeleton`) |
| :--- | :--- | :--- | :--- |
| **Design System** | Classic component classes (`.btn`, `.card`, `.alert`) | Utility-first tokens (`flex`, `p-4`, `rounded-xl`) | Minimalist lightweight typographic grids |
| **Grid Engine** | Flexbox 12-column grid system | CSS Grid & Flexbox utilities | Pure CSS lightweight column classes |
| **Bundle Architecture** | Local bundled `_core` copy | Workspace dependency on `@medreach/core` | Workspace dependency on `@medreach/core` |
| **Visual Character** | Structured, enterprise medical aesthetic | Contemporary, rounded, shadow-depth polish | Raw, fast, high-contrast typography |
| **Default Port** | `http://localhost:3000` | `http://localhost:3001` | `http://localhost:3002` |

### Parity Invariant
All three variants consume identical backend endpoints, preserve identical route hierarchies (`/hospitals`, `/emergency`, `/admin`, `/provider`, `/dashboard`, `/requests`, `/track`), and enforce complete functional parity. No capability exists in one variant that is absent from another.

---

## 3. Shared Core Library (`packages/core`)

The shared `@medreach/core` workspace package provides isomorphic primitives used across the entire ecosystem:
- **`api.js`:** Resilient `fetch` wrapper handling base URLs, credentials, automatic idempotency key generation, and seamless token refresh retries.
- **`authSession.js`:** Reactive browser session state using the Pub/Sub pattern to synchronize authentication across components without React Context re-render cascades.
- **`validation.js`:** Pure client-side validation rules mirrored from backend Mongoose validators (email formats, password strength, request constraints).
- **`location.js` & `ranking.js`:** Proximity distance calculation (Haversine formula), geo-sorting, and deterministic provider scoring.
- **`scrollAnimation.js`:** Hardware-accelerated scroll reveal calculations driving the oversized bottom wordmark animation.

---

## 4. Role-Based Access Control (RBAC) & Multi-Tenancy

MedReach enforces three distinct operational roles:

```text
┌─────────────────┐      ┌───────────────────────────────┐      ┌───────────────────────────────┐
│   system_admin  │      │        provider_admin         │      │             user              │
│                 │      │                               │      │                               │
│ - Global KPIs   │      │ - Scoped to Organization      │      │ - Search & Filter             │
│ - Approvals     │      │ - Bed Triage & Allocation     │      │ - Emergency Bed Requisitions  │
│ - User Accounts │      │ - Blood Requisition Status    │      │ - Blood Pledges & Requests    │
│ - System Logs   │      │ - Ambulance Dispatch Status   │      │ - Ambulance Bookings          │
│ - Audit Feeds   │      │ - Staff Job Postings          │      │ - Request Timeline Tracking   │
└─────────────────┘      └───────────────────────────────┘      └───────────────────────────────┘
```

The detailed role and capability permission matrix is diagrammed at [`docs/diagrams/role-permission-matrix.svg`](diagrams/role-permission-matrix.svg).

### Multi-Tenant Isolation
- `system_admin` users possess global visibility across all providers, requests, and audit logs.
- `provider_admin` users are restricted strictly to organizations granted via active `ProviderMembership` documents. When querying `/api/emergency-requests`, the query filter dynamically injects `{ hospital: { $in: userAssignedHospitalIds } }`. Direct ID manipulation returns `403 Forbidden`.

---

## 5. Security & Authentication Architecture

Authentication uses short-lived JWT access tokens and long-lived rotating refresh sessions:

![Authentication Flow](diagrams/auth-flow.svg)

1. **Credentials Verification:** Passwords verified against bcrypt hashes (cost factor 12).
2. **Token Issuance:** Access token (15-minute lifespan) and refresh token (7-day lifespan) delivered in `httpOnly`, `Secure`, `SameSite: Lax` (or `None` for cross-site) cookies.
3. **Session Rotation & Family Revocation:** Each refresh token belongs to a cryptographic `familyId`. When a refresh token is used, it is invalidated and replaced by a successor. If an already-used token is presented (replay attack), the entire family is revoked immediately, forcing re-authentication.

---

## 6. Healthcare Workflows

### Emergency Bed & Ambulance Dispatch Flow

![Request Flow](diagrams/request-notification-flow.svg)

1. **Submission:** Patient or bystander submits emergency request via `/emergency` (or routine via hospital page).
2. **Idempotency Check:** Backend checks `idempotencyKeyHash`. If seen within lease window, cached response is returned.
3. **Database Insertion:** Request saved in `EmergencyRequest` with `status: "REQUESTED"`.
4. **Notification Routing:** Multi-channel notification engine routes transactional emails to assigned hospital provider admins and opted-in system admins.
5. **Staff Triage:** Hospital staff reviews vitals, updates status to `UNDER_REVIEW`, `ACCEPTED`, or `REJECTED` with clinical notes.
6. **Patient Tracking:** Requester tracks live dispatch via `/track` using authenticated session or guest tracking token.

### Provider Onboarding & Approval Flow

![Provider Onboarding](diagrams/provider-onboarding.svg)

1. Healthcare organization submits self-service enrollment at `/provider/register`.
2. Request lands in System Admin approval queue at `/admin/provider-approvals`.
3. System Admin inspects credentials and clicks **Approve**.
4. Backend executes an atomic transaction:
   - Organization record is marked `approved` in `Hospital` or `ResourceProvider`.
   - `User` account (`role: "provider_admin"`) is automatically provisioned with a generated username.
   - `ProviderMembership` link is created.
   - Welcome invitation email with activation token is dispatched.

---

## 7. Background Workers & Graceful Shutdown

- **Request Expiry Worker:** A deterministic 60-second timer runs in the backend process (`backend/src/workers/emergencyExpiry.js`), transitioning expired requests past `expiresAt` from `REQUESTED` to `EXPIRED`.
- **Zero-Downtime Draining:** Upon receiving `SIGTERM` or `SIGINT`, the Express server stops accepting new connections, allows in-flight HTTP requests and transactional email batches up to 30 seconds to complete, closes MongoDB connections gracefully, and terminates cleanly.
