# MedReach Bootstrap product guide

## Run locally

Use Node.js 20 or newer and a local MongoDB on port 27017. From the repository root, install dependencies with `npm install`, copy `backend/.env.example` to `backend/.env`, and run `./run.sh`. The Bootstrap app is at `http://localhost:3000`; the shared API is at `http://localhost:4000`. `run.sh` starts only Bootstrap and the backend for this product phase. Tailwind and Skeleton remain in the repository for the later research comparison.

To populate a safe local demo, run `npm run seed --workspace @medreach/backend`, `npm run sync:hospital-resources --workspace @medreach/backend`, then `npm run seed:product-demo --workspace @medreach/backend`. The resource sync derives listings only from persisted hospital claims; the product seed marks its additional providers and job as **demo**. It does not seed live availability or claim a hospital has accepted requests. Seed commands are additive and should be run against a development database.

## Working flows

Users can register, sign in with a password or Google, verify email, reset and change a password, link or safely unlink Google, inspect and revoke sessions, search hospitals, inspect provenance, save hospitals, submit and track emergency bed requests, receive in-app notifications, search care resources, and apply for moderated jobs. An emergency request is a coordination message, never a confirmed bed reservation. A request is marked **SENT** only when that hospital has an assigned administrator; otherwise it remains **REQUESTED** until reviewed or expired. A background worker expires unattended requests.

Hospital staff see only assigned hospitals. They can update permitted contact fields, submit source-specific facility capability statements with a supporting statement for review, submit timestamped availability observations, review requests, and manage jobs. Staff capability statements are audited and remain unverified until system-admin review; they cannot set current availability or bed counts. Prospective staff submit an ownership claim; a system administrator must manually approve it before hospital access is assigned. After approval, the user should sign in again to refresh their role token. System administrators review ownership, jobs, source claims, conflicts, crawler state, resources, analytics, audit logs, safe authentication events, and user accounts. They can enable or disable accounts, revoke sessions, trigger reset/verification email, and perform guarded role changes. Hospital administrators never receive system user/security access. Public hospital data retains source-level claims and never treats static capability as live availability.

The public resource endpoints are `/api/blood-banks`, `/api/diagnostics`, and `/api/ambulances`. Their cards show source, freshness, and demo status. A listed blood bank does not imply current inventory; an ambulance listing does not imply live dispatch. The `/map` route offers location-aware list filtering and an interactive Google Maps view with real facility markers and Google Maps navigation links; when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is unset, it displays an informative setup fallback while preserving full list search and filtering.

## Optional services

`EMAIL_ENABLED=false` is the default. Registration verification, password reset/change, Google link/security, emergency request/response, job/application, hospital ownership, and admin security events create delivery intent records without attempting SMTP. Raw verification/reset tokens are never returned by the API or stored in delivery records. SMTP failures are categorized without storing provider messages that may echo credentials and never abort the related product flow.

### Google Maps JavaScript API setup

1. In Google Cloud Console, navigate to **APIs & Services → Library**.
2. Enable **Maps JavaScript API** (only this single API is required; directions open directly via Google Maps navigation URLs without requiring billing for server-side routing APIs).
3. Under **APIs & Services → Credentials**, create an API key. Restrict it to HTTP referrers (e.g., `http://localhost:3000/*` and your production origin).
4. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `variants/bootstrap/.env.local`.
5. If the key is missing or empty, the map page gracefully displays a setup notice without crashing, keeping the resource search list fully accessible.


### Google Console setup

1. In Google Cloud Console, create or select a project. Open **APIs & Services → OAuth consent screen**, configure the app name and support email, and add test users while the app is in testing.
2. Open **Credentials → Create credentials → OAuth client ID → Web application**.
3. Add `http://localhost:3000` as an authorized JavaScript origin. Add the exact production frontend origin separately.
4. Add `http://localhost:4000/api/auth/google/callback` as an authorized redirect URI. For production add the exact deployed backend callback, such as `https://api.example.com/api/auth/google/callback`; scheme, host, port, and path must match exactly.
5. Put the values only in backend `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; set `GOOGLE_CALLBACK_URL` to that redirect and `PUBLIC_APP_URL` to the frontend. Never put the client secret in a `NEXT_PUBLIC_*` variable.

### Gmail App Password SMTP setup

1. Enable 2-Step Verification on the sending Google account. In **Google Account → Security → App passwords**, create an app password named `MedReach SMTP` (a Workspace administrator may need to permit app passwords).
2. Set `EMAIL_ENABLED=true`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER` to the full Gmail address, `SMTP_PASSWORD` to the 16-character app password with spaces removed, `SMTP_FROM` to the same authorized address, and `SMTP_FROM_NAME=MedReach`. Port 465 instead requires `SMTP_SECURE=true`.
3. Keep `SMTP_CONNECTION_TIMEOUT_MS=8000` or tune it for the deployment, restart the backend, and verify a delivery changes from `pending` to `sent` in the system-admin view. Never use the normal Google account password.

`ROUTING_PROVIDER=none` returns an unknown travel time. A configured OSRM-compatible routing endpoint can provide route distance and duration through `/api/routing/hospital/:id`; when unavailable, the UI shows straight-line distance only and says travel time is unavailable. No travel-time estimate is invented.

`CRAWLER_SCHEDULER_ENABLED=true` starts a worker with a three-minute due-source check (`CRAWLER_SCHEDULER_TICK_MS=180000`). Each registered source keeps its own interval; blocked sources are skipped. Admin pause/resume and manual crawl controls remain available. The scheduler requires a running backend and MongoDB. It does not bypass source access controls.

`GEMINI_ENABLED=false` leaves the optional evidence refinement disabled. With a key configured, refinement considers only exact stored source excerpts and validates suggestions against a fixed facility schema. Suggestions enter a separate admin review queue; they do **not** automatically modify a hospital's canonical record. Deterministic extraction continues when Gemini is unavailable. This is distinct from the legacy optional AI assistant.

## Validation and honest boundaries

The product workflow has MongoDB integration tests in `backend/test/product.mongo.test.js` and `backend/test/authSecurity.mongo.test.js`; set `MEDREACH_PRODUCT_TEST_MONGO_URI` / `MEDREACH_AUTH_TEST_MONGO_URI` to isolated test database names to run them. Google and SMTP are mocked, so no live credentials are needed. The regular backend suite and crawler suite run without network access. Ten crawler live-network cases are intentionally skipped by default.

Current limitations: no real hospital bed reservation or dispatch integration, no current blood inventory feed, no live SMTP or routing provider configured by default, no street-map tiles, no automatic proof of hospital ownership, and no automatic promotion of Gemini suggestions. Only Bootstrap is actively developed for this phase; Tailwind/Skeleton parity is future research work. Historical source records may lack a verbatim excerpt, and unsupported availability remains unknown.
