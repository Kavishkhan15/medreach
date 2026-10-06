<p align="center">
  <img src="brand-word-mark.png" alt="MedReach" width="280" />
</p>

<h1 align="center">MedReach</h1>

**Cloud deployment:** [Vercel frontends + Railway API + MongoDB Atlas](docs/cloud-deployment.md), including a verified copy of the existing dataset.

Healthcare discovery and request coordination for Mumbai. Bootstrap, Tailwind
and Skeleton are active frontends for one Express/MongoDB backend. Bootstrap is
the functional reference; each variant keeps its own design system.

The shared wordmark and shield symbol are documented in [Brand assets](docs/branding.md).

A request is coordination, not a confirmed bed reservation, blood inventory or
ambulance dispatch. Unknown information stays unknown. API failures show errors
and recovery actions instead of fallback providers, jobs or availability.

## Current verification

The application now reads its existing healthcare dataset from MongoDB through
the shared Express API. Automated crawling and source acquisition have been
removed. Current verification and limits are tracked in [Release QA](docs/release-qa.md).

Security hardening covers persisted sessions, public campaign privacy, safe
resume links and explicit proxy trust.
See [security verification](docs/security-verification.md) for tested scope.

Submission emails now run in batches of up to three independent deliveries per
request. The API still waits for every attempt; saved records, delivery outcomes,
retries and tracking remain intact. See the
[latency measurements and benchmark](docs/latency-verification.md). These local
measurements use simulated SMTP delays, not production timings.

## Product flows

- **Discovery:** hospital search/details, provenance, specialties, capability,
  maps and contact/directions. Current availability requires verified evidence.
- **Bed requests:** hospital pages submit standard requests; `/emergency`
  submits emergency requests without requiring login. Assigned staff review,
  request information, accept/reject and complete; patients track or cancel.
  Ambulance assistance inside a bed request is arranged by the hospital.
- **Blood:** normal requests/donation pledges and a dedicated `/urgent-blood`
  flow with distinct urgency choices.
- **Ambulance:** contact/navigation and durable bookings with delivery status;
  recording a booking does not confirm dispatch.
- **Careers:** job/organization applications, staff review and server-generated
  public `CAR-...` references in confirmations and dashboard history.
- **Tracking:** `/track` supports blood/donation, bed, career and ambulance
  references. Public lookup returns only reference/status/update time. Private
  details and changes remain protected by ownership, staff authorization or a
  guest tracking credential.
- **Accounts:** password login, region onboarding, email verification,
  password recovery, rotating sessions and session revocation.
- **Assistant:** healthcare chat with real backend results and existing actions.
  SOS is the only bottom floating action button.
- **Operations:** hospital ownership review, scoped staff, verification/conflicts,
  provider and claim review, analytics, audit and email administration.

Google OAuth and the in-app notification inbox/API are intentionally removed.
All transactional emails and controlled delivery retries remain. `/map` opens
through **Full Map View →** on the homepage; Map is absent from the top navbar.

## Technology and layout

| Layer | Repository configuration |
| --- | --- |
| Frontends | Next.js 15.5.24; React/React DOM 18.3.1 |
| Designs | Bootstrap 5.3.3, Tailwind CSS 4, Skeleton CSS 2 |
| Backend | Express 4, Mongoose 8, Node.js ≥22.19.0; CI uses Node 24 |
| Database | MongoDB with geo/text indexes, evidence and workflow records |
| Authentication | Short access JWTs and hashed rotating refresh sessions |
| Tests | Node test runner, Supertest, Playwright/Chromium |

```text
backend/          API, models, services, tests and migrations
packages/core/    shared API client, hooks, ranking, location and formatting
variants/         bootstrap/, tailwind/, skeleton/
docs/             current guides, release evidence and dated history
scripts/          release, database/browser and backup checks
evaluation/       research measurement and scoring tools
user-study/       proposed protocol and questionnaires
paper/            research outline
```

