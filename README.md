# MedReach

**A research-grade emergency hospital discovery platform for Mumbai — and a controlled testbed for empirically comparing three CSS frameworks.**

MedReach helps a person answer, with minimum friction: *I need emergency care → where am I? → what kind of emergency? → here are the most relevant hospitals → here's what is known about their current capability → CALL or NAVIGATE.*

It is deliberately **deterministic and transparent**: rule-based ranking with inspectable reasons, honest data freshness and confidence, verified sources with provenance. There is **no AI/ML, no LLM, no diagnosis, no prediction** anywhere in the system — and it never implies it is an official emergency service.

It is also an empirical extension of **Almeida & Sousa (2026)**, *"Security Risks in Responsive Web Design Frameworks,"* *Digital* **6**(1), 26. DOI: [10.3390/digital6010026](https://doi.org/10.3390/digital6010026).

> **Read first:** [`docs/architecture.md`](docs/architecture.md) (system map), then [`docs/MedReach_Corrected_Plan.md`](docs/MedReach_Corrected_Plan.md) (research design + RWD Security Risk Score instrument).

## Core research constraint

The backend, database, API, authentication, shared business logic, HTML information architecture, accessibility semantics, and security headers/CSP are **shared and identical** across all three frontend variants. **The CSS framework is the only deliberately-varied factor.** This is what lets us attribute any measured difference to the framework.

## Architecture

```
        USER APP · ADMIN · CRAWLER   (three consumers)
                     │
               SHARED API  (Express + Mongoose, RBAC, security = experimental constant)
                     │
             BUSINESS SERVICES  (search · ranking · freshness · confidence · verification)
                     │
   ┌─────────────────┼──────────────────┐
 MongoDB        DataSources (crawler)   Routing/ETA (abstraction)
                     │
        Freshness + Confidence + Provenance
                     │
          Deterministic, rule-based ranking (NO AI/ML)
                     │
   ┌────────────┬────────────┬────────────┐
 Bootstrap    Tailwind     Skeleton     (only CSS differs)
```

## Layout

```
medreach/
├── docs/            architecture, crawler, api, data-model, security, privacy, deployment, plan
├── backend/         Express + MongoDB API — config, models(9), middleware, routes, controllers, services, tests
├── crawler/         SSRF-safe modular crawler — ssrf, fetchers, adapters, parsers, normalization, validation, runner, scheduler, tests
├── packages/core/   framework-agnostic brain: api client, hooks, constants, emergency, ranking, search, location, freshness, confidence, validation, fixtures (ZERO framework classes)
├── variants/
│   ├── bootstrap/   Next.js + Bootstrap 5   (reference; deployed)
│   ├── tailwind/    Next.js + Tailwind CSS 4
│   └── skeleton/    Next.js + Skeleton CSS
├── evaluation/      4-axis pipeline + performance axis + machine-readable results/ + RWD Security Risk Score
├── probe-react/     reactive-component XSS-surface probe
├── user-study/      IRB protocol, consent, SUS + NASA-TLX
└── .github/workflows/  CI: build + evaluation
```

Each variant has the **same routes** (`/`, `/hospitals`, `/hospitals/[slug]`, `/emergency`, `/map`, `/login`, `/admin` + 6 admin sub-routes) and the **same components** (SystemBanner, Navbar, SOS, StatusPill, DataFreshness, FacilityStatus, EmergencyCategorySelector, HospitalCard, HospitalList, AdminNav, AdminGuard). Only CSS differs.

## Run it

```bash
npm install                        # from repo root (installs all workspaces)

# Backend (needs MongoDB, e.g. mongod --dbpath /tmp/medreach-mongo --fork --logpath /tmp/medreach-mongo/m.log)
cp backend/.env.example backend/.env   # then edit; never commit the real .env
npm run backend:seed               # demo data: admin@medreach.test / Admin1234
npm run backend:dev                # API on :4000

# Crawler (runs standalone, never inside the frontend)
npm run crawler:test               # 12 tests, no live network

# Tests
npm test                           # backend (30) + crawler (12)

# Variants (each reads NEXT_PUBLIC_API_URL, default http://localhost:4000)
npm --workspace @medreach/variant-bootstrap run dev   # :3000
npm --workspace @medreach/variant-tailwind  run dev   # :3001
npm --workspace @medreach/variant-skeleton  run dev   # :3002
# ...or launch backend + all three variants together:
./run.sh

# Evaluation (machine-readable JSON → evaluation/results/)
npm run build:variants
npm run eval:performance           # CSS/JS bundle sizes per variant
npm run eval:results               # combined security + performance summary.json
npm run score                      # RWD Security Risk Score
```

## Demo vs live data

The app works **without a backend**: `useSystemStatus` probes `/health`; if unreachable it falls back to clearly-labelled **DEMO** fixtures and shows a prominent banner. It never presents demo data as live. To go live, set `NEXT_PUBLIC_API_URL` to a deployed backend. See [`docs/deployment.md`](docs/deployment.md).

## Deployment

Four independently-deployable pieces: frontend variants, backend API, MongoDB, crawler worker. The Bootstrap variant is live at **https://medreach-bootstrap.antideploy.com** (currently DEMO mode — `NEXT_PUBLIC_API_URL` unset). Secrets are provided via env only; `.env` is git-ignored. See [`docs/deployment.md`](docs/deployment.md), [`docs/security.md`](docs/security.md), [`docs/privacy.md`](docs/privacy.md).

## Status

| Piece | State |
|-------|-------|
| `backend/` | ✅ 9 models, services, RBAC, availability time-series, verification+audit, crawler API — 30/30 tests, live CRUD verified |
| `crawler/` | ✅ SSRF-safe modular pipeline — 12/12 tests |
| `packages/core/` | ✅ deterministic brain (ranking/search/freshness/confidence/emergency/location), zero framework classes |
| `variants/{bootstrap,tailwind,skeleton}/` | ✅ all build; 14 routes each; strict parity (only CSS differs) |
| `evaluation/` | ✅ security + performance axes → machine-readable `results/` |
| AI/ML | 🚫 none — deterministic rules only, by design |
```
