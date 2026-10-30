# CI verification

`ci.yml` runs frontend lint/unit tests, every backend MongoDB test gate, builds for
all three frontend variants, all Playwright release journeys and evaluation scoring.

The backend restore tests need `mongodump` and `mongorestore` on the runner's PATH,
in addition to a running MongoDB service. The workflow copies these tools from its
existing MongoDB service image, verifies their versions and exposes their directory
through `GITHUB_PATH`. Keep the restore tests enabled; a missing tool is an
environment failure, not a reason to skip backup verification.

Worker lease fixtures use a single scheduling slot so wall-clock minute boundaries
cannot introduce unrelated work into a duplicate-execution assertion. Their waits
are bounded and release held handlers on failure. The backend job also has a
15-minute deadline so an unexpected open handle cannot consume hours of CI time.

The browser job builds and tests Bootstrap, Tailwind and Skeleton. Run the complete
`npm run test:e2e` matrix when checking this job; a selected file/project run does
not establish that the release suite passes. Bootstrap-only features are explicitly
scoped to that project, including cleanup hooks. Shared tests keep their permission,
retry, privacy and durable-request assertions across variants while using each
variant's current accessible names.

Browser fixtures live only in the guarded disposable E2E database. Separate
privileged accounts per variant avoid unrelated journeys exhausting one account's
login budget. Production rate limits stay enabled. Do not relax the application
limits to accommodate a shared test identity.

On an isolated machine with MongoDB and backup tools available:

Capacity allocation tests also require a separate replica set named
`medreach-capacity-test` on port 27018 with the disposable database
`medreach_capacity_test`. CI creates this test-only container explicitly; it does
not change the existing standalone test database. See
[capacity rollout and verification](../../backend/CAPACITY_RESERVATIONS.md).

```sh
npm ci
npm run backend:test:db
npx playwright install --with-deps chromium
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY='' npm run build:variants
MEDREACH_E2E_MONGO_URI=mongodb://127.0.0.1:27017/medreach_e2e_ci npm run test:e2e
```

The E2E seed recreates its named disposable database. Never select a production or
recovered dataset. Keep the frontend's compiled API URL and the API server port
consistent when overriding the default local ports.
