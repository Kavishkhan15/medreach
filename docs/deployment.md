# Deployment

MedReach deploys as **four independent pieces**:

1. **Frontend variants** (Next.js — Bootstrap 5 / Tailwind 4 / Skeleton CSS)
2. **Backend API** (Express + Mongoose)
3. **MongoDB**
4. **Crawler worker** — must **not** run inside the frontend server

## Environment

### Frontend
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — Google Maps JavaScript API key (optional; `/map` displays a setup fallback if unset). In Google Cloud Console, enable only the **Maps JavaScript API** and restrict key to your app's domain.
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` — (optional) Map ID for custom cloud map styling; defaults to `DEMO_MAP_ID`.

### Backend
- `MONGO_URI` / `DATABASE_URL`
- `JWT_SECRET` — **required in production**
- `ACCESS_TOKEN_EXPIRES` (recommended `15m`; `JWT_EXPIRES` is a compatibility alias)
- `REFRESH_TOKEN_EXPIRES_DAYS`
- `OAUTH_STATE_EXPIRES_MINUTES`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `PUBLIC_APP_URL`
- `EMAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
  `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_FROM_NAME`, `SMTP_CONNECTION_TIMEOUT_MS`,
  `COOKIE_SAME_SITE` (`none` for a cross-site HTTPS frontend/API, otherwise `lax`)
- `CORS_ORIGINS`
- `PORT`
- `NODE_ENV`

No secrets are committed. Copy `.env` from `.env.example`.

## Local development
```bash
npm install                 # root; installs all workspaces
npm run backend:seed        # demo data (needs a running mongod)
npm --workspace @medreach/backend run migrate:auth-security # once per existing database
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
npm run build:variants      # build all frontend variants
npm test                    # backend + crawler tests
```

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
- Live at **https://medreach-bootstrap.antideploy.com**.
- It currently runs on **DEMO fixtures** because `NEXT_PUBLIC_API_URL` is unset.

### Switching demo ↔ live
- **Demo mode:** leave `NEXT_PUBLIC_API_URL` unset — the app serves DEMO fixture
  data (labeled by the `SystemBanner`).
- **Live mode:** set `NEXT_PUBLIC_API_URL` to a deployed backend URL, then
  rebuild/redeploy the variant.
