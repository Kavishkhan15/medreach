# test-bot

A standalone manual smoke check for the MedReach Healthcare Assistant API.
It is not part of the application or the deterministic release gate.

## Run

Start the backend separately, then:

```sh
node test-bot/ask.js
BASE_URL=http://localhost:4000 node test-bot/ask.js
```

The script fetches `/health` and sends five messages to
`POST /api/assistant/message`: a basic question, greeting, emergency message,
hospital search and ICU/availability question. It prints the reported intent and
reply source. Success means each request returned HTTP 200 and a nonempty
`reply`; it exits with code 1 if a request fails that check.

## What success establishes

A passing run establishes API reachability and reply-shaped responses for those
five requests. It does **not** assert the mathematical answer, exact intent,
availability honesty, real provider data, database readiness, booking/application
submission or frontend behavior. `/health` is liveness; use `/health/ready` to
check database readiness and graceful-shutdown status.

Replies may use `rule_based`, configured `openai`/`gemini`, or a fallback. A
nonempty unavailable/error fallback can also satisfy this script's current check.
Therefore five `OK` lines do not prove external AI credentials worked. Inspect
`source` and reply content, and use dedicated automated checks for stronger
assertions. A deployment configured with an external provider may send these
messages to that provider; use `AI_PROVIDER=rule_based` for deterministic local
verification.

See [assistant implementation](../docs/ai-assistant.md) for all supported domains
and [Release QA](../docs/release-qa.md) for backend, browser and build
coverage. No new manual or live-provider run was performed for this documentation
update (2026-10-03).
