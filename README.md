<p align="center">
  <img src="docs/assets/logo.png" alt="MedReach logo" width="280" />
</p>

<h1 align="center">MedReach</h1>

<p align="center">
  <strong>A research-grade emergency hospital discovery platform for Mumbai — and a controlled testbed for empirically comparing three CSS frameworks.</strong>
</p>

<p align="center">
  Deterministic ranking · Honest freshness &amp; confidence · No fabricated data · No diagnosis
</p>

---

MedReach helps a person answer, with minimum friction: *I need emergency care → where am I? → what kind of emergency? → here are the most relevant hospitals → here's what is known about their current capability → CALL or NAVIGATE.*

It is deliberately **deterministic and transparent**: rule-based ranking with inspectable reasons, honest data freshness and confidence, verified sources with provenance. The core discovery/ranking engine is **NO AI/ML, no LLM, no diagnosis, no prediction** — it never implies it is an official emergency service. The one place a large-language-model provider *may* optionally sit is the AI Assistant chat, and even there it defaults to a fully deterministic rule-based provider with zero external calls and is contractually forbidden from fabricating hospital data or diagnosing anyone. → [AI Assistant docs](docs/ai-assistant.md)

It is also an empirical extension of **Almeida & Sousa (2026)**, *"Security Risks in Responsive Web Design Frameworks,"* *Digital* **6**(1), 26. DOI: [10.3390/digital6010026](https://doi.org/10.3390/digital6010026). → [Research plan](docs/MedReach_Corrected_Plan.md)

## Core research constraint

The backend, database, API, authentication, shared business logic, HTML information architecture, accessibility semantics, and security headers/CSP are **shared and identical** across all three frontend variants. **The CSS framework is the only deliberately-varied factor.**

No business logic, hospital search, ranking, freshness/confidence computation, or AI Assistant logic is ever written inside `variants/*`. That logic lives once, in `packages/core` (framework-agnostic, zero CSS classes) and `backend/` (shared API). Each variant only supplies `className` values and its own CSS bundle around identical components, routes, and behavior.

## Built with

| Layer | Technology |
|---|---|
| Frontend framework | [Next.js](https://nextjs.org) 14 (App Router), React 18 |
| CSS (the variable under test) | [Bootstrap](https://getbootstrap.com) 5 · [Tailwind CSS](https://tailwindcss.com) 4 · [Skeleton CSS](http://getskeleton.com) |
| Backend | [Express](https://expressjs.com) 4, Node.js ≥20 (ESM) |
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
├── run.sh           launches backend + all 3 variants together, one Ctrl+C stops all
└── .github/workflows/  CI: build + evaluation
```

Each variant has the **same routes** (`/`, `/hospitals`, `/hospitals/[slug]`, `/emergency`, `/map`, `/login`, `/admin` + 6 admin sub-routes) and the **same components** (SystemBanner, Navbar, SOS, AiAssistantModal, StatusPill, DataFreshness, FacilityStatus, EmergencyCategorySelector, HospitalCard, HospitalList, AdminNav, AdminGuard). Only CSS differs.

## What's inside

Each piece below is intentionally kept short here — click through for the full picture.

| Piece | What it does | Read more |
|---|---|---|
| 🏥 **Emergency discovery** | Pick an emergency category, get hospitals ranked by a transparent weighted score, call or navigate in one tap. GPS is opt-in and never stored. | [`docs/data-model.md`](docs/data-model.md) (ranking formula) |
| 🤖 **AI Assistant** | A 4th action in the Emergency Help modal opens a chat that finds hospitals and explains capability — never fabricates data, never diagnoses, always keeps Call 112/102 one tap away, provider is swappable via env var. | [`docs/ai-assistant.md`](docs/ai-assistant.md) |
| 🕷️ **Crawler** | Standalone, SSRF-safe pipeline that ingests publicly available capability data from 4 approved Mumbai hospital sites. Never runs inside a frontend process. | [`docs/crawler.md`](docs/crawler.md) |
| 🛠️ **Admin** | Role-gated dashboards for hospital verification, data sources, crawler job history, alerts, and an audited log with hashed IPs. | [`docs/api.md`](docs/api.md#admin) |
| 🧩 **Shared API** | Every REST endpoint the frontends and admin dashboards call. | [`docs/api.md`](docs/api.md) |
| 🗄️ **Data model** | 9 Mongoose models, plus the deterministic freshness/confidence/ranking engines. | [`docs/data-model.md`](docs/data-model.md) |
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
npm run backend:seed               # demo data: admin@medreach.test / Admin1234
npm run backend:dev                # API on :4000

# Crawler (runs standalone, never inside the frontend)
npm run crawler:test               # 76 tests (71 pass, 5 skipped — live-network, opt-in)
npm run crawl:list                 # list approved sources
npm run crawl -- --source lilavati --dry-run   # dry-run a single source, no writes

# Seed the crawler's DataSource entries (once, after backend:seed)
npm --workspace @medreach/backend run seed:crawler-sources

# Tests
npm test                           # backend (43) + crawler (76)

# Variants (each reads NEXT_PUBLIC_API_URL, default http://localhost:4000)
npm --workspace @medreach/variant-bootstrap run dev   # :3000
npm --workspace @medreach/variant-tailwind  run dev   # :3001
npm --workspace @medreach/variant-skeleton  run dev   # :3002
# ...or launch backend + all three variants together (one Ctrl+C stops all):
./run.sh

# Evaluation (machine-readable JSON → evaluation/results/)
npm run build:variants
npm run eval:performance           # CSS/JS bundle sizes per variant
npm run eval:results               # combined security + performance summary.json
npm run score                      # RWD Security Risk Score
```

**AI Assistant is optional and off by default.** No extra setup is required to try it — it works immediately after `backend:dev` using the zero-config rule-based provider. To connect a real LLM instead, add to `backend/.env`:

```bash
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini   # optional, this is the default
```
→ full details in [`docs/ai-assistant.md`](docs/ai-assistant.md#provider-abstraction-swap-without-touching-the-ui)

## Demo vs live data

The app works **without a backend**: `useSystemStatus` probes `/health`; if unreachable it falls back to clearly-labelled **DEMO** fixtures and shows a prominent banner. It never presents demo data as live. To go live, set `NEXT_PUBLIC_API_URL` to a deployed backend. → [`docs/deployment.md`](docs/deployment.md)

## Status

| Piece | State |
|-------|-------|
| `backend/` | ✅ 9 models, services, RBAC, availability time-series, verification+audit, crawler API, AI Assistant API — 43/43 tests |
| `crawler/` | ✅ SSRF-safe modular pipeline — 76 tests (71 pass, 5 skipped live-network) |
| `packages/core/` | ✅ deterministic brain (ranking/search/freshness/confidence/emergency/location/assistant), zero framework classes |
| `variants/{bootstrap,tailwind,skeleton}/` | ✅ all build; identical routes/components; strict parity (only CSS differs) |
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
| [`docs/MedReach_Corrected_Plan.md`](docs/MedReach_Corrected_Plan.md) | Research design and RWD Security Risk Score instrument |
| [`docs/RESULTS-prelim.md`](docs/RESULTS-prelim.md) | Preliminary evaluation results |
