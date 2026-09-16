# MedReach Bootstrap product guide

## Run locally

Use Node.js 20 or newer and a local MongoDB on port 27017. From the repository root, install dependencies with `npm install`, copy `backend/.env.example` to `backend/.env`, and run `./run.sh`. The Bootstrap app is at `http://localhost:3000`; the shared API is at `http://localhost:4000`. `run.sh` starts only Bootstrap and the backend for this product phase. Tailwind and Skeleton remain in the repository for the later research comparison.

To populate a safe local demo, run `npm run seed --workspace @medreach/backend`, `npm run sync:hospital-resources --workspace @medreach/backend`, then `npm run seed:product-demo --workspace @medreach/backend`. The resource sync derives listings only from persisted hospital claims; the product seed marks its additional providers and job as **demo**. It does not seed live availability or claim a hospital has accepted requests. Seed commands are additive and should be run against a development database.

## Working flows

Users can register, sign in, verify email, reset and change a password, search hospitals, inspect provenance, save hospitals, submit and track emergency bed requests, receive in-app notifications, search care resources, and apply for moderated jobs. An emergency request is a coordination message, never a confirmed bed reservation. A request is marked **SENT** only when that hospital has an assigned administrator; otherwise it remains **REQUESTED** until reviewed or expired. A background worker expires unattended requests.

Hospital staff see only assigned hospitals. They can update permitted contact fields, submit source-specific facility capability statements with a supporting statement for review, submit timestamped availability observations, review requests, and manage jobs. Staff capability statements are audited and remain unverified until system-admin review; they cannot set current availability or bed counts. Prospective staff submit an ownership claim; a system administrator must manually approve it before hospital access is assigned. After approval, the user should sign in again to refresh their role token. System administrators review ownership, jobs, source claims, conflicts, crawler state, resources, analytics, and audit logs. Public hospital data retains source-level claims and never treats static capability as live availability.

The public resource endpoints are `/api/blood-banks`, `/api/diagnostics`, and `/api/ambulances`. Their cards show source, freshness, and demo status. A listed blood bank does not imply current inventory; an ambulance listing does not imply live dispatch. The `/map` route offers location-aware list filtering and a schematic position view; it is not a street-map or dispatch interface.

## Optional services

`EMAIL_ENABLED=false` is the default. Email events create delivery records without attempting SMTP. Development registration and password-reset responses expose a local one-use link for testing. To enable SMTP, set `EMAIL_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and optionally `SMTP_FROM_NAME`, then restart the backend. Credentials are never stored in source. No real delivery has been validated without provider credentials.

`ROUTING_PROVIDER=none` returns an unknown travel time. A configured OSRM-compatible routing endpoint can provide route distance and duration through `/api/routing/hospital/:id`; when unavailable, the UI shows straight-line distance only and says travel time is unavailable. No travel-time estimate is invented.

`CRAWLER_SCHEDULER_ENABLED=true` starts a worker with a three-minute due-source check (`CRAWLER_SCHEDULER_TICK_MS=180000`). Each registered source keeps its own interval; blocked sources are skipped. Admin pause/resume and manual crawl controls remain available. The scheduler requires a running backend and MongoDB. It does not bypass source access controls.

`GEMINI_ENABLED=false` leaves the optional evidence refinement disabled. With a key configured, refinement considers only exact stored source excerpts and validates suggestions against a fixed facility schema. Suggestions enter a separate admin review queue; they do **not** automatically modify a hospital's canonical record. Deterministic extraction continues when Gemini is unavailable. This is distinct from the legacy optional AI assistant.

## Validation and honest boundaries

The product workflow has a MongoDB integration test in `backend/test/product.mongo.test.js`; set `MEDREACH_PRODUCT_TEST_MONGO_URI` to an isolated test database to run it. The regular backend suite and crawler suite run without network access. Ten crawler live-network cases are intentionally skipped by default.

Current limitations: no real hospital bed reservation or dispatch integration, no current blood inventory feed, no live SMTP or routing provider configured by default, no street-map tiles, no automatic proof of hospital ownership, and no automatic promotion of Gemini suggestions. Only Bootstrap is actively developed for this phase; Tailwind/Skeleton parity is future research work. Historical source records may lack a verbatim excerpt, and unsupported availability remains unknown.
