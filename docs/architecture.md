# MedReach architecture

Current repository map, reviewed 2026-10-03. Use [Release QA](release-qa.md) for
verification/deployment status and [inventory](MedReach_Implementation_Inventory.md)
for remaining gaps. Target milestones are planning context, not release evidence.

## System boundaries

```text
Approved sources → crawler adapters → validated source claims
                                      ↓
Hospital staff → observations → MongoDB ← review/conflict/audit records
                                      ↓
                          Shared Express API
                          ↙       ↓       ↘
                     Bootstrap Tailwind Skeleton
                                      ↓
                         discovery, requests, tracking
```

One backend/dataset serves three active frontends. Bootstrap is the functional
reference. Designs and component markup differ; behavior is checked with actual
API/browser journeys, not a byte-identical JSX claim. Shared client modules in
`packages/core` contain no CSS framework classes.

## Find the implementation

Backend paths below are relative to `backend/src` unless otherwise stated.

| Concern | Code | Guide |
| --- | --- | --- |
| API/startup | `app.js`, `server.js` | [API](api.md), [deployment](deployment.md) |
| Auth/sessions/RBAC | `middleware/auth.js`, `controllers/authController.js`, `models/AuthToken.js` | [Security](security.md) |
| Public hospital views | `services/hospitalDataLoader.js`, `hospitalDataView.js` | [Data model](data-model.md) |
| Evidence/conflicts | `services/hospitalFieldFusion.js`, `facilityClaimFusion.js` | [Crawler](crawler.md) |
| Bed lifecycle | `services/emergencyRequestService.js`, `emergencyRequestExpiry.js`, `bedRequestEmails.js` | [Lifecycle](bed-request-lifecycle.md) |
| Blood/donation | `controllers/bloodRequestController.js`, `models/BloodRequest.js` | [Services](SERVICES_AND_MAP_GUIDE.md) |
| Ambulance records | `controllers/resourceController.js`, `models/AmbulanceBooking.js` | [Services](SERVICES_AND_MAP_GUIDE.md) |
| Applications | careers/organization controllers, `utils/careerReference.js` | [API](api.md) |
| Public tracking | `routes/tracking.js`, frontend `app/track/page.js` | [Services](SERVICES_AND_MAP_GUIDE.md) |
| Emails/retries | `services/emailService.js`, `emailBatch.js`, `userEmailService.js`, `routes/email.js` | [Latency](latency-verification.md) |
| Scheduling/shutdown | `services/crawlerScheduler.js`, `gracefulShutdown.js` | [Deployment](deployment.md) |
| Assistant/providers | `services/assistantService.js`, `aiProviders/` | [Assistant](ai-assistant.md) |
| Optional refinement | `services/refinementService.js`, `models/RefinementCandidate.js` | [Crawler](crawler.md) |
| Client/hook/ranking logic | `packages/core/src/` | [Variants](../variants/README.md) |
| Independent dashboards | `variants/*/lib/useDashboard.js`, `app/dashboard/page.js` | [Parity](PARITY_VERIFICATION.md) |
| Release tooling | `scripts/verify-*.mjs`, `release-check.mjs`, `tests/e2e/` | [QA](release-qa.md) |

## Backend and persistence

`createApp()` mounts the Express routes without connecting/listening so Supertest
uses the actual app. `server.js` connects MongoDB, starts HTTP and expiry/crawler
workers, and registers graceful SIGTERM/SIGINT cleanup. Readiness becomes
unavailable during shutdown; HTTP/workers drain before MongoDB disconnects.

Models separate accounts/sessions, hospitals, source claims and observations
from requests, bookings, applications, audit and delivery records. Static
capability never becomes current availability. Verified recent evidence is
required; unknown quantities remain `null`. See [data model](data-model.md).

Emergency submission is guest-accessible; standard bed requests require login.
Both use the durable hospital-scoped lifecycle. Blood and ambulance have
separate records; careers use public server-generated references rather than
MongoDB IDs. Public tracking exposes status only; private details and mutations
retain authorization requirements.

Primary saves precede delivery attempts. Bed/blood/career submission emails use
at most three concurrent tasks per request and await every outcome. The email
service preserves unique event keys, send leases and encrypted eligible retry
payloads. This is not a transactional outbox or a global SMTP concurrency limit.

## Frontends

All variants use Next.js 15.5.24 and React 18.3.1. Bootstrap aliases
`@medreach/core` to `variants/bootstrap/_core/index.js` for standalone context;
Tailwind/Skeleton resolve the workspace package. Shared changes must update
both copies. Builds do not provide automatic vendoring synchronization.

Routes cover hospitals/maps, requests, resources, urgent blood, careers, tracking,
accounts, hospital operations and administration. The navbar omits Map; homepage
**Full Map View →** opens `/map`. SOS is the only bottom floating action button;
the assistant remains available through its existing entry actions.

Dashboard saved/profile, requests and applications fetch independently with
section retries. Career history exposes public references, copy and tracking;
Skeleton tracking also provides wrapping/copy and a manual clipboard fallback.
This intentional presentation difference is recorded in [parity](PARITY_VERIFICATION.md).

API outages show errors/retry instead of substitute product data. Google Maps
requires configured browser credentials; directory/contact actions stay usable
when the map cannot load. GPS is opt-in; manual locality selection remains.

## Crawler, verification and research

`crawler/` owns approved sources, adapters, robots/guarded fetch, parsing,
normalization and persistence. The backend's `_crawler` copy supports server
execution; changes must remain consistent. Scheduled work honors due times,
pause state and blocked sources. It does not run inside Next.js.

Optional Gemini ingestion refinement creates review candidates without
publishing verified hospital facts automatically. See [crawler](crawler.md) for
source policy and remaining fetch limitations. Seeds are not verification.

[Release QA](release-qa.md) records disposable-database tests, mocked/disabled
email, production builds and Chromium journeys. Live integrations, inbox receipt,
hosted cookies/CORS and public health require separate evidence. Research tooling
and proposed participant tasks live in `evaluation/`, `paper/`, `user-study/`;
see [evaluation](../evaluation/README.md) for measurement limits.

## Intentional removals

Google OAuth and the in-app notification inbox, route, model and services are
removed. Password authentication, email verification/recovery, request/status
emails, delivery history and retries remain. Reintroducing removed features is
a new product decision, not a documentation correction.
