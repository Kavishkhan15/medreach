# Vercel + Railway + MongoDB Atlas

```text
Bootstrap / Tailwind / Skeleton on Vercel
                  ↓ HTTPS API requests and cookie sessions
       Persistent Express API on Railway
                  ↓
     Existing healthcare dataset in MongoDB Atlas
```

The backend runs `backend/src/server.js`. It keeps the existing request-expiry
worker, email delivery, authentication, tracking, Careers and discovery APIs.
All frontend variants stay independent and share that API. Crawler execution
remains removed; provider records and historical provenance remain stored.

## 1. Create Atlas and preserve the dataset

Create an Atlas cluster and database user. Include the intended application
database name in its SRV connection URI. Configure Atlas network access for the
migration machine and Railway's outbound traffic. Railway offers static outbound
IPs on its Pro plan; allowlist the assigned addresses if using that feature.
Without stable egress, review the Atlas network policy needed for your Railway
plan before launching. Keep credentials in private environment variables.

The existing dataset was copied from local MongoDB to Atlas on October 7, 2026.
All 30 collections and 2,711 documents matched by count, BSON content and index
definitions at migration. The local source and private backup were preserved.
Do not rerun migration against the populated Atlas database. For a future move
to an empty database, copy the dataset rather than seeding a replacement:

1. Install MongoDB Database Tools (`mongodump` and `mongorestore`).
2. Stop application writes and the old API's expiry worker during migration.
   Keep the MongoDB server running. Do not reset or reseed it.
3. Privately set `MEDREACH_MIGRATION_SOURCE_URI` to the existing database URI and
   `MEDREACH_MIGRATION_TARGET_URI` to an Atlas URI with an empty database.
4. Run `npm run migrate:atlas` from the repository root.
5. Review the successful verification before configuring Railway's database URI.

The script refuses a nonempty destination, retains a private gzip archive in
ignored `.migration-backups/`, and restores all application collections and
indexes without `--drop`. It compares document counts, BSON hashes and index
definitions. The source is not modified and no environment is switched
automatically. Existing provider, job, claim, observation, user, request and
historical crawl collections are all retained, including unused collections.
If verification fails or TTL records expire during copying, investigate before
cutover; retain the source and backup. The archive contains the entire database
and must be kept private.

## 2. Configure Railway

Create one backend service from this repository. Railway's monorepo import may
suggest other services; only the backend belongs on Railway in this architecture.
The production project currently contains one service, `medreach`. Do not create
services for `@medreach/core` or the frontend workspaces: core is a library and
the frontends deploy independently on Vercel.

Configure new services through the dashboard. Railway currently deprecates
`railway.json` configuration and documents compatibility for legacy services
until December 1, 2026. `backend/railway.json` remains a legacy reference; do not
depend on it being applied to a new service.

| Setting | Value |
| --- | --- |
| Root directory | `/` (repository root, preserving workspace lockfile) |
| Builder | Railpack |
| Node version variable | `RAILPACK_NODE_VERSION=24` |
| Start command | `node backend/src/server.js` |
| Custom build command | Empty; Express needs no compilation |
| Health check | `/health/ready` |
| Replicas | `1` |
| Sleep/serverless | Disabled |
| Shutdown grace | 35 seconds |

The backend needs no compilation. Railpack installs npm workspace dependencies;
the configured start command runs only Express. For a smaller dependency install,
set `RAILPACK_NODE_NPM_INSTALL=npm ci --workspace @medreach/backend --omit=dev`.
Do not add a seed command or run the Atlas migration as a recurring deploy hook.
Generate a Railway public HTTPS domain after the service is ready.

Set these Railway variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Verified Atlas application database URI |
| `JWT_SECRET` | Existing secret; preserve it to retain sessions and encrypted email retry envelopes |
| `PUBLIC_APP_URL` | `https://medreach-three.vercel.app` |
| `CORS_ORIGINS` | `https://medreach-three.vercel.app`; add exact Tailwind/Skeleton origins when deployed |
| `COOKIE_SAME_SITE` | `none` for separate Vercel/Railway sites |
| `TRUST_PROXY` | `1` only when every request follows one trusted ingress hop; verify the actual proxy boundary |
| `EMAIL_ENABLED` | `true` with working existing SMTP settings |

Railway supplies `PORT`; the API listens on that port at `0.0.0.0`.
Keep the existing `SMTP_*` variables, routing settings, and optional assistant
settings. Readiness checks MongoDB, not SMTP or Maps. Verify Railway SMTP egress
and actual mailbox receipt before treating email delivery as working.
Railway currently permits SMTP only on Pro and above. The current Trial plan
requires an HTTPS email provider, which has not been implemented. Keep email
delivery classified as pending; API readiness does not verify email-dependent
flows. Disabling email records delivery intent without sending mail.

