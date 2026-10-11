# Backend REST API

The Express + Mongoose backend serves all three frontend variants. Clients use `NEXT_PUBLIC_API_URL` (local default `http://localhost:4000`) and credentials for cookie sessions. Set the public API origin before production builds; see [deployment](deployment.md).

Responses use endpoint-specific envelopes such as `{data}`, `{hospital}`, `{request}`, `{application}` and `{record}`. Errors generally use `{error, details?}`. A saved request is distinct from a completed email attempt, hospital acceptance or ambulance dispatch.

## Access conventions

- **Public** routes work without login. **Optional auth** permits no credential, but rejects a presented invalid, expired or revoked credential.
- **User** routes require a valid account/session. **Hospital staff** operations require assignment to the relevant hospital, not merely an administrator role.
- Active roles are `user`, `provider_admin` and `system_admin`. System Admin manages regular users and provider accounts. Provider Admin requires explicit organisation assignments. System Admin controls global approvals, role changes, security and reports. Legacy `admin` has no global privileges; legacy hospital assignments remain temporarily compatible pending a reviewed migration.
- Private guest request access uses `X-MedReach-Tracking-Token`. It is separate from public reference-only status lookup.
- Bed, blood, ambulance and career submissions accept an optional `Idempotency-Key` (8–200 allowed characters). Keep the same opaque key when retrying one submission, and use a fresh key for a new submission. Replays are ownership checked; conflicts can return 409. Do not expose these keys in logs or public links.

## Health

- `GET /health` — process liveness plus database connection state.
- `GET /health/live` — process liveness.
- `GET /health/ready` — 200 only when MongoDB is connected and shutdown is not draining; otherwise 503. This does not verify SMTP, maps or external sources.

## Authentication

