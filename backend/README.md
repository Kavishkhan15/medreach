# Backend

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

## Data safety

The recovered local database is not a fixture database. Seed scripts delete
records and must never target it. Test suites drop their own explicitly named
databases; run them on a disposable local MongoDB instance.

`npm run backend:test:db` enables every registered database gate and rejects
skips. The complete URI list is in `scripts/verify-backend-tests.mjs`.
Plain `npm test` permits opt-in suites to skip.

## Email

Normal notifications persist encrypted replay-safe outbox records before
responding. The server starts their worker automatically. Account links retain
inline delivery and cannot be replayed from stored email content.
Delivery metadata reports transport acceptance, not confirmed inbox receipt.
No SMTP or Resend secrets belong in code, logs or frontend variables.
