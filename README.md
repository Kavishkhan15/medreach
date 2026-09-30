<p align="center">
  <img src="docs/assets/logo.png" alt="MedReach logo" width="280" />
</p>

<h1 align="center">MedReach</h1>

<p align="center">
  <strong>A source-aware healthcare discovery and emergency-request coordination platform for Mumbai.</strong>
</p>

<p align="center">
  Deterministic ranking · Honest freshness &amp; confidence · No fabricated data · No diagnosis
</p>

---

MedReach helps a person find hospitals and other healthcare resources, inspect the evidence behind a listing, send an emergency bed request to connected hospital staff, and track the response. A request is not a reservation; static capability is not live availability.

The [Bootstrap product guide](docs/Bootstrap_Product_Guide.md) describes the working product, local setup, APIs, external configuration, and limitations. Earlier [target architecture](docs/MedReach_Target_Architecture.md) and [implementation inventory](docs/MedReach_Implementation_Inventory.md) remain planning snapshots.

It is deliberately **deterministic and transparent**: rule-based ranking with inspectable reasons, honest data freshness and confidence, verified sources with provenance. The core discovery/ranking engine is **NO AI/ML, no LLM, no diagnosis, no prediction** — it never implies it is an official emergency service. The one place a large-language-model provider *may* optionally sit is the AI Assistant chat, and even there it defaults to a fully deterministic rule-based provider with zero external calls and is contractually forbidden from fabricating hospital data or diagnosing anyone. → [AI Assistant docs](docs/ai-assistant.md)

