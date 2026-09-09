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
- AI Assistant **rate limiter** (`routes/assistantRoutes.js`) — 20 requests per
  5-minute window per IP, separate instance from the auth limiter, so a chat
  session can't be starved by unrelated login traffic (or vice versa)

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

## AI Assistant
- `POST /api/assistant/message` is **public** (same trust tier as hospital
  search) but rate-limited on its own instance (20 req / 5 min per IP).
- Input handling (`backend/src/utils/sanitize.js` + `express-validator` in
  `routes/assistantRoutes.js`): messages are trimmed, control characters are
  stripped, length is hard-capped at 500 characters — enforced both at the
  route (`body("message").isLength(...)`) and again inside the sanitizer as
  defense in depth.
- **No secrets ever reach the frontend.** `AI_API_KEY` is read only inside
  `backend/src/services/aiProviders/openAiProvider.js`, a server-side-only
  module never bundled into any client. The provider is selected by
  `AI_PROVIDER` at request time; the UI and API contract never change when the
  provider changes.
- The controller (`assistantController.js`) never echoes provider config,
  system prompts, or raw internal errors back to the client — any unexpected
  failure resolves to a generic `"AI assistant is temporarily unavailable."`
  response instead of a stack trace or a 500.
- The assistant never invents hospital data: all hospital/facility/observation
  fields sent to a provider (and shown to the user) come from existing
  Mongoose models; `status: "unknown"` and `null` quantities are passed through
  verbatim, never inferred or guessed.

## Error handling & logging
- Error handler normalizes Mongoose, JWT, and duplicate-key errors **without
  leaking internals**.
- `requestId` on requests plus structured logging that **never** logs bodies,
  tokens, or passwords.

## Secrets
- Provided via env: `JWT_SECRET`, `MONGO_URI`, `CORS_ORIGINS`.
- Production **requires** `JWT_SECRET`.
- AI provider secrets are **optional**: `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`.
  Unset, the assistant runs on the deterministic `rule_based` provider with no
  external service at all — there is no default that silently requires a key.
- `.env.example` is provided; the real `.env` is **never committed**.

## Audit
- `AuditLog` stores an `ipHash` (SHA-256), **never** the raw IP.

## Test coverage
Tests cover:
- helmet security headers
- RBAC → `403`
- unauthenticated access → `401`
- invalid input → `400`
- AI assistant: intent classification, input sanitization, validation
  (`400` on empty/oversized message, invalid coordinates), public access
  (no `401`), and rate limiting (`429` after the ceiling) — see
  `backend/test/assistant.test.js`