The request-expiry worker runs every minute in this process. Keep sleep disabled
so it runs between web requests. Existing email retry/admin flows stay available;
there is no external maintenance cron or newly added automatic retry pipeline.
Rate limits use process memory, so keep one replica. Limits reset after restarts,
and overlapping deployments briefly have separate budgets. Scaling needs a
shared rate-limit store and worker coordination as a separate change.

Shutdown stops HTTP intake, drains requests and the expiry worker, then closes
MongoDB within a 30-second application deadline. The host's 35-second grace
period gives this cleanup time to finish. Forced exits can interrupt secondary
email/audit delivery; inspect stored delivery records after a restart.

## 3. Create and connect Vercel

Bootstrap is deployed at `https://medreach-three.vercel.app`, with the API at
`https://medreach-production.up.railway.app`. For a new Vercel project, import
`kasim672/medreach`, selecting Next.js and root `variants/bootstrap`.
Use Node.js 24, build command `npm run build`, and automatic install/output
settings. Enable source files outside the root directory for the workspace.
Record the newly assigned HTTPS production origin for Railway's `PUBLIC_APP_URL`
and `CORS_ORIGINS`. Set the frontend build environment:

- `NEXT_PUBLIC_API_URL`: Railway's public HTTPS API origin, without `/api`.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: existing Maps JavaScript API key with
  referrer restrictions covering the frontend origins.
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`: retain the existing value if configured.

Vercel's Config variable type is appropriate for the `NEXT_PUBLIC_*` values,
which are embedded in browser bundles. Restrict the Maps key by website origin
and API in Google Cloud; storing it as a Secret does not make browser use private.

Next.js embeds `NEXT_PUBLIC_API_URL` at build time. Changing it requires a new
build; leaving it unset makes the deployed browser call `http://localhost:4000`.
The frontend can be deployed first, but data and authentication will remain
unavailable until Railway and Atlas are ready and this variable is configured.
The browser calls Railway directly, including resume uploads through the existing
application JSON flow. No Vercel backend function or API proxy is required.
The existing 4 MiB frontend resume allowance remains supported by Express's
6 MB JSON limit; resume data remains in application records.

For Tailwind and Skeleton, create separate Vercel projects with roots
`variants/tailwind` and `variants/skeleton`, the Next.js preset, workspace files
outside the root enabled, and the same public API URL. Bootstrap's project root
is `variants/bootstrap`. Use Node.js 24 for the builds.

Cross-site cookies require HTTPS and `SameSite=None; Secure`. Some browsers block
third-party cookies even with these flags. A shared custom domain for frontend
and API is the more reliable long-term deployment; test the actual target browsers
before launch. Do not place database or SMTP credentials in `NEXT_PUBLIC_*` values.

## 4. Verify and launch

GitHub Actions currently defines nine checks. Deployment integrations add their
own statuses. Failed or cancelled statuses from deleted Railway services remain
on earlier commits; they are historical results, not additional test failures.
Keep deployment sources limited to the intended services and verify both Actions
and active host deployments on new commits. Do not rewrite history or fabricate
successful statuses to hide earlier failures.

Before switching traffic, verify:

- Railway `/health/ready` responds 200 and logs show the intended Atlas database.
- Existing provider counts and content match the source after migration.
- Frontend API requests target Railway rather than localhost.
- Hospital/provider search, directory filters and Maps use stored data.
- Sign-in, refresh, logout, recovery and verified email links work over HTTPS.
- Requests, tracking, blood, ambulance and Careers work in all deployed variants.
- File resumes remain usable and restricted to authorized application viewers.
- Expired requests transition without requiring a visitor and SMTP receipt works.
- Graceful shutdown and redeployment preserve primary records.

Use only disposable fixture accounts/databases for mutating browser QA. Local
tests do not establish Atlas availability, hosted cookie behavior, Maps key
restrictions or real SMTP delivery. See [release QA](release-qa.md).

## References

- [Railway monorepo configuration](https://docs.railway.com/deployments/monorepo)
- [Railway configuration schema](https://docs.railway.com/config-as-code/reference)
- [Railpack Node configuration](https://railpack.com/languages/node/)
- [Railway static outbound IPs](https://docs.railway.com/networking/static-outbound-ips)
- [Railway outbound SMTP networking](https://docs.railway.com/networking/outbound-networking)
- [Atlas dump/restore migration](https://www.mongodb.com/docs/atlas/import/mongorestore/)