It is also an empirical extension of **Almeida & Sousa (2026)**, *"Security Risks in Responsive Web Design Frameworks,"* *Digital* **6**(1), 26. DOI: [10.3390/digital6010026](https://doi.org/10.3390/digital6010026). → [Research plan](docs/MedReach_Corrected_Plan.md)

## Core research constraint

The **current implementation phase uses Bootstrap as the sole active product frontend**. Tailwind and Skeleton remain in the repository for the later controlled CSS-framework study. Do not use the present expanded application for a three-way comparison until frontend parity is restored and reverified.

Hospital search, ranking, freshness/confidence, data fusion, and workflow rules live in `packages/core` and `backend/`. Bootstrap currently contains presentation and API-connected forms for the new product modules; the other variants have not yet received those screens.

## Built with

| Layer | Technology |
|---|---|
| Frontend framework | [Next.js](https://nextjs.org) 14 (App Router), React 18 |
| CSS (the variable under test) | [Bootstrap](https://getbootstrap.com) 5 · [Tailwind CSS](https://tailwindcss.com) 4 · [Skeleton CSS](http://getskeleton.com) |
| Backend | [Express](https://expressjs.com) 4, Node.js ≥22.19 (ESM) |
| Database | [MongoDB](https://www.mongodb.com) + [Mongoose](https://mongoosejs.com) 8 (2dsphere geo index, text search) |
| Auth | [JSON Web Tokens](https://jwt.io) (httpOnly cookie or Bearer), [bcrypt](https://www.npmjs.com/package/bcryptjs) |
| Security middleware | [Helmet](https://helmetjs.github.io), [express-rate-limit](https://www.npmjs.com/package/express-rate-limit), [express-validator](https://express-validator.github.io) |
| AI Assistant provider (optional) | [OpenAI](https://platform.openai.com) API — swappable, off by default, deterministic rule-based provider otherwise |
| Testing | Node.js built-in [`node:test`](https://nodejs.org/api/test.html) + [Supertest](https://www.npmjs.com/package/supertest) |
| Monorepo | npm [workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) |
| Deployment | [Vercel](https://vercel.com) (frontend) / [Railway](https://railway.app) (API + MongoDB) |
| CI | [GitHub Actions](https://github.com/features/actions) |

## Layout

```
medreach/
├── docs/            all subsystem docs + this README's logo
├── backend/         Express + MongoDB API — the shared brain, identical for every variant
├── crawler/         SSRF-safe modular crawler for public hospital data
├── packages/core/   framework-agnostic client logic — zero CSS classes
├── variants/
│   ├── bootstrap/   Next.js + Bootstrap 5   (reference; deployed)
│   ├── tailwind/    Next.js + Tailwind CSS 4
│   └── skeleton/    Next.js + Skeleton CSS
├── evaluation/      4-axis pipeline + RWD Security Risk Score
├── user-study/      IRB protocol, consent, SUS + NASA-TLX
├── run.sh           launches backend + Bootstrap only for this product phase
└── .github/workflows/  CI: build + evaluation
```

Bootstrap includes the expanded routes for requests, hospital operations, resources, careers, notifications, analytics and account recovery. Tailwind and Skeleton still reflect the earlier research baseline.

## What's inside

Each piece below is intentionally kept short here — click through for the full picture.

| Piece | What it does | Read more |
|---|---|---|
| 🏥 **Emergency discovery** | Pick an emergency category, get hospitals ranked by a transparent weighted score, call or navigate in one tap. GPS is opt-in and never stored. | [`docs/data-model.md`](docs/data-model.md) (ranking formula) |
| 🤖 **AI Assistant** | A 4th action in the Emergency Help modal opens a chat that finds hospitals and explains capability — never fabricates data, never diagnoses, always keeps Call 112/102 one tap away, provider is swappable via env var. | [`docs/ai-assistant.md`](docs/ai-assistant.md) |
| 🕷️ **Crawler** | Registry-bound pipeline with nine approved sources, including government directories. A server worker checks source-specific schedules; blocked sources stay blocked. | [`docs/crawler.md`](docs/crawler.md) |
| 🚑 **Emergency requests** | Users submit a request; connected hospital staff can review and respond; the timeline and in-app notifications track changes. No bed is booked automatically. | [`docs/Bootstrap_Product_Guide.md`](docs/Bootstrap_Product_Guide.md) |
| 🩸 **Care resources** | Source-backed blood-bank, diagnostic and ambulance listings, plus optional clearly labeled demo fixtures. | [`docs/Bootstrap_Product_Guide.md`](docs/Bootstrap_Product_Guide.md) |
| 💼 **Careers** | Hospital job drafts, admin moderation, applications and status tracking. | [`docs/Bootstrap_Product_Guide.md`](docs/Bootstrap_Product_Guide.md) |
| 🛠️ **Admin** | Role-gated dashboards for hospital verification, data sources, crawler job history, alerts, and an audited log with hashed IPs. | [`docs/api.md`](docs/api.md#admin) |
| 🧩 **Shared API** | Every REST endpoint the frontends and admin dashboards call. | [`docs/api.md`](docs/api.md) |
| 🗄️ **Data model** | Provenance and conflict claims plus request, ownership, provider, job, notification, email and refinement records. | [`docs/data-model.md`](docs/data-model.md) |
| 🔒 **Security** | Helmet CSP, rate limiting, RBAC, input validation, secret handling — identical across all 3 variants. | [`docs/security.md`](docs/security.md) |
| 🕵️ **Privacy** | What's stored, what's never stored, and why. | [`docs/privacy.md`](docs/privacy.md) |
| 🚀 **Deployment** | Env vars, per-piece deploy steps, and the Bootstrap variant's standalone-build vendoring. | [`docs/deployment.md`](docs/deployment.md) |
| 🗺️ **System architecture** | The full module map and how the pieces connect. | [`docs/architecture.md`](docs/architecture.md) |
| 📊 **Research plan** | The RWD Security Risk Score instrument and the study design this whole app supports. | [`docs/MedReach_Corrected_Plan.md`](docs/MedReach_Corrected_Plan.md) |
| 📈 **Preliminary results** | Early evaluation output. | [`docs/RESULTS-prelim.md`](docs/RESULTS-prelim.md) |

## Run it

```bash
npm install                        # from repo root (installs all workspaces)

# Backend (needs MongoDB, e.g. mongod --dbpath /tmp/medreach-mongo --fork --logpath /tmp/medreach-mongo/m.log)
cp backend/.env.example backend/.env   # then edit; never commit the real .env
npm --workspace @medreach/backend run seed:product-demo   # additive, clearly labeled product fixtures
npm --workspace @medreach/backend run sync:hospital-resources # derive listings from real hospital claims
npm run backend:dev                # API on :4000

# Crawler (runs standalone, never inside the frontend)
npm run crawler:test               # offline crawler suite; live-network cases are opt-in
npm run crawl:list                 # list approved sources
npm run crawl -- --source lilavati --dry-run   # dry-run a single source, no writes

# Seed the crawler's DataSource entries (once, after backend:seed)
npm --workspace @medreach/backend run seed:crawler-sources

# Tests
npm test                           # backend + crawler suites

# Active Bootstrap product frontend (reads NEXT_PUBLIC_API_URL, default http://localhost:4000)
npm --workspace @medreach/variant-bootstrap run dev   # :3000
# ...or launch backend + all three variants together (one Ctrl+C stops all):
./run.sh

# Evaluation (machine-readable JSON → evaluation/results/)
npm run build:variants
npm run eval:performance           # CSS/JS bundle sizes per variant
npm run eval:results               # combined security + performance summary.json
npm run score                      # RWD Security Risk Score
```

Authentication uses a short-lived access JWT plus an opaque, hashed, rotating
refresh session in httpOnly cookies. Password, recovery, verification, session,
and SMTP setup are documented in the [Bootstrap product guide](docs/Bootstrap_Product_Guide.md).
All backend variable names are in `backend/.env.example`; SMTP secrets must never
be placed in `NEXT_PUBLIC_*` variables.

**AI Assistant is optional and off by default.** No extra setup is required to try it — it works immediately after `backend:dev` using the zero-config rule-based provider. To connect a real LLM instead, add to `backend/.env`:

```bash
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini   # optional, this is the default
```
→ full details in [`docs/ai-assistant.md`](docs/ai-assistant.md#provider-abstraction-swap-without-touching-the-ui)

## Data and release status

The product frontends require the backend for provider and request data. When the API is unavailable, they show an error or recovery state rather than substitute fixture providers. Set `NEXT_PUBLIC_API_URL` to the public backend origin **before building** a hosted frontend. Local test fixtures are used only by isolated tests. See [deployment](docs/deployment.md) and [release QA](docs/release-qa.md) for the separate local and hosted checks.

## Status

| Piece | State |
|-------|-------|
| `backend/` | ✅ models, rotating-session auth, recovery/email, RBAC, availability time-series, verification+audit, crawler API, AI Assistant API |
| `crawler/` | ✅ SSRF-safe modular pipeline; deterministic tests and live-network probes run separately |
| `packages/core/` | ✅ deterministic brain (ranking/search/freshness/confidence/emergency/location/assistant), zero framework classes |
| `variants/{bootstrap,tailwind,skeleton}/` | ✅ shared API journeys with three separate design systems; use release QA for current build and browser results |
| AI Assistant | ✅ chat UI in all 3 variants, deterministic by default, optional swappable LLM provider, fails safe |
| `evaluation/` | ✅ security + performance axes → machine-readable `results/` |
| Core ranking/discovery AI/ML | 🚫 none — deterministic rules only, by design |

## Documentation index

| Doc | Covers |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | System map and module boundaries |
| [`docs/ai-assistant.md`](docs/ai-assistant.md) | AI Assistant design, provider swap, safety guarantees |
| [`docs/crawler.md`](docs/crawler.md) | Crawler pipeline, SSRF/robots safety, capability vs. availability |
| [`docs/api.md`](docs/api.md) | Full REST API reference |
| [`docs/data-model.md`](docs/data-model.md) | Mongoose schemas, freshness/confidence/ranking formulas |
| [`docs/security.md`](docs/security.md) | Security posture, rate limits, secrets, test coverage |
| [`docs/privacy.md`](docs/privacy.md) | Location handling, IP hashing, data retention |
| [`docs/deployment.md`](docs/deployment.md) | Environment variables, per-piece deployment, Bootstrap vendoring |
| [`docs/SERVICES_AND_MAP_GUIDE.md`](docs/SERVICES_AND_MAP_GUIDE.md) | Services, ambulance booking, urgent blood dispatch & map parity |
| [`docs/MedReach_Corrected_Plan.md`](docs/MedReach_Corrected_Plan.md) | Research design and RWD Security Risk Score instrument |
| [`docs/RESULTS-prelim.md`](docs/RESULTS-prelim.md) | Preliminary evaluation results |
