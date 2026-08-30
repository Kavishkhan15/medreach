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

Requires **MongoDB** (local `mongod` or Atlas). Tests do **not** need it.

## Endpoints

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET  | `/health` | public | liveness |
| POST | `/api/auth/register` | public | create user (rate-limited) |
| POST | `/api/auth/login` | public | login → JWT httpOnly cookie (rate-limited) |
| POST | `/api/auth/logout` | public | clear cookie |
| GET  | `/api/auth/me` | user | current user + saved hospitals |
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

helmet CSP + HSTS + `no-referrer`, CORS allow-list w/ credentials, bcrypt password hashing, JWT in httpOnly cookies, RBAC (`requireRole`), auth-endpoint rate limiting, express-validator input validation, central error normalization. See `src/middleware/security.js`.

## Tests

```bash
npm test    # node --test; wiring + auth + RBAC, no DB needed
```
