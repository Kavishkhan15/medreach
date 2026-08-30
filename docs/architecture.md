# MedReach — Architecture Map & Gap Analysis

> Step 1–2 deliverable. Written **before** any restructuring, from a full read of the
> working repository. It records what exists, what is kept, what is refactored, what is
> missing, and what would violate the CSS-framework experiment if done carelessly.

## 0. The one invariant that governs everything

MedReach is simultaneously (a) an emergency hospital discovery platform and (b) a
controlled experiment comparing **Bootstrap 5 / Tailwind 4 / Skeleton CSS**. The
experiment is only valid if **the CSS framework and its presentation layer are the ONLY
difference between the three variants**. Everything else — backend, API, database, shared
core logic, HTML information architecture, accessibility semantics, content, business
rules, data — must be byte-for-byte equivalent.

Practical rule enforced throughout this restructure:
- Logic, data, hooks, ranking, search, validation → `packages/core` (zero framework classes).
- Only tone→class mapping and markup styling live in each `variants/*/lib/tone.js` + components.

---

## 1. Current state (audited, verified working)

**Baseline verified this session:** `npm run backend:test` → **7/7 pass**. `mongod`
present at `/usr/bin/mongod`. No git repository. Node v24, npm v11.

### Monorepo (npm workspaces)
`backend`, `packages/core`, `variants/{bootstrap,tailwind,skeleton}`. Root scripts wire
backend dev/seed/test, variant builds, and evaluation (`score`, `bundles`, `audit:deps`,
`probe:react`).

