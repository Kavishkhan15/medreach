<div align="center">

<img src="brand-word-mark.png" alt="MedReach" width="300" />

# Connected healthcare for Mumbai

Find a provider. Start the right request. Follow what happens next.

[![CI](https://github.com/kasim672/medreach/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kasim672/medreach/actions/workflows/ci.yml)
[![Evaluation checks](https://github.com/kasim672/medreach/actions/workflows/evaluate.yml/badge.svg?branch=main)](https://github.com/kasim672/medreach/actions/workflows/evaluate.yml)

[Bootstrap](https://medreachmumbai.vercel.app/) · [Tailwind](https://medreach-tailwind.vercel.app/) · [Skeleton](https://medreach-skeleton.vercel.app/)

[Documentation](docs/README.md) · [Architecture](#architecture) · [Screenshots](docs/screenshots/README.md) · [Run locally](#run-locally)

</div>

![MedReach Bootstrap homepage with healthcare discovery and emergency care entry points](docs/screenshots/current/bootstrap-home.jpg)

MedReach brings hospital, blood-bank, diagnostic and ambulance discovery into
one application, with provider onboarding, healthcare requests and Careers.
Three independent Next.js frontends—**Bootstrap, Tailwind and Skeleton**—use
the same Express API, MongoDB dataset and backend access controls.

Screenshots show the actual local application and stored directory records,
captured on **22 October 2026**. They are interface snapshots, not evidence of
current availability, campaign dates, provider participation or live dispatch.

## Contents

[Product tour](#explore-medreach) · [Frontend variants](#three-frontends-one-product) ·
[Roles](#roles-and-access) · [Architecture](#architecture) ·
[Local setup](#run-locally) · [Verification](#verification) · [Documentation](#documentation)

## Explore MedReach

| Find care | Coordinate and follow up | Manage the network |
| --- | --- | --- |
| Hospitals and provider profiles | Standard and emergency bed requests | Provider applications and approvals |
| Blood banks and diagnostics | Normal/urgent blood requests and blood donation | Organisation-scoped Provider Admin workspace |
| Ambulance listings and map discovery | Ambulance requests and private request history | System Admin accounts and platform oversight |
| Directory-grounded assistant | Healthcare Careers, applications and reference tracking | Eligible provider/user email notifications |

Requests support coordination. They do not guarantee a bed, blood inventory,
an appointment or ambulance dispatch. The app is not a medical advice service.

### A closer look

| Hospital discovery | Provider onboarding |
| --- | --- |
| ![Hospital directory with search, locality filtering and contact actions](docs/screenshots/current/bootstrap-hospitals.jpg) | ![Embedded Join the MedReach Network application form](docs/screenshots/current/provider-application.jpg) |
| Search actual stored listings and open provider details. | Apply from the homepage; review and activation precede access. |

| Healthcare Careers | Hospital details |
| --- | --- |
| ![Healthcare Careers directory grouped by organisation type](docs/screenshots/current/careers.jpg) | ![Hospital profile with listed contact information and request action](docs/screenshots/current/hospital-detail.jpg) |
| Browse organisations and their available application flows. | Review recorded information before contacting the provider. |

See the [full screenshot gallery](docs/screenshots/README.md) for mobile views,
emergency discovery and all three frontend variants.

## Three frontends, one product

| Bootstrap | Tailwind | Skeleton |
| --- | --- | --- |
| ![Bootstrap mobile homepage](docs/screenshots/current/bootstrap-mobile.jpg) | ![Tailwind mobile homepage](docs/screenshots/current/tailwind-mobile.jpg) | ![Skeleton mobile homepage](docs/screenshots/current/skeleton-mobile.jpg) |
| Bootstrap 5.3 · port `3000` | Tailwind CSS 4 · port `3001` | Skeleton CSS 2 · port `3002` |

Each variant keeps its own components and framework styling. Shared workflows
use the same API and data semantics. Some UI is deliberately variant-specific,
including Bootstrap's local manual credential handover. See
[parity scope](docs/PARITY_VERIFICATION.md) for the exact boundaries.

## Roles and access

One login page routes accounts to the appropriate workspace.

| Role | Workspace | Access |
| --- | --- | --- |
| `system_admin` | `/admin` | Platform oversight, provider approvals/accounts, users and emergencies |
| `provider_admin` | `/provider` | Explicitly assigned organisations and their permitted workflows |
| `user` | `/dashboard` | Own profile, requests, blood donation and applications |

Public registration creates regular users. A provider application grants no
login access before approval and activation. Backend checks enforce role and
organisation scope, including direct API calls. Historical role values do not
create new account options. [Security and account lifecycle →](docs/security.md)

## Run locally

**Requirements:** Node.js **≥22.19.0**, npm, and MongoDB with the intended dataset.
CI uses Node.js 24. Install dependencies from the repository root.

```sh
npm ci
./run.sh
```

| Service | URL |
| --- | --- |
| Shared API | <http://localhost:4000> |
| Bootstrap | <http://localhost:3000> |
| Tailwind | <http://localhost:3001> |
| Skeleton | <http://localhost:3002> |

To run one frontend with the backend, use `./run.sh bootstrap`,
`./run.sh tailwind` or `./run.sh skeleton`. Press `Ctrl+C` to stop the launcher.

<details>
<summary><strong>First setup and environment variables</strong></summary>

Keep existing environment files. On a new machine, use the supplied
`.env.example` files as templates and configure the intended MongoDB connection.
`MONGODB_URI` takes precedence over `MONGO_URI`.

Set `NEXT_PUBLIC_API_URL` before production frontend builds. Maps uses a
restricted browser API key when configured; without a usable key, provider
lists remain available with an honest map fallback. Email and optional external
AI configuration belong on the backend. Never expose their secrets through
`NEXT_PUBLIC_*`.

The recovered workstation dataset is at `/home/anonymous/medreach/data`.
Do not seed, reset or run browser fixtures against it. New installations do not
receive a copy of that private database from Git.

[Local MongoDB setup](LOCAL_MONGODB_SETUP.md) · [Deployment and email](docs/deployment.md)

</details>

## Architecture

**Three independent frontends. One shared backend. One Atlas dataset.**

The diagrams below show different views of the same application: code and
runtime boundaries, cloud deployment, and the data relationships behind care
coordination. Open any figure for its full-size SVG.

### System topology

[![MedReach system topology: three Next.js frontends, shared client contracts, one Express API with in-process workers, MongoDB and configured email transport](docs/diagrams/system-architecture.png)](docs/diagrams/system-architecture.svg)

Each frontend keeps its own presentation layer. The API owns authentication,
organisation-scoped permissions and healthcare workflows. Request expiry,
notification recovery and email delivery run inside that backend process.

### Cloud deployment

[![MedReach cloud deployment: three Vercel projects call one Railway API connected to MongoDB Atlas; browser Maps and backend mail have separate boundaries](docs/diagrams/deployment-architecture.png)](docs/diagrams/deployment-architecture.svg)

Vercel serves the frontends; browsers call the Railway API over HTTPS. The API
connects to Atlas and the configured Resend/SMTP transport. Database, JWT and
mail credentials stay on the backend. Google Maps is a browser integration.

### Database model

[![MedReach core ER view: hospital and resource-provider records connect to healthcare requests, jobs and candidate applications](docs/diagrams/database-er.png)](docs/diagrams/database-er.svg)

This is a selected view of care and Careers relationships, not an exhaustive
collection inventory. The companion [account and provider-scope ER view](docs/diagrams/README.md#accounts-and-provider-scope)
shows users, auth tokens, active provider memberships and approved applications.
Existing data, assignments and historical source evidence are preserved; no
crawler is required to serve the stored dataset.

[Architecture and code map →](docs/architecture.md) ·
[All diagrams and editable sources →](docs/diagrams/README.md) ·
[Schema reference →](docs/database-schema.md)

<details>
<summary><strong>Repository map</strong></summary>

```text
backend/          Express routes, permissions, models, services and workers
packages/core/    Shared frontend client, hooks and data helpers
variants/         Independent Bootstrap, Tailwind and Skeleton frontends
tests/            Browser journeys and focused unit tests
docs/             Architecture, operations, security and verification guides
evaluation/       Hosted measurements and explicitly scoped research tools
user-study/       Proposed protocols and draft questionnaires
```

</details>

## Verification

Recorded code baseline: [`2a2f24d`](https://github.com/kasim672/medreach/commit/2a2f24d587407da27742d7b93898d9116d470c28), verified on **23 October 2026**.
[All 13 GitHub checks passed](https://github.com/kasim672/medreach/actions/runs/39940586762).

| Check | Recorded result |
| --- | --- |
| Backend, all database gates | **359 passed**, no failures or skips |
| Focused unit tests | **17 passed** |
| Browser journeys | **269 passed**, 40 explicit Bootstrap-only scope skips |
| Production builds | **Bootstrap, Tailwind and Skeleton passed** |
| Dependency audit | **0 known vulnerabilities** at the recorded check |
| Lint | **0 errors**, 12 existing hook dependency warnings |
| Earlier disposable backup/restore drill | **16 collections / 539 test documents restored**; separate historical check |

These are dated regression results. They do not certify security, clinical
accuracy, accessibility compliance, real inbox receipt or hosted performance.
The workflow badges above show subsequent GitHub status.

```sh
npm run lint
node --test tests/unit/*.test.mjs
npm run backend:test:db
npm run build:variants
npm run test:e2e
git diff --check
```

**Use disposable databases for tests.** Backend/browser fixtures can delete
their own data. Plain `npm test` may skip database-gated suites; the strict
runner enables all gates. [Safe setup, full release check and evidence →](docs/release-qa.md)

## Documentation

Start with the [documentation hub](docs/README.md), organised by task.

| Build and understand | Run and maintain | Product and research |
| --- | --- | --- |
| [Architecture](docs/architecture.md) · [Diagrams](docs/diagrams/README.md) | [Deployment and email](docs/deployment.md) | [Services and maps](docs/SERVICES_AND_MAP_GUIDE.md) |
| [API reference](docs/api.md) | [Release QA](docs/release-qa.md) · [Testing](docs/testing.md) | [Request lifecycle](docs/bed-request-lifecycle.md) |
| [Data model](docs/data-model.md) · [Database schema](docs/database-schema.md) | [Security](docs/security.md) · [Privacy](docs/privacy.md) | [Assistant](docs/ai-assistant.md) |
| [Frontend variants](variants/README.md) | [Performance measurements](docs/latency-verification.md) | [Evaluation tooling](evaluation/README.md) |

## Troubleshooting

| Symptom | Cause | Solution |
| --- | --- | --- |
| `EADDRINUSE: address already in use :::3000` (or `4000`) | A prior process is holding the frontend or backend port. | Stop the previous launcher with `Ctrl+C`. Inspect the port owner before stopping another process; use one frontend if that is all you need. |
| `MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017` | Local MongoDB daemon is not running. | Check the configured MongoDB service and [local setup](LOCAL_MONGODB_SETUP.md). Preserve the existing data directory; starting a different empty database will not recover the records. |
| `/api/auth/me` returns `401` | Expected for a signed-out visitor; a signed-in failure can involve expired sessions or blocked cookies. | For a failed login, check the [deployment cookie/CORS guidance](docs/deployment.md). Vercel/Railway cross-site cookies require different settings from localhost. |
| Stale styles or missing client modules after branch switch | Next.js build cache discrepancy. | Stop the affected frontend, check its build configuration, and rebuild that variant. See the [frontend guide](variants/README.md). |
| Map fails to load or shows grey container | Missing or restricted Google Maps API key. | MedReach provides an honest list fallback without an active key. Supply `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local` if map rendering is required. |

### Data and contribution boundaries

Keep credentials, patient information, private tracking links, resumes and database
files out of Git and screenshots. Preserve real provider data and assignments.
Use isolated fixtures for repeatable workflows. Never add fake availability to
make a page look populated. See [stored data](docs/stored-data.md) and
[local provider accounts](LOCAL_PROVIDER_ACCOUNTS.md).

The crawler, Google OAuth, in-app notification inbox, User Admin role and
`/admin/operations` are intentionally retired. Maps, provider approvals, email
and the main `/admin` dashboard remain.

Research plans, draft study instruments and historical figures are labelled in
the [research documentation](evaluation/README.md). The [hosted evaluation](evaluation/HOSTED_RESULTS.md)
records measured deployment results and their limits. Composite security grades
remain unmeasured until all required evidence is available.

## License

This project is licensed under the [MIT License](package.json).

---

Designed and engineered for Mumbai's connected healthcare ecosystem.
