# Backend REST API

Express + Mongoose service. All frontends reach it via `NEXT_PUBLIC_API_URL`
(default `http://localhost:4000`). Responses use consistent envelopes
(e.g. `{data}`, `{hospital}`). Errors use the shape `{error, details?}`.

## Auth roles
`user`, `hospital_admin`, `system_admin` (plus a legacy `admin` role).
Auth is via a JWT **httpOnly cookie** or a `Bearer` token. Auth endpoints are
rate limited.

## Health
- `GET /health` — `ok` status plus database connection state.

## Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me` — current user (cookie or Bearer)

## Hospitals
- `GET /api/hospitals` — search; query params:
  `q, region, city, locality, hospitalType, status, specialty, verified,
  page, limit, lat, lng`
- `GET /api/hospitals/:slug`
- `POST /api/hospitals` (admin)
- `PUT /api/hospitals/:id` (admin)
- `PATCH /api/hospitals/:id` (admin)
- `DELETE /api/hospitals/:id` (admin)
- `PATCH /api/hospitals/:id/beds` (admin)

## Facilities & availability
- `GET /api/hospitals/:id/facilities`
- `GET /api/hospitals/:id/availability` — latest per facility plus observation
  count
- `POST /api/hospitals/:id/availability` (admin) — append-only observation;
  `facility` and `status` are enum-validated

## Data sources
- `GET /api/sources`
- `POST /api/sources` (admin) — validates that the URL passes the SSRF guard
- `PATCH /api/sources/:id` (admin)

## Crawler
- `GET /api/crawler/jobs`
- `GET /api/crawler/results`
- `POST /api/crawler/run?sourceId=` (admin) — only runs an approved source

## AI Assistant
- `POST /api/assistant/message` — public, rate limited (20 req / 5 min per IP,
  separate from the auth limiter). Body: `{message, locality?, origin?}`
  (`origin` is `{lat, lng}`, only ever sourced from on-demand browser geolocation
  — never persisted). Response: `{reply, intent, hospitals, source, unavailable?}`.
  - `intent` is one of `emergency | hospital_search | general | unavailable`,
    decided deterministically (keyword-based, no ML) before any hospital lookup.
  - `hospitals` is real data assembled from `Hospital`/`HospitalFacility`/
    `AvailabilityObservation` via the same ranking used by `GET /api/hospitals`
    — never a second, parallel search implementation, and never fabricated.
  - `source` is `rule_based` (default, zero-config) or `ai` (only when
    `AI_PROVIDER=openai` and `AI_API_KEY` are configured); a failing provider
    transparently falls back to `rule_based` — the endpoint never 500s on a
    provider error, and hospital discovery keeps working with the AI off.
  - See [`docs/ai-assistant.md`](ai-assistant.md) for the full design,
    provider-swap instructions, and the data/safety guarantees.

## Admin
- `GET /api/admin/overview`
- `POST /api/admin/hospitals/:id/verify` (audited) — body
  `{decision: approve | reject | override | mark_stale}`
- `GET /api/admin/audit` — `system_admin` only

## Alerts
- `GET /api/alerts`
- `POST /api/alerts` (admin)
- `PATCH /api/alerts/:id/deactivate`

## Saved hospitals
- `GET /api/users/me/saved`
- `POST /api/users/me/saved`
- `DELETE /api/users/me/saved`