### backend/ (`@medreach/backend`) — Express 4 + Mongoose 8
- `app.js` builds app (testable, no DB/listen); `server.js` connects DB + listens.
- **config/** `env.js` (typed env w/ prod JWT guard), `db.js` (mongoose connect).
- **middleware/** `auth.js` (JWT cookie/bearer + `requireRole` RBAC), `error.js`
  (normalizes Mongoose/JWT/dup-key), `security.js` (helmet + strict CSP + CORS +
  cookie-parser + auth rate-limiter — *the experimental constant*), `validate.js`.
- **models/** `User` (bcrypt, `select:false` hash, roles `user|admin`, no medical data),
  `Hospital` (GeoJSON 2dsphere, text index, slug hook, `emergencyStatus`, beds),
  `Alert` (severity, region, expiry).
- **routes/** `auth`, `hospitals`, `alerts`, `users`. **controllers/** matching.
  **utils/** `asyncHandler`, `token` (sign/verify). **data/** `seedData.js`.
- **tests/** 7 supertest/node:test cases (health, 404, helmet headers, validation, auth,
  RBAC, token roundtrip). No DB required.

### packages/core (`@medreach/core`, ESM, `type:module`)
- `api.js` isomorphic client (`NEXT_PUBLIC_API_URL` → localhost:4000).
- `hooks.js` `useHospitals` (with **fixture fallback on API failure**), `useAuth`.
- `format.js` **semantic tones** (`statusMeta`→success/warning/danger/neutral),
  `severityMeta`, `distanceKm` (haversine), `SPECIALTIES`.
- `fixtures.js` 6 sample hospitals + `filterFixtures`. `index.js` barrel.
- **Contains zero framework classes today. This boundary is correct — preserve it.**

### variants/{bootstrap,tailwind,skeleton} — Next.js 14 App Router
- Identical route set: `/`, `/hospitals/[slug]`, `/login`, `/admin`. Each has
  `components/{Navbar,HospitalCard}`, `lib/tone.js` (tone→framework class map),
  `app/globals.css`. Bootstrap variant was recently restyled + is deployed.
- tailwind adds tailwind/postcss devdeps; skeleton adds `skeleton-css`.

### evaluation/
- `scoring/risk-score.js` RWD Security Risk Score (8 fixed-anchor dims, weights, runnable
  stub). `measure/bundles.mjs` (CSS/JS raw+gzip per variant). `security/audit.mjs`
  (`npm audit --json` summary). Empty axis dirs: accessibility/privacy/responsiveness.

### Others
`probe-react/probe.mjs` (XSS-surface probe), `docs/` (plan, results), `paper/outline.md`,
`user-study/` (protocol/consent/instruments), `.github/workflows/evaluate.yml`,
`run.sh` (backend + 3 variants). Bootstrap deployed at
`https://medreach-bootstrap.antideploy.com` (fixture mode, `NEXT_PUBLIC_API_URL` unset).

---

## 2. Retain / Refactor / Missing / Incorrect

### KEEP AS-IS (good, correct boundaries)
- Shared-security-as-constant design in `middleware/security.js` (the experiment's spine).
- Semantic-tone boundary in `core/format.js` + per-variant `lib/tone.js`.
- Fixture-fallback pattern in `useHospitals` (basis for demo/live mode).
- JWT httpOnly-cookie auth, RBAC, `asyncHandler`, error normalization.
- Evaluation instrument shape (fixed-anchor normalization is methodologically sound).

### REFACTOR (extend without breaking)
- `config/db.js` → `config/database.js`; add `config/constants.js` (enums, thresholds).
- `User.role` enum `user|admin` → `user|hospital_admin|system_admin` (+ `accountStatus`,
  `lastLogin`). Keep `admin` acceptance via mapping so existing tests/seed stay green.
- `Hospital`: split volatile availability OUT into `AvailabilityObservation`; add
  `hospitalType`, `locality`, `pincode`, `verificationStatus`, `sourceIds`, structured
  `facilities`. Keep `emergencyStatus`/beds as derived/compat fields.
- Introduce **services/** layer (search/ranking/freshness/verification/availability) so
  controllers stay thin — currently logic sits in controllers.
- Move framework-independent search/filter/rank/emergency/location logic INTO `core`.

### MISSING (must build)
- Models: `HospitalFacility`, `AvailabilityObservation`, `DataSource`, `CrawlJob`,
  `CrawlResult`, `AuditLog`.
- Routes/controllers: `facilities`, `availability`, `sources`, `crawler`, `admin`,
  `health` (as router).
- **crawler/** subsystem (scheduler→registry→fetcher→adapter→parser→normalizer→validator
  →confidence→freshness→db) with SSRF-safe fetch + robots/rate-limit/backoff.
- **freshness + confidence + provenance** engines (deterministic, documented).
- core modules: `constants.js`, `validation.js`, `ranking.js`, `emergency.js`,
  `location.js`, `search.js`, `types.js`.
- Frontend: `/map`, `/emergency`, `/admin/{hospitals,sources,crawler,verification,alerts,
  audit}`; components EmergencyHero/Search/CategorySelector, HospitalMap, FacilityStatus,
  DataFreshness, EmergencyMode, SOS, dashboards, verification queue.
- Demo/live **system-state banner** (visible fixture labeling).
- evaluation `performance/` + machine-readable `results/`.
- docs: crawler/api/data-model/security/privacy/deployment.

### INCORRECT / RISKS TO THE EXPERIMENT (guardrails)
- Do NOT give one variant a feature another lacks. Every component/route added to
  Bootstrap must be ported identically to Tailwind + Skeleton (Steps 9–10, 36, 37).
- Do NOT let Bootstrap/Tailwind/Skeleton class names leak into `packages/core`.
- Do NOT present fixture data as live (Steps 32–33). Banner required.
- Do NOT add any AI/ML/LLM/recommendation/diagnosis (Step 17). Ranking is transparent,
  rule-based, and inspectable.
- Do NOT crawl user-supplied URLs — only approved `DataSource` registry entries; block
  localhost/private ranges/non-http(s) (SSRF).
- Keep `middleware/security.js` policy identical across variants or the comparison breaks.

---

## 3. Target module ownership (who owns what)

| Concern | Home | Shared? |
|---|---|---|
| Auth, RBAC, JWT, cookies | backend/middleware+controllers | ✅ constant |
| DB models & persistence | backend/models | ✅ constant |
| Search / filter / sort / rank / freshness / confidence | backend/services **+** packages/core (pure fns) | ✅ constant |
| Crawler (fetch→normalize→validate→score) | crawler/ | ✅ constant |
| API client, hooks, formatting, validation, constants, emergency, location | packages/core | ✅ constant |
| Semantic design tokens (names) | packages/core (values only, no classes) | ✅ constant |
| tone→class mapping, markup, CSS | variants/*/lib/tone.js + components + globals.css | ❌ varies (the IV) |

---

## 4. Execution plan (maps to spec Steps 3–18)

1. **Backend + DB (Step 3):** config/constants, 6 new models, User role upgrade, services
   skeleton, new routes/controllers, keep 7 tests green + add model/service tests.
2. **Crawler (Step 4):** modular pipeline, SSRF-safe httpFetcher, base+generic adapter,
   parsers, normalizers, validator; unit tests with fixture HTML/JSON (no live network).
3. **Freshness/Confidence/Provenance (Step 5):** pure deterministic modules + tests + docs.
4. **Core upgrade (Step 6):** constants/validation/ranking/emergency/location/search/types.
5. **UX architecture + tokens (Step 7):** shared semantic token spec + component contract.
6. **Bootstrap variant (Step 8):** all components + new routes.
7. **Port to Tailwind + Skeleton (Steps 9–10):** strict behavioral parity.
8. **Dashboards + verification + audit views (Step 11).**
9. **Security/privacy/accessibility hardening (Step 12).**
10. **Evaluation + performance axis + machine-readable results (Step 13).**
11. **Tests + builds + parity verification (Steps 14–16).**
12. **No-AI/ML audit (Step 17).**
13. **Docs + README + deploy Bootstrap (Step 18).**

**Method (Step 49):** incremental, tests+build after each stage, no half-migrated state.
Verification runs against live MongoDB (available) where integration is claimed.
