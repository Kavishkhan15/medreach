# Backend

[Documentation](../docs/README.md) · [Project overview](../README.md)

[Performance, security and search verification](../docs/testing/performance-security-seo-20261027.md) records the latest measured changes and hosted release limits.

One Express/Mongoose API serves all three frontends. Start it from the repository root:

```sh
npm ci
npm --workspace @medreach/backend run dev
```

It defaults to http://localhost:4000. Keep the existing `backend/.env`;
on a new installation use `backend/.env.example` as a template.
`MONGODB_URI` takes precedence over `MONGO_URI`.

- [Architecture and workers](../docs/architecture.md)
- [API contracts](../docs/api.md)
- [Data model](../docs/data-model.md)
- [Security](../docs/security.md)
- [Deployment and email](../docs/deployment.md)
- [Tests and current results](../docs/release-qa.md)
- [Inventory, recovery and scaling verification](../docs/testing/backend-scalability-20261026.md)
- [Worker deployment, indexes and release prerequisites](PRODUCTION_READINESS.md)
- [Latest backend implementation and release boundaries](../docs/testing/backend-commercial-hardening-20261026.md)
- [Privileged MFA rollout](../docs/backend/privileged-mfa-rollout.md)
- [Retention policy and scoped exports](../docs/backend/privacy-retention-and-exports.md)
- [Operational alerts and emergency coverage](../docs/operations/operational-alerts.md)
- [Production migrations, encrypted backups and deployment](../docs/operations/production-release.md)
- [Provider adoption implementation](../docs/testing/provider-adoption-20261027.md)
- [Integration credentials, quotas and staff permissions](../docs/backend/provider-integrations-and-quotas.md)
- [Isolated staging and disabled scheduling templates](operations/local-staging/README.md)

## Data safety

The recovered local database is not a fixture database. Seed scripts delete
records and must never target it. Test suites drop their own explicitly named
databases; run them on a disposable local MongoDB instance.

`npm run backend:test:db` enables every registered database gate and rejects
skips. The complete URI list is in `scripts/verify-backend-tests.mjs`.
Plain `npm test` permits opt-in suites to skip.

## Email

Normal notifications persist encrypted replay-safe outbox records before
responding. Run the notification, expiry and recovery workers as separate supervised
processes; the API does not start workers. Account links retain
inline delivery and cannot be replayed from stored email content.
Delivery metadata reports transport acceptance, not confirmed inbox receipt.
No SMTP or Resend secrets belong in code, logs or frontend variables.

## Reliability release

The [backend reliability verification](../docs/testing/backend-reliability-20261027.md) covers reviewed background enrichment, shared latency metrics, reporting readiness and source-independent recovery. See the [disabled release handoff](operations/release/README.md) before enabling production features. Use `migrate:reliability-release` for the separate additive v4 plan; earlier manifests remain immutable.
