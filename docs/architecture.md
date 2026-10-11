# MedReach architecture

Updated 2026-10-07. See [implementation inventory](MedReach_Implementation_Inventory.md)
and [release QA](release-qa.md) for capability and verification status.

```text
Existing healthcare dataset → MongoDB → Express API → Bootstrap / Tailwind / Skeleton
                                  ↑
                  Staff observations, requests and reviews
```

MedReach does not crawl or scrape websites at runtime. The existing provider,
job, source, claim, conflict, availability and historical ingestion records stay
in MongoDB. No migration, reseed or collection drop is required to remove the
acquisition code. Historical source URLs and timestamps describe the stored
dataset; they do not imply current availability. See [stored data](stored-data.md).

## Backend

`backend/src/app.js` mounts the shared Express API. `server.js` connects MongoDB,
starts HTTP and the unrelated emergency-request expiry worker, then registers
graceful shutdown. There is no crawler worker or scheduler. Readiness requires
a MongoDB connection. Public provider APIs query stored `Hospital`,
`ResourceProvider`, `Job` and related models. Requests, tracking, authentication,
email and staff/admin workflows continue through their existing routes.

The selected cloud architecture is Vercel for the three independent Next.js
frontends, Railway for the persistent Express API, and MongoDB Atlas for a
verified copy of the existing dataset. Railway runs `backend/src/server.js`
and its one-minute request-expiry worker. Sleep is disabled and the deployment
uses one replica because rate limits are currently held in process memory.
Production reuses a bounded MongoDB connection pool and disables automatic
collection/index creation. Atlas provisioning and cloud cutover remain pending.
See [cloud setup](cloud-deployment.md).

Claims and conflicts remain reviewable. `DataSource`, `FacilitySourceClaim`,
`HospitalFieldClaim` and `AvailabilityObservation` models preserve evidence;
historical crawl collections remain stored without executable acquisition code.
No public availability is inferred from
static facility capability: only eligible recent verified observations can
establish a current status. Optional Gemini refinement uses already stored
excerpts and requires human review; it does not fetch provider websites.

## Frontends

Bootstrap is the functional reference. Tailwind and Skeleton use their own
components and styling. All three call the same Express APIs for hospital and
resource discovery, maps, careers, requests, tracking and authentication. The
shared `packages/core` client and Bootstrap's `_core` copy are kept aligned.
Crawler dashboards, source-management screens and crawl API calls have been
removed from all variants. Provider verification and resource administration
remain available.

## Operations and research

The architecture isolates the frontend comparison from the shared backend and
fixed dataset. Runs should record dataset identity and counts before collecting
framework measurements; changing stored data between variants would confound
results. Use a disposable database for integration and browser tests. Development
seed scripts are destructive and must not target the existing dataset.

See [API](api.md), [data model](data-model.md), [deployment](deployment.md),
[assistant](ai-assistant.md) and [target architecture](MedReach_Target_Architecture.md).

## Role restructuring (local implementation, rollout pending)

The current code implements `system_admin`, `provider_admin` and `user`. Global legacy `admin` permissions are retired. Old hospital assignments remain scoped compatibility until separately reviewed migration. Provider membership checks are enforced by the API, and account/assignment changes invalidate sessions. Provider invitations and notification contacts use hashed single-use tokens; demo defaults are restricted to isolated local demo databases with outbound email disabled.

No production migration or deployment was performed. The confirmed local development database has been inventoried; only the owner-approved local administrator conversion was applied. Actual remote inventory remains pending, and deployment requires a separately reviewed System Admin access path to prevent lockout. See [implementation and verification report](../ROLE_RESTRUCTURING.md).
