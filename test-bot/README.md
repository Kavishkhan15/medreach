# test-bot

A tiny, standalone manual smoke-test for the MedReach AI Assistant API.
Not part of the app — just a quick way to confirm the backend + AI provider
are actually alive and answering, without opening a browser.

## Run it

```bash
# backend must already be running (npm run backend:dev, or ./run.sh)
node test-bot/ask.js

# against a different backend:
BASE_URL=http://localhost:4000 node test-bot/ask.js
```

Asks a handful of plain questions ("What is 2+2?", a greeting, an emergency
message, a hospital search, an ICU/availability question) and prints whether
each one got a real reply. If everything printed `OK`, the API is working end
to end — health check, assistant endpoint, and whichever AI provider is
currently configured (`rule_based`/`openai`/`gemini`).
