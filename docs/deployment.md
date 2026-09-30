# Deployment

MedReach deploys as **four independent pieces**:

1. **Frontend variants** (Next.js — Bootstrap 5 / Tailwind 4 / Skeleton CSS)
2. **Backend API** (Express + Mongoose)
3. **MongoDB**
4. **Crawler worker** — must **not** run inside the frontend server

## Environment

### Frontend
- `NEXT_PUBLIC_API_URL` — set to the public HTTPS backend origin **before each production build**. Next.js embeds this value in browser bundles. If omitted, clients target `http://localhost:4000`, which works only for local development.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — Google Maps JavaScript API key (optional; `/map` displays a setup fallback if unset). In Google Cloud Console, enable only the **Maps JavaScript API** and restrict key to your app's domain.
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` — (optional) Map ID for custom cloud map styling; defaults to `DEMO_MAP_ID`.

### Backend
- `MONGO_URI` or `MONGODB_URI` — the backend does not read `DATABASE_URL`.
- `JWT_SECRET` — **required in production**
- `ACCESS_TOKEN_EXPIRES` (recommended `15m`; `JWT_EXPIRES` is a compatibility alias)
- `REFRESH_TOKEN_EXPIRES_DAYS`
- `PUBLIC_APP_URL` — HTTPS origin for password-reset and email-verification links.
- `EMAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
  `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_FROM_NAME`, `SMTP_CONNECTION_TIMEOUT_MS`,
  `COOKIE_SAME_SITE` (`none` for a cross-site HTTPS frontend/API, otherwise `lax`)
- `CORS_ORIGINS` — comma-separated, exact frontend origins, including every variant using the shared API. Cookie-authenticated browser requests reject an origin outside this list.
- `PORT`
- `NODE_ENV=production`

Use Node.js **22.19.0 or newer** for the root, backend, and each frontend. CI tests Node.js 24. Set `COOKIE_SAME_SITE=none` for frontend and API on different HTTPS sites; cookies are then `Secure` and `httpOnly`. Same-site HTTPS deployments may use `lax`.

Before rolling out password-only sign-in, confirm transactional email delivery. Existing accounts without a stored password can use **Forgot password** to establish one; the reset flow preserves the account and revokes its old sessions. Remove retired sign-in credentials from the hosting environment.

The backend's `railway.json` assumes the service root directory is `backend/`, where `npm start` runs `node src/server.js`. Set the health check to `/health/ready`. Tailwind and Skeleton require the monorepo workspace build context for `@medreach/core`; Bootstrap bundles a local `_core` copy for its standalone tar deployment. Run the database migrations listed below before accepting traffic.

No secrets are committed. Copy `.env` from `.env.example`.

## Local development
```bash
npm install                 # root; installs all workspaces
npm run backend:seed        # demo data (needs a running mongod)
npm --workspace @medreach/backend run migrate:auth-security # once per existing database
npm --workspace @medreach/backend run migrate:reliability-indexes # deploy unique retry/idempotency indexes
npm run backend:dev         # API on :4000

# per-variant dev servers
npm --workspace @medreach/variant-bootstrap run dev   # :3000
npm --workspace @medreach/variant-tailwind  run dev   # :3001
npm --workspace @medreach/variant-skeleton  run dev   # :3002

# or start everything
./run.sh
```

## Build & test
```bash
npm ci                      # deterministic install from package-lock.json
npx playwright install --with-deps chromium
npm run release:check       # backend/crawler, dependency audit, 3 builds, browser journeys, backup restore, diff check
```

Set `MEDREACH_E2E_MONGO_URI`, `MEDREACH_BACKUP_SOURCE_URI`, and `MEDREACH_RESTORE_VERIFY_URI` before invoking the release check. The command stops immediately with the missing variable names instead of omitting browser or recovery verification.

`release:check` expects MongoDB on `127.0.0.1:27017` by default and uses only these disposable databases:

- `medreach_auth_test`
- `medreach_product_integration`
- `medreach_fusion_integration`
- `medreach_test`

Override the hosts with `MEDREACH_BASE_TEST_MONGO_URI`, `MEDREACH_AUTH_TEST_MONGO_URI`, `MEDREACH_PRODUCT_TEST_MONGO_URI`, and `MEDREACH_TEST_MONGO_URI`. The database names must remain exact because the tests drop their databases. The runner also overrides `MONGO_URI` and `MONGODB_URI` so a developer's configured database cannot be used by accident. It fails when a database-gated test is skipped.

The deterministic crawler gate excludes `crawler/tests/live.test.js` and prints that exclusion in its result. Run `npm run crawler:test:live` separately when live checks are authorized. That suite reports each source's `success`, `partial`, `failed`, or `blocked` status; a passing test means the crawler classified the outcome safely, not that every source supplied data. It honors robots, rate limits, and source allowlists. External availability is not a deterministic release gate. The release check does require local Playwright journeys for all three variants.

## Health checks

- `/health/live` checks that the API process can respond.
- `/health/ready` returns `200` only when Mongoose is connected and returns `503` otherwise. Use this endpoint for deployment readiness and traffic routing.
- `/health` remains a compatibility liveness endpoint and includes the current database state.
- After deployment, verify `/health/ready` on the **public backend URL**, plus `/track` and one backend-backed directory page on each public frontend URL. Local health or build success does not prove hosted readiness.

## MongoDB backup and restore drill

Install MongoDB Database Tools so `mongodump` and `mongorestore` are on `PATH`. Use a read-capable source credential and a separate disposable restore database. The restore target name must contain `restore_verify`; the command refuses to run if the source and target names match.

```bash
export MEDREACH_BACKUP_SOURCE_URI='mongodb://127.0.0.1:27017/medreach'
export MEDREACH_RESTORE_VERIFY_URI='mongodb://127.0.0.1:27017/medreach_restore_verify'
npm run verify:mongo-backup
```

The drill creates a compressed archive in a temporary directory, drops the explicitly guarded `restore_verify` database, restores the archive, and compares every collection's document count and index definitions. Resetting the whole verification database prevents removed source collections from surviving between drills. It fails if the source changes during the operation or has no collections. The temporary archive is deleted after success or failure. The restored verification database remains available for inspection and should be dropped after review.

Before production launch, define backup frequency, retention, encryption, access controls, and recovery objectives for the chosen MongoDB service. Run the restore drill against the same backup mechanism and credentials used in production without targeting the production database.

## Evaluation
```bash
npm run eval:performance
npm run eval:results        # machine-readable JSON in evaluation/results/
```

## Antideploy (Bootstrap variant)
The Bootstrap variant is deployed via **tar upload**:

- It bundles `@medreach/core` into `variants/bootstrap/_core` using a webpack
  alias in `next.config.mjs`, because the workspace dependency is not resolvable
  off-monorepo.
- Its `package.json` **omits** the `@medreach/core` dependency for this reason.
- Documented host: **https://medreach-bootstrap.antideploy.com**. Treat its current contents as a separate deployment to verify; local builds do not update it.
- Set `NEXT_PUBLIC_API_URL` to the deployed backend URL before building the tar. If it is unset, the client targets `http://localhost:4000`; API failures are shown to the user and are not replaced with fixture provider data.

See [release QA](release-qa.md) for the separate local, live-integration, and hosted-deployment evidence gates.
