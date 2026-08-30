# Security

Security controls are **shared and identical** across all frontend variants.
The middleware is the experimental constant of the RWD study: it is byte-for-byte
the same regardless of the CSS framework in use.

## Shared security middleware
`backend/src/middleware/security.js`:

- **helmet** with a strict CSP (`defaultSrc 'self'`, `scriptSrc 'self'`, etc.)
- **HSTS**
- `referrerPolicy: no-referrer`
- **CORS** allowlist with credentials enabled
- **cookie-parser**
- Auth **rate limiter** — 20 requests per 15-minute window

## Authentication & authorization
- JWT delivered as an **httpOnly cookie** (`sameSite: lax`, `secure` in prod)
  or as a `Bearer` token
- Password hashing with **bcrypt**
- **RBAC** enforced via `requireRole`
- Request body size limit: **100 kb**
- Input validation with **express-validator**
- Mongoose schema **enums** reject invalid values (defense against bad-value
  injection)

## Crawler / SSRF
- The crawler SSRF guard (see `crawler.md`) blocks unsafe targets before any
  fetch.
- Source URLs are validated against the SSRF guard **on registration**.

## Error handling & logging
- Error handler normalizes Mongoose, JWT, and duplicate-key errors **without
  leaking internals**.
- `requestId` on requests plus structured logging that **never** logs bodies,
  tokens, or passwords.

## Secrets
- Provided via env: `JWT_SECRET`, `MONGO_URI`, `CORS_ORIGINS`.
- Production **requires** `JWT_SECRET`.
- `.env.example` is provided; the real `.env` is **never committed**.

## Audit
- `AuditLog` stores an `ipHash` (SHA-256), **never** the raw IP.

## Test coverage
Tests cover:
- helmet security headers
- RBAC → `403`
- unauthenticated access → `401`
- invalid input → `400`
