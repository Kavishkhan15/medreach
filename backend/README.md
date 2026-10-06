# MedReach Backend

Shared Express + MongoDB API for Bootstrap, Tailwind and Skeleton. Authentication, validation, request lifecycle, email delivery and stored provider data are common to all three frontends.

## Setup

Requires Node **22.19.0 or newer** and MongoDB (local or hosted).

```bash
# From the repository root
npm ci
cp backend/.env.example backend/.env
# Configure MONGODB_URI (or MONGO_URI), JWT_SECRET and deployment settings.
npm --workspace @medreach/backend run dev
```

The API defaults to `http://localhost:4000`. `MONGODB_URI` takes precedence over `MONGO_URI`. Use a strong `JWT_SECRET` in production, exact frontend origins in `CORS_ORIGINS`, and a frontend origin in `PUBLIC_APP_URL` for email links. See [deployment configuration](../docs/deployment.md).

`npm --workspace @medreach/backend run seed` is an optional development setup. **It deletes existing hospitals, users, alerts, blood campaigns and resource providers.** Never run it on a production database. Its predefined job listings are draft demo listings awaiting verification; seed data is not proof of current availability or reviewed provenance. Development seed credentials are not production accounts.

## API areas

| Area | Routes / behavior |
|------|-------------------|
| Health | `/health` and `/health/live` report liveness; `/health/ready` returns 503 when MongoDB is disconnected or shutdown is draining |
| Authentication | `/api/auth/*`: password registration/login, rotating refresh sessions, logout/revocation, email verification, recovery and profile updates |
| Discovery | `/api/hospitals`, `/api/blood-banks`, `/api/diagnostics`, `/api/ambulances`; stored directory data and provenance |
| Bed requests | `/api/emergency-requests/emergency` is guest accessible; `/standard` requires login; authorized detail, review and timeline endpoints |
| Blood | `/api/blood-requests/standard` and `/urgent` have separate urgency contracts; standard flow also supports donation pledges |
| Ambulance | `/api/ambulances/book` saves a booking and per-recipient delivery states before returning its reference |
| Careers | `/api/jobs`, `/api/organizations/careers`, job/organization applications and `/api/applications/mine`; public `CAR-J…` / `CAR-O…` references |
| Tracking | `/api/tracking/:type/:reference` exposes only reference, status and update time for blood, bed, career or ambulance; private details remain protected |
| Assistant | `/api/assistant/message` returns grounded directory results and actions; rule based by default, optional external phrasing provider |
| Administration | Assigned hospital operations, system administration, claim review, audit and protected email delivery/retry endpoints |

See [API reference](../docs/api.md), [data model](../docs/data-model.md) and [bed lifecycle](../docs/bed-request-lifecycle.md) for contracts and access rules. Google sign-in and the in-app notification inbox/API are intentionally removed. Email verification, recovery, request confirmations, status emails and staff/admin emails remain.

## Reliability and security

- Short-lived access JWTs are tied to server-side rotating refresh sessions. Protected and optional-auth routes validate presented credentials consistently.
- Guest request creation remains available. A private tracking token or authorized account is required for private request details/actions; reference-only tracking is a limited status summary.
- Submission endpoints accept `Idempotency-Key` and preserve saved records when a secondary email attempt fails.
- Independent confirmation/admin/staff email tasks for bed, blood and career submissions run in batches of at most three **per submission** and are awaited. This is not a global SMTP rate limit or a guarantee of inbox delivery. Failed replayable messages retain durable retry records; password-reset and verification links are reissued instead of replayed.
- SIGTERM/SIGINT mark readiness false, drain HTTP and workers, then disconnect MongoDB, with a 30-second shutdown deadline.

See [security](../docs/security.md), [privacy](../docs/privacy.md), [email operations](../docs/api.md#email-operations) and [measured latency](../docs/latency-verification.md).

## Tests and production start

```bash
# From the repository root, with isolated local MongoDB available
npm run backend:test:db

# Start the API using configured deployment environment variables
NODE_ENV=production npm --workspace @medreach/backend run start
```

The strict database runner fails if a database-gated suite is skipped. Only override its four gate URIs with the expected isolated database names: `medreach_test`, `medreach_auth_test`, `medreach_product_integration`, and `medreach_fusion_integration`. Legacy suites also use isolated `*_test` databases; tests can drop their databases. The ordinary workspace `test` command can skip opt-in suites, so it is not the complete release gate.

Apply the idempotent `migrate:auth-security` and `migrate:reliability-indexes` scripts as described in [deployment](../docs/deployment.md). Current local evidence and remaining live checks are maintained in [release QA](../docs/release-qa.md).
