# MedReach product guide

Reviewed 2026-10-03. The filename retains the Bootstrap reference, but workflows
below apply to all three active variants. Their design systems remain distinct.
See [Release QA](release-qa.md) for exact current verification and live gaps.

## Run locally

Use Node.js ≥22.19.0 and a running MongoDB. From the repository root, run `npm ci`,
copy `backend/.env.example` to `backend/.env`, and configure the development
MongoDB and JWT secret. `./run.sh` starts the API on 4000, Bootstrap on 3000,
Tailwind on 3001 and Skeleton on 3002. `./run.sh bootstrap`, `tailwind` or
`skeleton` starts just that frontend and the API.

The API has no crawler scheduler or provider-site fetch.
Provider data comes from the existing MongoDB dataset. API errors
never substitute fake providers, jobs, statistics, availability or ETA.

Seed scripts are development tools. The main seed **deletes and replaces**
selected collections; do not run it against product or production data. Optional
product-demo fixtures are explicitly demo data. Predefined jobs remain drafts
awaiting verification, not evidence-backed published vacancies. See
[backend setup](../backend/README.md) and [stored data](stored-data.md).

## Patient journeys

- **Hospitals:** search/filter, inspect source/verification/freshness, contact,
  directions, save a hospital, and submit a signed-in standard bed request.
- **Emergency:** `/emergency` submits only emergency bed requests and permits
  guests. Ambulance assistance inside bed requests is arranged by the hospital;
  users do not select an ambulance provider there.
- **Hospital response:** connected active staff receive the request in their
  portal; review, information exchange, acceptance/rejection and completion
  update the durable timestamped timeline. Patients may cancel and track.
  `SENT` means routed to connected staff, not proof of email receipt or review.
- **Blood:** normal requests/donation pledges use the blood-bank flow. Urgent
  requests use `/urgent-blood`, separate from emergency beds, with separate
  urgency choices. No live blood inventory is implied.
- **Ambulance:** call/navigate or record a booking for the selected provider.
  The record/reference and email outcomes persist; dispatch is not guaranteed.
- **Careers:** apply to a job or organization and receive a public `CAR-...`
  reference. Confirmation emails and dashboard history include tracking.
- **Track request:** `/track` supports blood/donation, bed, career and ambulance.
  Enter type/reference for public status only. No private token field is needed
  there. Authorized detail links retain guest credentials for private data and
  changes; reference-only access cannot reveal contact or medical details.

Read the [bed lifecycle](bed-request-lifecycle.md), [services/maps](SERVICES_AND_MAP_GUIDE.md)
and [API contracts](api.md) for exact state/access rules.

## Accounts and dashboards

Password registration/login, region onboarding, verification, reset/change and
session inspection/revocation are available. Login redirects preserve the
intended application/request destination. Google OAuth is removed.

The patient dashboard loads saved/profile, bed requests and career applications
independently. An outage shows a targeted retry in that section. Application
references have copy/tracking actions; Skeleton's tracking card also offers copy
and a manual fallback when clipboard permission is denied.

In-app notification pages, API and storage writes are removed. All emails,
patient-facing delivery history and controlled eligible retries remain.

## Hospital staff and administrators

Assigned hospital staff can edit allowed fields, submit evidence-backed capability
claims for review, enter timestamped availability observations, review requests
and manage applications/jobs within their scope. Unassigned staff cannot access
another hospital's records. Ownership requests require manual system-admin review.
Capability claims never establish current availability by themselves.

System administrators review ownership, jobs, source claims/conflicts, resources, analytics, audit and safe account/security metadata. Email
configuration/history/retry and user/session administration are system-admin-only.
No verification is granted just because data was seeded.

## Maps, SOS and assistant

The homepage's **Full Map View →** opens the existing `/map` route. Map is removed
only from the top navbar. Backend provider markers and map/list selection remain;
contact/directory actions remain usable if Maps credentials or location fail.
Manual locality selection is available when GPS is denied/unavailable.

SOS is the single bottom-right floating action button. The healthcare assistant
still opens through its existing emergency-help actions and event entry points.
Its opaque header, scrollable conversation, compact actions and sticky input
preserve backend integration. See [assistant](ai-assistant.md).

## Email and optional integrations

Email delivery is configured once on the shared backend, not per frontend.
With `EMAIL_ENABLED=false`, intent records are stored without SMTP traffic.
With SMTP enabled, records distinguish attempted/sent/failed outcomes. `sent`
means mail-server acceptance, not confirmed inbox receipt. Auth tokens are not
returned by the API or stored in replayable email payloads.

Bed, blood and career submissions attempt up to three independent emails at
once, save the primary record first and await all delivery attempts. Eligible
failed messages can be retried through system-admin email controls. See
[latency verification](latency-verification.md) and [deployment](deployment.md).

Google Maps uses optional public browser credentials. Routing defaults to
unknown duration unless a real provider is configured. The assistant defaults
to deterministic rules; optional AI keys remain on the backend. Optional Gemini
ingestion refinement produces cited review candidates, never automatic facts.

## Verification limits

Automated local tests use isolated accounts/providers/databases and disabled or
mocked outbound email. Production builds and browser journeys do not prove live
hospital participation, dispatch, inventory, mailbox receipt, hosted health or
physical-device accessibility. Historical crawler findings and proposed
research work remain documented; use [Release QA](release-qa.md) before rollout.
