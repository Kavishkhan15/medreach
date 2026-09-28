# MedReach Backend

Shared Express + MongoDB API. **Identical for all three CSS-framework variants** — this is the experimental constant (plan §4, §6). No per-variant logic belongs here.

## Setup

```bash
cd backend
npm install
cp .env.example .env         # set MONGO_URI + JWT_SECRET
npm run seed                 # needs a running MongoDB
npm run dev                  # http://localhost:4000
```

Requires **MongoDB** (local `mongod` or Atlas). Most API tests exercise MongoDB and the release gate also enables the opt-in auth, product, and provenance integration suites.

## Endpoints

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET  | `/health` or `/health/live` | public | process liveness |
| GET  | `/health/ready` | public | readiness; returns 503 until MongoDB is connected |
| POST | `/api/auth/register` | public | create user (rate-limited) |
| POST | `/api/auth/login` | public | password login → short access + rotating refresh cookies |
| POST | `/api/auth/refresh` | refresh cookie | rotate refresh session and renew access |
| POST | `/api/auth/logout` | public | revoke refresh family and clear cookies |
| GET | `/api/auth/google` | public / user for link | begin Google OIDC login or confirmed profile link |
| GET | `/api/auth/google/callback` | one-use state | validate Google identity and finish login/link |
| GET  | `/api/auth/me` | user | current user + saved hospitals |
| GET/DELETE | `/api/auth/sessions[/:id]` | user | safe session metadata / revoke session |
| GET  | `/api/hospitals` | public | search/filter/paginate (`q, region, city, status, specialty, lat, lng, page, limit`) |
| GET  | `/api/hospitals/:slug` | public | hospital detail |
| POST | `/api/hospitals` | admin | create |
| PUT  | `/api/hospitals/:id` | admin | update |
| PATCH| `/api/hospitals/:id/beds` | admin | bed/emergency status |
| DELETE | `/api/hospitals/:id` | admin | delete |
| GET  | `/api/alerts` | public | active alerts (`?region=`) |
| POST | `/api/alerts` | admin | broadcast |
| PATCH| `/api/alerts/:id/deactivate` | admin | deactivate |
| GET  | `/api/users/me/saved` | user | Quick Access list |
| POST | `/api/users/me/saved/:hospitalId` | user | save |
| DELETE | `/api/users/me/saved/:hospitalId` | user | unsave |

Seed logins: `admin@medreach.test / Admin1234`, `user@medreach.test / User1234`.

## Security posture (held constant across variants)

helmet CSP + HSTS + `no-referrer`, CORS/origin allow-list, bcrypt cost 12, 15-minute access JWTs, opaque hashed rotating refresh sessions, account-version invalidation, one-use hashed recovery/OAuth state, Google OIDC signature/issuer/audience/expiry/nonce checks, httpOnly cookies, RBAC (`requireRole`), purpose-specific rate limits, input validation, and generic errors. See `src/middleware/security.js` and `docs/security.md`.

## Tests

```bash
# From the repository root; uses isolated local test databases by default.
npm run backend:test:db
```

The strict runner fails if any database-gated test is skipped. Override its four MongoDB URIs only with databases named `medreach_test`, `medreach_auth_test`, `medreach_product_integration`, and `medreach_fusion_integration`; every suite may drop its database.
