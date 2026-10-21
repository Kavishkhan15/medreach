# Deployment

[Documentation](README.md) · [Project overview](../README.md)

Selected stack: Vercel frontends → Railway Express API → MongoDB Atlas.
This guide describes manual deployment; it does not claim a deployment was
performed or verified.

## Before deployment

1. Back up and verify the intended dataset. Record database and collection counts.
2. Confirm roles, provider assignments and the last active System Admin.
   Do not apply account migrations without reviewing their dry-run inventory.
3. Run [local verification](release-qa.md) against disposable databases.
4. Review required indexes/migrations against the actual target. Do not run
   seed scripts or copy an empty database over existing data.
5. Keep secrets outside Git and screenshots. Do not publish database files.

The local recovered database uses `/home/anonymous/medreach/data`.
Its startup/recovery instructions are in [local MongoDB](../LOCAL_MONGODB_SETUP.md).
Do not point cloud services at this local path.

## Vercel: each frontend

- Import the repository and choose `variants/bootstrap`, `variants/tailwind`
  or `variants/skeleton` as the project root. Preserve workspace access.
- Use the repository's Next.js preset and matching workspace build configuration.
- Set `NEXT_PUBLIC_API_URL` to the API HTTPS origin before building.
- Preserve existing Maps configuration. If adding a browser key, enable Maps
  JavaScript API and restrict referrers to approved frontend domains.
- Optional map configuration: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and
  `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Without a usable key, directory lists remain
  available and the map displays its fallback.
- Rebuild when changing `NEXT_PUBLIC_*`; these values are embedded in JavaScript.

## Railway: shared API

Use the repository root and `/backend/railway.json`. The checked-in configuration
starts `node backend/src/server.js`, uses `/health/ready`, one replica and a
35-second drain period. The process requires a persistent service to run expiry,
notification recovery and email outbox workers.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Production validation/security |
| `MONGODB_URI` | Atlas URI including the intended database name; takes precedence over `MONGO_URI` |
| `JWT_SECRET` | Unique random secret of at least 32 characters |
| `PUBLIC_APP_URL` | Canonical frontend HTTPS origin for email links |
| `CORS_ORIGINS` | Comma-separated exact approved frontend origins |
| `COOKIE_SAME_SITE` | `none` for cross-site HTTPS frontend/API; otherwise choose the appropriate same-site policy |
| `TRUST_PROXY` | Verified proxy IP/CIDR list or fixed hop count; never unrestricted trust |
| `PORT` | Hosting-assigned listening port |

Use Node.js >=22.19.0. Changing a frontend domain also requires reviewing CORS,
the canonical email-link origin, Maps referrers and browser cookies.

## Email: Resend HTTPS or existing SMTP

Configure only the selected provider. Never expose these values in
`NEXT_PUBLIC_*`.

### Resend

1. Verify the sending domain and required DNS records in Resend.
2. Set `EMAIL_ENABLED=true`, `EMAIL_PROVIDER=resend`,
   `RESEND_API_KEY` and `RESEND_FROM`.
3. Use the approved domain sender, such as
   `notifications@mail.medreachforyou.com`; the provider must authorize it.
4. Set the display name with `SMTP_FROM_NAME` if desired; that name is reused
   by both transports.
5. Send a controlled test to an approved inbox and inspect provider events.
   API acceptance alone is not evidence of inbox delivery.

### SMTP

Keep an already working local setup. The existing variables are `SMTP_HOST`,
`SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`,
`SMTP_FROM_NAME` and `SMTP_CONNECTION_TIMEOUT_MS`.
The host must permit outbound connections to the chosen SMTP service.

### Delivery semantics

The normal server starts the persistent email outbox automatically. Only new
explicitly queued, replay-safe messages are picked up; historical delivery rows
are not broadly replayed. Failed definitive attempts have bounded recovery.
Ambiguous acceptance is marked uncertain and is not automatically resent.
Account links remain inline and non-replayable.

Changing `JWT_SECRET` affects sessions, guest token recovery and encrypted
email retry envelopes. Treat rotation as a separate migration/recovery decision.

## Atlas and data safety

Use a restricted database user and appropriate network access rules.
`DATABASE_URL` is not a MongoDB alias in this application.
The existing migration/backup tools require explicit source/destination settings;
read their guards before running them. No deployment should reset/reseed data.

## After deployment

Check public readiness, one real directory read, session persistence, request
tracking and all deployed variants. Confirm provider isolation, approved email
recipients and receipt in the controlled inbox. Compare dataset counts with the
backup inventory. Inspect queue age/failures and hosting/database latency.

Local tests do not establish hosted CORS, cookies, proxy settings, mailbox
delivery or production performance. Do not infer a hosting-region or index
problem from latency alone.