Bootstrap resolves `@medreach/core` to its bundled `_core` copy; Tailwind and
Skeleton use the workspace package. Keep shared changes synchronized and check
behavior, not only route names. See [architecture](docs/architecture.md) and
[frontend parity](docs/PARITY_VERIFICATION.md).

## Run locally

Start MongoDB separately, then from the repository root:

```sh
npm ci
cp backend/.env.example backend/.env
# Set the URI for the existing MongoDB dataset, JWT_SECRET and email settings.
./run.sh                         # API :4000; all three frontends
# Or choose one:
./run.sh bootstrap               # :3000
./run.sh tailwind                # :3001
./run.sh skeleton                # :3002
```

The API starts without a crawler process. Historical source metadata and claims
remain in MongoDB. Do not run optional development seed commands against the
existing dataset: they can replace records. See [stored data](docs/stored-data.md).

## Verify locally

```sh
npm run backend:test:db           # all database suites; fails on skips
NEXT_PUBLIC_API_URL=http://localhost:4000 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY='' npm run build:variants
npx playwright install --with-deps chromium
MEDREACH_E2E_MONGO_URI=mongodb://127.0.0.1:27017/medreach_e2e MONGODB_URI=mongodb://127.0.0.1:27017/medreach_e2e AI_PROVIDER=rule_based npm run test:e2e
npm audit --audit-level=high
git diff --check
```

Tests use disposable databases and mocked/disabled email. Maps loading is
excluded from deterministic QA builds; directory/contact fallbacks are checked.
`npm run release:check` additionally requires backup/restore and explicit
prerequisites; see [deployment](docs/deployment.md).

## Configuration and deployment

Set `NEXT_PUBLIC_API_URL` before building every hosted frontend. Configure MongoDB,
`PUBLIC_APP_URL`, exact CORS origins, production cookies and SMTP on the backend.
Public variables must never contain backend secrets. The assistant defaults to
a rule-based provider; optional OpenAI/Gemini configuration stays server-side.
Optional Gemini refinement only analyzes already stored evidence and requires admin review.

[Deployment](docs/deployment.md) covers commands, migrations, health, shutdown and
backup/restore. [Release QA](docs/release-qa.md) distinguishes local evidence,
live checks and deployment blockers. This documentation does not imply deployment.

## Documentation index

| Guide | Purpose |
| --- | --- |
| [Architecture](docs/architecture.md) | Current system map and boundaries |
| [Product guide](docs/Bootstrap_Product_Guide.md) | User/staff/admin workflows |
| [API](docs/api.md) · [Data model](docs/data-model.md) | Routes, access and persistence |
| [Security](docs/security.md) · [Privacy](docs/privacy.md) | Protections and limits |
| [Services/maps](docs/SERVICES_AND_MAP_GUIDE.md) | Booking, blood and tracking |
| [Bed lifecycle](docs/bed-request-lifecycle.md) | State transitions and private details |
| [Stored data](docs/stored-data.md) · [Assistant](docs/ai-assistant.md) | Dataset and assistant contracts |
| [Deployment](docs/deployment.md) | Production configuration and operations |
| [Release QA](docs/release-qa.md) · [Parity](docs/PARITY_VERIFICATION.md) | Current evidence and scope |
| [Latency](docs/latency-verification.md) | Benchmark and concurrency limits |
| [Implementation inventory](docs/MedReach_Implementation_Inventory.md) | Capabilities and remaining gaps |
| [Target architecture](docs/MedReach_Target_Architecture.md) | Direction and milestone context |
| [Research plan](docs/MedReach_Corrected_Plan.md) · [Evaluation](evaluation/README.md) | Proposed comparison and tools |
| [Historical results](docs/RESULTS-prelim.md) | Scaffolding measurements, not current results |

The research direction extends Almeida & Sousa (2026), *Security Risks in
Responsive Web Design Frameworks*, DOI
[10.3390/digital6010026](https://doi.org/10.3390/digital6010026). Local functional
checks do not establish a controlled research comparison or participant results.
