# API reference

[Documentation](README.md) · [Project overview](../README.md)

The Express API is shared by all three frontends. Local origin:
`http://localhost:4000`. The frontend embeds `NEXT_PUBLIC_API_URL` at build time.

This is a route/contract guide. Exact field validation remains in
`backend/src/routes` and serialization in `backend/src/controllers`.

## Conventions

- JSON request bodies; lists generally return `{ data: [...] }`.
- Entity envelopes vary by endpoint, such as `{ hospital }` or `{ request }`.
  Mutation success is not universally named `success`; several return `ok`.
- Failures return `{ error }`, sometimes with validation details.
  401 means missing/expired authentication; 403 means insufficient permission;
  409 signals conflicting, duplicate or stale state; 503 means unavailable.
- Login sets HttpOnly `token` and `refresh_token` cookies. The refresh cookie
  is scoped to `/api/auth`. Cookie security depends on environment/SameSite.
  Access JWTs can also be supplied as Bearer tokens.
- Presented credentials are validated against the active account and session.
  Public optional-auth endpoints reject invalid presented credentials.
- Supported submission endpoints accept `Idempotency-Key`. Reuse with changed
  input or an unrelated actor is rejected rather than creating another record.
- Private request details and mutations require ownership, assigned-provider
  access, System Admin permission or an applicable private guest token.
  A public reference does not grant private access.

## Health and accounts

| Method and path | Purpose |
| --- | --- |
| GET `/health`, `/health/live` | Liveness; not dependency readiness |
| GET `/health/ready` | 200 only when MongoDB is connected and shutdown is not draining; otherwise 503 |
| POST `/api/auth/register`, `/login` | Regular registration / common role login |
| POST `/api/auth/refresh`, `/logout` | Session rotation / logout |
| GET `/api/auth/me`, `/sessions` | Current account / own sessions |
| DELETE `/api/auth/sessions/:id` | Revoke own session |
| PUT `/api/auth/profile`, `/password` | Profile / authenticated password change |
| POST `/api/auth/forgot-password`, `/reset-password` | Recovery |
| POST `/api/auth/request-verification`, `/verify-email` | Email verification |
| POST `/api/auth/activate-provider` | Accept a provider activation link |
| POST `/api/auth/verify-notification-email` | Verify the separate notification contact |

Public registration cannot select an administrative role. Login is currently
limited to ten attempts per 15 minutes per client IP; see security middleware
for the separate registration/recovery limits.

## Discovery and Careers

| Path | Purpose |
| --- | --- |
| `/api/hospitals`, `/api/hospitals/:slug` | Hospital discovery and detail |
| `/api/hospitals/:idOrSlug/enriched` | Composed stored hospital evidence |
| `/api/hospitals/:id/facilities` | Verified facility capabilities |
| `/api/hospitals/:id/availability` | Permitted availability reads/writes (append-only) |
| `/api/blood-banks`, `/api/diagnostics`, `/api/ambulances` | Resource indexes and ID details |
| `/api/blood-banks/campaigns` | Donation campaigns and moderated proposals |
| `/api/alerts` | Public active disaster/municipal alerts |
| `/api/routing/hospital/:id` | Route distance and estimated driving duration |
| `/api/users/me/saved` | Authenticated citizen saved hospital bookmarks |
| `/api/jobs`, `/api/jobs/:id` | Published job index and detail |
| `/api/jobs?view=summary` | Compact homepage fields; same published filtering and 150-row ceiling |
| `/api/jobs/manage`, `/api/jobs/:id/applications` | Authorised provider job/applicant management |
| `/api/jobs/:id/apply` | Signed-in application |
| `/api/organizations/careers` | Organisation-oriented Careers discovery |
| `/api/organization-applications` | Organisation application workflow |
| `/api/applications/mine` | Own job and organisation applications |
| `/api/applications/:id` | Authorised applicant review |
| `/api/assistant/message` | Grounded assistant request |

The optional job summary omits descriptions and populated hospital/provider
objects. Ordinary `GET /api/jobs` keeps its existing full listing contract.
Direct mutable bed updates via `PATCH /api/hospitals/:id/beds` return `410 Gone`
to enforce append-only observations via `/api/hospitals/:id/availability`.
Public directory indexes can gzip/revalidate with ETags; authenticated/private
responses remain `Cache-Control: no-store`.

## Requests and tracking

- `/api/emergency-requests`: own or authorised scoped history; `/standard`
  for signed-in bed requests and `/emergency` for the guest-capable emergency flow.
  Detail/actions enforce the lifecycle in [bed requests](bed-request-lifecycle.md).
- `/api/blood-requests/standard` and `/urgent`: normal request/donation versus
  urgent flow. List/detail/status routes enforce their respective access rules.
- `POST /api/ambulances/book`: persist a booking request.
  `/api/ambulances/bookings` provides protected history/detail/status operations.
- `GET /api/tracking/:type/:reference`: limited public status for bed, blood,
  career or ambulance. It reveals no contact, medical history or mutation access.

## Administration

All `/api/admin/*` platform routes require System Admin. Provider access uses
explicit memberships; hiding a frontend control is not authorization.

| Prefix | Purpose |
| --- | --- |
| `/api/providers/applications` | Public, rate-limited provider submission |
| `/api/admin/provider-approvals` | Applications, organisation approval and review |
| `/api/admin/provider-accounts` | Provision, list, assignments and account actions |
| `/api/admin/provider-accounts/manual-provision`, `/:id/credentials` | Local-only manual credential workflows with additional guards |
| `/api/providers/mine`, `/:kind/:id/report` | Authorised organisation assignments/reports |
| `/api/admin/hospitals`, `/overview`, `/users`, `/audit` | Protected complete listings, totals, users and audit |
| `/api/hospital-admin` | Existing scoped hospital workflows |
| `/api/admin/resources` | Protected resource management |

### Email operations

System Admin endpoints: `GET /api/email/status`,
`GET /api/email/deliveries`, `POST /api/email/deliveries/:id/retry`.

Notifications distinguish pending, disabled, failed, uncertain and sent.
Queued notifications return pending after durable storage; they do not claim an
email was delivered. Sent means transport acceptance. Uncertain outcomes require
manual investigation before any resend. Activation/recovery messages are
non-replayable; prepare a new account link instead of replaying an old one.