- `POST /api/auth/register`, `POST /api/auth/login` — password credentials; purpose-specific rate limits.
- `POST /api/auth/refresh` — rotate refresh cookie; reuse revokes the session family.
- `POST /api/auth/logout` — revoke session family and clear cookies.
- `GET /api/auth/me` — current user and saved hospitals.
- `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` — own session metadata/revocation.
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`.
- `POST /api/auth/request-verification` (user), `POST /api/auth/verify-email`.
- `PUT /api/auth/profile`, `PUT /api/auth/password` (user).

Access JWTs are delivered in httpOnly cookies, or accepted as Bearer tokens for API clients. They are checked against account status, auth version and an active refresh family. Google OAuth endpoints are intentionally absent.

## Hospitals and availability

- `GET /api/hospitals` — public; implemented query parameters: `q`, `region`, `city`, `status`, `specialty`, `lat`, `lng`, `page`, `limit` (maximum 50). `status` filters the composed public availability view, not a legacy default.
- `GET /api/hospitals/:slug` — public detail.
- `GET /api/hospitals/:idOrSlug/enriched` — public enriched detail/provenance.
- `POST /api/hospitals`, `DELETE /api/hospitals/:id` — `system_admin`.
- `PUT /api/hospitals/:id` — authorized administrator; hospital staff are scoped to assignment.
- `PATCH /api/hospitals/:id/beds` — compatibility route; authorized requests return **410** because legacy bed updates are retired.
- `GET /api/hospitals/:id/facilities`, `GET /api/hospitals/:id/availability` — public composed capability and observation views.
- `POST /api/hospitals/:id/availability` — authorized administrator/staff; append a validated facility/status observation. Use this instead of legacy bed writes.

Current availability requires a recent verified observation; missing/stale information remains unknown. See [data model](data-model.md).

## Bed requests and hospital response

Both modes use the `EmergencyRequest` collection and lifecycle service:

- `POST /api/emergency-requests/emergency` — optional auth; forces emergency mode.
- `POST /api/emergency-requests/standard` — user; forces standard mode.
- `POST /api/emergency-requests` — compatibility endpoint requiring explicit boolean `isEmergency`; standard mode still requires login.
- `GET /api/emergency-requests` — authenticated, scoped request list.
- `GET /api/emergency-requests/:id` — private detail with timeline and `emailHistory`; owner, authorized staff/admin or permitted guest token access.
- `PATCH /api/emergency-requests/:id` — authorized lifecycle transition or patient reply; supports `status`, `note`, `hospitalResponse`, `expectedStatus` and `expectedTimelineLength`. Stale/invalid transitions return 409.

Submission validates `hospitalId`, `emergencyType`, `requiredFacility`, contact details and optional patient/ambulance fields. It returns `{request, trackingToken?}`; the public reference is `request.requestId` (`MR-…`). Keep a returned guest token private. Bed forms request hospital-arranged transport using a flag/pickup address rather than choosing an ambulance provider.

Lifecycle states: `REQUESTED`, `SENT`, `UNDER_REVIEW`, `INFORMATION_REQUESTED`, `ACCEPTED`, `REJECTED`, `COMPLETED`, `CANCELLED`, `EXPIRED`. `SENT` records routing to connected staff, not proof that staff read or accepted the request. See [full lifecycle and permissions](bed-request-lifecycle.md).

## Blood requests and campaigns

- `POST /api/blood-requests/standard` — optional auth; active listed blood-bank `providerId` required; type `REQUEST` or `DONATION`.
- `POST /api/blood-requests/urgent` — optional auth; type `REQUEST` only; separate urgent-blood flow.
- `POST /api/blood-requests` — compatibility endpoint requiring explicit `isUrgent`.
- `GET /api/blood-requests` — authenticated; own records, or global administrators' records.
- `GET /api/blood-requests/:reference` — private record; owner, `system_admin`, or guest token for a guest record. Compatibility accepts an internal ID but user tracking uses its public reference.

Normal request urgency: `3 days`, `1 week`. Urgent request urgency: `within 6 hours`, `12 hours`, `18 hours`, `24 hours`, `up to 2 days`. Request quantities are 1–50; donation age/weight/date fields have their own validation. Blood group and contact details are validated server-side. Public references use `BR-…` for requests and `BDP-…` for pledges. No bed request endpoint handles urgent blood.

Campaign routes are mounted at both `/api/blood-campaigns` and `/api/blood-banks/campaigns`:

- `GET /`, `GET /:id` — optional auth; public statuses are active/upcoming/completed. Unpublished details require creator/admin access, and only admins can list unpublished states. Public responses omit creator account identity.
- `POST /`, `POST /propose` — rate-limited validated proposals, optional auth. An account email is not implicitly published as campaign contact.
- `PATCH /:id` — authenticated owner/authorized editing; creator content edits return the campaign to pending review.
- `PATCH /:id/status` — `system_admin` moderation.

## Provider directories and ambulance bookings

- `GET /api/blood-banks`, `/api/diagnostics`, `/api/ambulances` — public provider lists; implemented filters are `q`, `locality`, `service`, and `bloodGroup` for blood banks. Responses explicitly retain unknown current inventory and do not assert live dispatch.
- `GET /api/blood-banks/:id`, `/api/diagnostics/:id`, `/api/ambulances/:id` — public provider detail.
- `POST /api/admin/resources`, `PATCH /api/admin/resources/:id` — `system_admin` provider management.
- `POST /api/ambulances/book` — optional auth; validates an active ambulance provider, patient name/age, contact details and pickup requirement. Saves the booking first, then attempts emails.
- `GET /api/ambulances/bookings` — authenticated; own bookings or global administrator list.
- `GET /api/ambulances/bookings/:reference` — private booking; owner, global administrator or valid private tracking token.

Booking responses include `recorded`, `reference` (`AMB-…`), booking metadata, per-recipient `delivery` states and a guest `trackingToken` when applicable. A recorded booking or sent email does not confirm availability or dispatch. Ambulance state enums exist in the model; no general booking status-update API is currently exposed.

## Careers and applications

- `GET /api/jobs`, `GET /api/jobs/organizations`, `GET /api/jobs/:id` — public published listings.
- `GET /api/jobs/manage`, `POST /api/jobs` — authorized job managers.
- `PATCH /api/jobs/:id`, `POST /api/jobs/:id/status` — controller-enforced organization scope and publication/review permissions.
- `POST /api/jobs/:id/apply` — user; validates application fields and a 10–4000 character statement/SOP.
- `GET /api/jobs/:id/applications` — authorized organization manager.
- `GET /api/organizations/careers` — public healthcare organizations accepting expressions of interest.
- `POST /api/organizations/:id/apply` — user; validates organization type, role of interest and application fields.
- `GET /api/organizations/:id/applications` — authorized organization manager.
- `GET /api/applications/mine` — user; own job and organization application history.
- `PATCH /api/applications/:id`, `PATCH /api/organization-applications/:id` — authorized manager; review status `under_review`, `shortlisted` or `rejected`.

Submissions return `{application, ...}` with server-generated unique `CAR-J…` (job) or `CAR-O…` (organization) references. Submission/history serialization keeps the application document `_id` internal. Confirmation emails and dashboard tracking links use the public reference. Reference generation retries collisions; legacy history serialization assigns a persistent reference when missing. A public career status lookup does not return a resume or applicant contact details.

## Reference-only tracking

`GET /api/tracking/:type/:reference` is public, rate limited and `Cache-Control: no-store`.

| Type | Public reference |
|------|------------------|
| `blood` | `BR-YYYYMMDD-XXXXXX` or `BDP-YYYYMMDD-XXXXXX` |
| `bed` | `MR-…` request ID |
| `career` | `CAR-J` / `CAR-O` followed by 14 hexadecimal characters |
| `ambulance` | `AMB-…` booking reference |

Response: `{record: {reference, status, updatedAt}}`. Invalid formats return 400; missing records return 404. This endpoint does not expose document IDs, contacts, provider names, patient summaries, resumes or mutation access. All variants' `/track` pages use this summary contract.

## Assistant and routing

- `POST /api/assistant/message` — public, 20 requests/5 minutes/IP; body `{message, locality?, origin?: {lat, lng}}` with a 500-character message cap.
- Response includes `reply`, `intent`, `source`, `hospitals`, `bloodBanks`, `diagnostics`, `ambulances`, `jobs`, `suggestedActions`, `suggestedPrompts` and context fields. Intents cover emergency, hospital/bed discovery, normal/urgent blood, ambulance, diagnostics, careers and general guidance.
- Data comes from stored providers and composed hospital observations. Provider phrasing failure falls back to rule-based replies; a broader failure returns safe contact actions with `unavailable: true`. [Assistant design](ai-assistant.md).
- `GET /api/routing/hospital/:id?lat=&lng=` — public; validated origin coordinates and configured routing provider. Missing routing data must not be presented as an invented ETA.

## Administration and stored evidence

- `/api/hospital-admin/hospitals`, `/ownership-claims` and `/hospitals/:id/facility-claims` — authenticated ownership/assigned-hospital operations.
- `GET /api/admin/hospitals` — System Admin-only paginated listing including pending/rejected records. Public discovery excludes those records.
- `/api/admin/overview`, `/hospitals/:id/verify` — System Admin-only; verification queue counts non-verified hospitals excluding rejected approvals.
- `/api/admin/audit`, `/ownership-claims`, `/facility-claims`, `/data-conflicts`, `/hospital-field-claims`, `/hospital-field-conflicts` — system administrator only. Review endpoints and user status/role/revocation/recovery actions are audited.
- `/api/admin/refinement/status`, `/candidates`, `/claims/:id`, `/candidates/:id/review` — `system_admin`; optional refinement suggestions do not directly change canonical availability.
- `GET /api/analytics/overview` — `system_admin`.
- `GET /api/alerts` — public infrastructure/public notices; `POST` and `PATCH /:id/deactivate` have administrator checks and scope. These alerts are separate from the removed personal notification inbox.

## Email operations

All `/api/email/*` endpoints require `system_admin`:

- `GET /api/email/status` — sanitized configuration/enablement status.
- `GET /api/email/deliveries` — recent delivery metadata, without raw retry envelopes.
- `POST /api/email/deliveries/:id/retry` — controlled replay of eligible failed/pending deliveries; leases prevent concurrent duplicate sends. Recovery/verification templates are reissued, not replayed. Uncertain delivery outcomes return a conflict and must be checked before preparing a fresh message.

Bed, blood and career submission emails use up to three concurrent independent tasks per submission, and responses still await attempted deliveries. Saved primary records survive secondary email failures. See [email operations](api.md#email-operations) and [local latency evidence](latency-verification.md).

## Saved hospitals

- `GET /api/users/me/saved` (user).
- `POST /api/users/me/saved/:hospitalId` (user).
- `DELETE /api/users/me/saved/:hospitalId` (user).

Google OAuth and `/api/notifications` are intentionally removed. All email functionality remains. Current checks and live-verification limits are recorded in [release QA](release-qa.md).

### Security response behavior

Nested/repeated/operator query parameters return 400; all current query filters
are scalars. Protected and optional-auth routes both reject revoked, expired or
missing server sessions with 401. A signed session token cannot authorize access
while MongoDB is disconnected (503). Sensitive/auth/tracking responses disable
caching. Career resume aliases accept HTTP(S) links and base64 PDF/Word uploads;
HTML/SVG/executable/local URL schemes return validation errors.

## Provider administration

All account/approval management requires System Admin. `GET/POST /api/admin/provider-accounts` lists/provisions separate Provider Admin accounts. `POST /:id/actions` supports activate, deactivate, invite and reset. `POST /:id/assignments` adds an explicit approved organisation; `PATCH /:id/assignments/:membershipId` changes assignment access.

`GET /api/admin/provider-approvals` lists submissions; `POST /:id/review` approves with account provisioning or rejects. `/organizations` lists existing organisations and `/organizations/:kind/:id/approve` explicitly approves one. New submissions use `POST /api/providers/applications`; assigned organisations use `GET /api/providers/mine`.

`POST /api/auth/activate-provider` accepts a single-use invitation and personal password. `PATCH /api/admin/users/:id/notifications` configures a real notification address; `POST /api/auth/verify-notification-email` verifies it. API responses never return password hashes or raw emailed tokens.

All account management and global admin endpoints are System Admin-only. The retired `user_admin` role has no administrative access. Scoped Provider Admin resource updates and request/application reads enforce organisation membership on the server.

See [role restructuring](../ROLE_RESTRUCTURING.md) for demo isolation, notifications, legacy compatibility and the mandatory reviewed rollout boundary.
