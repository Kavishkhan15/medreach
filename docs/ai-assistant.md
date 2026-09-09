# MedReach AI Assistant

A chat entry point inside the existing Emergency Help modal that helps a user
find hospitals, understand facility capability, and reach emergency services
faster. **No diagnosis, no prescriptions, no claim to dispatch an ambulance.**
It never invents a hospital, a bed count, or an availability status — every
fact it states comes from the same MongoDB data the rest of the app uses.

> **Experiment rule:** the assistant is business logic, not styling. It lives
> in `packages/core` + `backend/`, identically for all three frontends. No
> variant contains assistant logic of its own — only the CSS classes on an
> otherwise-identical component differ.

## Where it lives

```
User taps "🤖 Ask MedReach AI Assistant" (4th action, Emergency Help modal)
  → AiAssistantModal (variants/*/components — same JSX/behavior, only classNames differ)
    → useAssistant() (packages/core/src/hooks.js — headless, zero markup)
      → sendAssistantMessage() (packages/core/src/api.js)
        → POST /api/assistant/message (rate-limited, validated)
          → assistantController.js → assistantService.js
             ├─ classifyIntent()        deterministic, keyword-based, no ML
             ├─ buildContext()          real Hospital/HospitalFacility/AvailabilityObservation data
             └─ getAiProvider().generateReply(context)
                ├─ ruleBasedProvider.js  default, zero external config
                └─ openAiProvider.js     optional, server-side only, never in the bundle
```

## Intent classification (`assistantService.js`)

Every message is classified into exactly one of three intents, in this order,
before any hospital lookup runs:

1. **`emergency`** — keyword match against a fixed list (`unconscious`,
   `not breathing`, `chest pain`, `severe bleeding`, `cardiac arrest`, …).
   **Always checked first and always wins.** A reply with this intent leads
   with prominent `CALL 112` / `CALL 102` / `FIND NEAREST HOSPITAL` actions,
   rendered directly in the chat — never buried behind a paragraph.
2. **`hospital_search`** — phrasing like "find", "near", "nearest", or a match
   against the same category keywords the existing `EmergencyCategorySelector`
   UI uses (cardiac, stroke, trauma, burns, respiratory, pediatric, maternity,
   ICU). Triggers a real hospital lookup.
3. **`general`** — anything else. Returns short guidance and example prompts.

This is the same category vocabulary as `packages/core/src/emergency.js`
(`EMERGENCY_CATEGORIES`) — a deterministic specialty/facility mapping used for
*ranking*, not diagnosis. The assistant reuses that mapping; it does not add a
second, competing one.

## Hospital data (never fabricated)

`buildContext()` queries the same `Hospital` / `HospitalFacility` /
`AvailabilityObservation` collections, through the same `rankHospitals()` used
by `GET /api/hospitals`, and returns:

| Field | Source | Guarantee |
|---|---|---|
| `name`, `locality`, `specialties` | `Hospital` | verbatim from the DB |
| `matchedFacilities` | `HospitalFacility` | only facilities that actually exist for that hospital |
| `facilityDetail.status` | latest `AvailabilityObservation` | `"unknown"` passes through as `"unknown"` — never guessed |
| `facilityDetail.confidence` | latest observation's `confidence` | `HIGH/MEDIUM/LOW/UNKNOWN`, never invented |
| `facilityDetail.retrievedAtRelative` | observation's `retrievedAt` | omitted, not fabricated, when there's no observation |
| `phone`, `coordinates` | `Hospital.emergencyPhone/phone`, `Hospital.location` | omitted (not null-filled) when the hospital has no real value, so Call/Navigate buttons only render when they'd work |

If a query has no locality match and no category match, the reply asks
"Which Mumbai area are you in?" instead of guessing — matching
`ASSISTANT_LOCALITY_PROMPT` in `packages/core/src/assistant.js`.

## Provider abstraction (swap without touching the UI)

`backend/src/services/aiProviders/` defines one contract:

```js
async function generateReply(context) -> { text: string, source: "ai" | "rule_based" }
```

- **`ruleBasedProvider.js`** — the default. Deterministic templates built only
  from the real `hospitals` array in `context`. Requires zero configuration
  and zero external network calls; this is also the **guaranteed-safe
  fallback** if any other provider throws.
- **`openAiProvider.js`** — optional. Only reachable when `AI_PROVIDER=openai`
  **and** `AI_API_KEY` is set. Server-side only — this module is never
  imported by any frontend and `AI_API_KEY` never reaches the browser. Its
  system prompt explicitly forbids inventing hospital data, diagnosing, or
  claiming to dispatch emergency services, and instructs the model to say
  availability is unknown whenever the supplied data says so.

`getAiProvider()` reads `env.aiProvider` at call time and selects the module.
Switching providers is an environment-variable change only:

```bash
# .env — all optional; unset = rule_based, zero config
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

## Fallback (hospital discovery never breaks)

`getAssistantReply()` always tries the configured provider first and falls
back to `ruleBasedProvider` on **any** error (network failure, bad API key,
provider outage). The HTTP controller additionally catches any remaining
unexpected failure and returns a clean
`{ reply: "AI assistant is temporarily unavailable.", unavailable: true }`
instead of a `500`. The frontend's `useAssistant()` hook mirrors this on the
client side: a network error to the backend itself produces the same
`unavailable` state.

When `unavailable` is true, every variant's `AiAssistantModal` renders the
same `EmergencyActions` block (`CALL 112` / `CALL 102` / `FIND NEAREST
HOSPITAL`) in place of the chat — never a broken or empty chat window.

## Rate limiting & input handling

- `POST /api/assistant/message` is public (same trust tier as
  `GET /api/hospitals`) but has its **own** `express-rate-limit` instance
  (20 requests / 5 minutes per IP), separate from the auth limiter.
- `backend/src/utils/sanitize.js` strips control characters and hard-caps
  messages at 500 characters; `express-validator` enforces the same cap at the
  route layer as defense in depth.
- The controller never echoes provider config, system prompts, or raw
  internal errors back to the client.

See [`docs/security.md`](security.md) for the full security posture and
[`docs/api.md`](api.md) for the request/response shape.

## Frontend (identical across variants)

- `packages/core/src/assistant.js` — all copy (`ASSISTANT_ENTRY_LABEL`,
  `ASSISTANT_DISCLAIMER`, `ASSISTANT_QUICK_ACTIONS`, …) and zero framework
  classes, per the existing `packages/core` rule.
- `packages/core/src/hooks.js` → `useAssistant()` — headless chat state
  (messages, sending, unavailable), identical in every variant.
- `variants/{bootstrap,tailwind,skeleton}/components/{SosButton,
  AiAssistantModal}.js` — same structure and behavior; only `className` values
  differ, matching every other component in the app.
- The AI entry button is deliberately styled at the **same visual weight** as
  "Find nearest emergency hospital" (an outline/secondary button) — never as
  prominent as `CALL 112` or `CALL 102`.
- Accessibility: focus trap + focus restore on open/close, `aria-live` on the
  message list and typing indicator, `role="group"` on quick-action chips,
  44px minimum touch targets on mobile (WCAG 2.5.5), never color-only status
  (availability always paired with a text label/symbol).

## Tests

`backend/test/assistant.test.js` — intent classification (including the
"my father is unconscious" → emergency example), sanitization, request
validation (`400` on empty/oversized/invalid input), public access (no
`401`), and rate limiting (`429` past the ceiling). No live AI provider or
network access is required to run the suite.
