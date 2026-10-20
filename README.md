# MedReach

Healthcare discovery, provider onboarding and request tracking for Mumbai.
Bootstrap, Tailwind and Skeleton are independent Next.js frontends backed by
one Express API and the existing MongoDB dataset.

Requests support coordination with providers. They do not guarantee a bed,
blood inventory, an appointment or ambulance dispatch. For an immediate
emergency, call 112 or 108.

## Run locally

Requires Node.js >=22.19.0, npm and the existing local MongoDB service.

```sh
npm ci
./run.sh
```

| Service | Local URL |
| --- | --- |
| API | http://localhost:4000 |
| Bootstrap | http://localhost:3000 |
| Tailwind | http://localhost:3001 |
| Skeleton | http://localhost:3002 |

Keep existing environment files. On a new machine, use the supplied
`.env.example` files as templates; never overwrite working credentials.
Set `NEXT_PUBLIC_API_URL` before frontend production builds.

The recovered local database lives at `/home/anonymous/medreach/data`.
Do not seed, reset or run browser fixtures against it.
See [local MongoDB recovery and startup](LOCAL_MONGODB_SETUP.md).

## Product

- Hospital, blood-bank, diagnostic and ambulance discovery, maps and contact actions.
- Standard and emergency bed requests; blood requests and blood donation pledges;
  ambulance booking requests; private history and limited public reference tracking.
- Healthcare jobs, applications and application references.
- Provider applications embedded in the homepage, System Admin review and
  approved organisation account provisioning.
- Password authentication, activation, recovery, revocable sessions and
  organisation-scoped administration.
- A directory-grounded assistant with optional external language providers.

### Accounts

| Role | Workspace | Scope |
| --- | --- | --- |
| `system_admin` | `/admin` | Platform administration, approvals, accounts and emergencies |
| `provider_admin` | `/provider` | Explicitly assigned organisations and permitted workflows |
| `user` | `/dashboard` | Own profile, requests, donations and applications |

Public registration creates regular users. Provider submission alone grants
no access. Legacy role values may remain in historical data; they are not new
account options. See [security](docs/security.md) and
[local provider credential handling](LOCAL_PROVIDER_ACCOUNTS.md).

## Documentation

| Guide | Purpose |
| --- | --- |
| [Architecture](docs/architecture.md) | Code ownership, data flow and workers |
| [API](docs/api.md) | Route groups, authentication and response contracts |
| [Data model](docs/data-model.md) | Collections, relationships and provenance |
| [Deployment](docs/deployment.md) | Vercel, Railway, Atlas and email configuration |
| [Security](docs/security.md) / [Privacy](docs/privacy.md) | Access controls and data handling |
| [Verification](docs/release-qa.md) | Test commands, actual results and limitations |
| [Performance](docs/latency-verification.md) | Measurements and optimizations |
| [Frontend parity](docs/PARITY_VERIFICATION.md) | Shared workflows and intentional differences |
| [Services and maps](docs/SERVICES_AND_MAP_GUIDE.md) | Discovery and service workflows |
| [Bed lifecycle](docs/bed-request-lifecycle.md) | Request states and permissions |
| [Assistant](docs/ai-assistant.md) | Grounding and fallback behavior |
| [Stored dataset](docs/stored-data.md) | Preservation and historical provenance |
| [Research](evaluation/README.md) | Evaluation tools and evidence limits |

## Verify safely

```sh
npm run lint
node --test tests/unit/*.test.mjs
npm run backend:test:db
npm run build:variants
npm run test:e2e
git diff --check
```

Backend and browser tests recreate their own fixtures. Use a disposable local
MongoDB instance and the exact test database names listed in
[verification](docs/release-qa.md). Ordinary `npm test` can skip database-gated
tests and is not the complete release check.

No crawler runs in MedReach. Existing healthcare records and acquisition
provenance remain stored; removing collection code does not remove the dataset.
Google OAuth, the in-app notification inbox and `/admin/operations` are retired.
Email notifications, maps and the main `/admin` dashboard remain.

## Research materials

[Research plan](docs/MedReach_Corrected_Plan.md),
[paper outline](paper/outline.md) and [study protocols](user-study/README.md)
describe proposed evaluation. Historical or placeholder scores are not current
measurements or security certifications.
