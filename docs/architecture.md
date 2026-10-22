# Architecture

[Documentation](README.md) · [Project overview](../README.md) · [Diagram Gallery](diagrams/README.md) · [Database Schema](database-schema.md) · [API Reference](api.md)

## System Overview & Visual Architecture

```text
Existing healthcare dataset
        ↓
     MongoDB
        ↕
 Express API + background workers
        ↕
Bootstrap / Tailwind / Skeleton
```

The system architecture and workflow models are visually documented in high-resolution vector format:
- **System Topology:** [`docs/diagrams/system-architecture.svg`](diagrams/system-architecture.svg) (Source: [`.mmd`](diagrams/system-architecture.mmd))
- **Database ER Schema:** [`docs/diagrams/database-er.svg`](diagrams/database-er.svg) (Source: [`.mmd`](diagrams/database-er.mmd))
- **Role-Permission Matrix:** [`docs/diagrams/role-permission-matrix.svg`](diagrams/role-permission-matrix.svg) (Source: [`.mmd`](diagrams/role-permission-matrix.mmd))
- **Provider Onboarding:** [`docs/diagrams/provider-onboarding.svg`](diagrams/provider-onboarding.svg) (Source: [`.mmd`](diagrams/provider-onboarding.mmd))
- **Request & Notification Lifecycle:** [`docs/diagrams/request-notification-flow.svg`](diagrams/request-notification-flow.svg) (Source: [`.mmd`](diagrams/request-notification-flow.mmd))
- **Cloud Deployment Architecture:** [`docs/diagrams/deployment-architecture.svg`](diagrams/deployment-architecture.svg) (Source: [`.mmd`](diagrams/deployment-architecture.mmd))
- **Authentication & Role Redirection:** [`docs/diagrams/auth-flow.svg`](diagrams/auth-flow.svg) (Source: [`.mmd`](diagrams/auth-flow.mmd))

See the complete [Diagram Gallery](diagrams/README.md) for full renders and component breakdowns.


No service crawls external provider websites. Stored source URLs and observations
document historical provenance. Provider records and availability are never
invented to compensate for a failed API.

## Code map

| Location | Responsibility |
| --- | --- |
| `backend/src/app.js` | Express composition, security and routes; no listening or DB initialization |
| `backend/src/server.js` | Database connection, HTTP startup and worker lifecycle |
| `backend/src/controllers` | Validation outcomes, response contracts and workflow coordination |
| `backend/src/services` | Permissions, provisioning, request lifecycle, evidence and email |
| `backend/src/models` | Mongoose schemas and declared indexes |
| `packages/core/src` | Shared client, hooks, ranking, validation and presentation helpers |
| `variants/bootstrap/_core` | Bootstrap's local core mirror |
| `variants/*/app` | Independent Next.js routes and framework styling |
| `tests/e2e`, `backend/test`, `tests/unit` | Browser, backend and focused unit tests |

Bootstrap aliases `@medreach/core` to its local mirror. Tailwind and Skeleton
resolve the workspace package. Homepage resource orchestration is shared through
`homeResources.js`; framework markup remains independent.

## Access boundaries

New accounts use `system_admin`, `provider_admin` or `user`.
System Admin retains `/admin`. Provider Admin uses `/provider` and active
`ProviderMembership` assignments keyed by organisation type and ID.
Server checks apply to direct API calls as well as UI actions.

Legacy `hospital_admin` assignment compatibility remains for existing hospital
relationships; legacy global `admin` and `user_admin` values do not confer
platform privileges. Account migrations require an explicit inventory and
approval. See [security](security.md).

## Requests and onboarding

Public provider applications persist as pending. System Admin review approves or
rejects them. Approval provisions the organisation and its associated account
through the existing retry-aware workflow; it does not grant access before
activation. Request histories and provider reports are scoped to their actor.

Ordinary requests notify eligible providers and the user. Explicit emergencies
also notify configured active System Admins. An ambulance-required flag alone
does not classify a request as an emergency.

## Background work

- Request expiry advances expired bed requests.
- Notification recovery reconciles new-version request/application notifications.
- The email outbox processes explicitly queued, replay-safe delivery records,
  at most three per batch, with a one-second polling interval.
- Account activation, address verification and password recovery retain their
  inline, non-replayable delivery path.

HTTP handlers await durable notification storage, rather than SMTP/Resend
delivery, for queued messages. Email states retain pending, failed, uncertain,
disabled and sent distinctions. `sent` means provider acceptance.

Shutdown marks readiness false, drains HTTP and workers, then disconnects
MongoDB. The existing shutdown deadline still applies. No external queue service
is required.

## Performance boundaries

Provider Accounts batch memberships and organisation names. Directory hospital
enrichment was already batched and remains intact. The homepage publishes each
resource independently and defers jobs/campaigns until their sections approach
the viewport. Job summaries omit full descriptions and populated provider
objects; normal Careers responses retain their existing contract.

Compression/revalidation applies to public directory index GET/HEAD responses.
Authenticated and private responses retain `no-store`. No stale availability
cache is introduced. See [measurements](latency-verification.md).

## Intentional differences and limitations

Bootstrap has the local manual credential handover UI. Tailwind and Skeleton
retain email-invitation administration. These are not identical interfaces.
See [parity scope](PARITY_VERIFICATION.md).

The local standalone database does not make every multi-document workflow
transactional. Durable delivery records and recovery reduce failure impact;
a crash before an intent is persisted remains a limitation. Hosted performance,
mailbox receipt and deployment configuration require separate checks.
