# MedReach Healthcare Assistant

Current implementation reference, reviewed 2026-10-03. The assistant helps users
find healthcare resources and open existing request flows. It is not a diagnosis,
prescribing or emergency dispatch service. For executed checks and remaining
live-provider verification, see [Release QA](release-qa.md).

## Entry and layout

**SOS is the only persistent bottom-right floating button.** The separate
“MedReach Assistant” launcher has been removed. The assistant remains available
from the Emergency Help/SOS interface; Bootstrap can open the globally mounted
panel through `medreach:open-assistant`, while the compatibility
`AiAssistantModal` wrapper opens the same panel component for existing callers.

All variants contain `HealthcareAssistant.js` and its scoped CSS module. The
panel has an opaque 70px header, assistant identity and network subtitle,
status indicator, minimize/restore and close controls. Conversation content
scrolls independently of the input/footer. It contains result cards, compact
actions, directory/map links and suggested-question chips. The 390px by 580px
desktop panel is bounded by viewport dimensions; the mobile layout preserves
access to SOS. The disclaimer remains visible as secondary text.

“Online” is a UI availability indicator, not an independently verified health
probe of Google/OpenAI, providers or emergency services.

## Request path

```text
HealthcareAssistant / AiAssistantModal
  → shared useAssistant() state and API client (@medreach/core)
  → POST /api/assistant/message
  → assistantController → assistantService
     → deterministic classifyIntent()
     → assistantTools queries MongoDB
     → rule_based / openai / gemini reply provider
  → real provider cards, suggested actions and follow-up prompts
```

Shared API and hook logic lives in `packages/core/src/`; Bootstrap resolves its
bundled core copy. Frontend presentation components are per variant. This is a
shared behavior contract, not a claim that all JSX/markup is byte-identical.
The backend determines intents and queries; frontends render cards, navigation
and the existing blood/ambulance action forms.

## Intent order

`backend/src/services/assistantService.js` checks these intents in order:

| Priority | Intent | Existing flow |
| --- | --- | --- |
| 1 | `emergency` | Emergency contact actions, emergency-capable hospitals and `/emergency` |
| 2 | `urgent_blood` / `blood_bank_search` | Blood banks; urgent requirements use `/urgent-blood` |
| 3 | `ambulance_search` | Ambulance providers, contact/navigation and booking form |
| 4 | `diagnostic_search` | Diagnostic providers and `/diagnostics` |
| 5 | `bed_request` | Hospital matches and separate standard/emergency request links |
| 6 | `career_search` | Published healthcare jobs and `/careers` |
| 7 | `hospital_search` | Hospital matches, `/hospitals` and `/map` |
| 8 | `general` | Short guidance and suggested queries |

Emergency keyword matching wins over other matches. Blood-test/lab-test language
is routed to diagnostics rather than blood supply. Locality and blood-group
extraction are deterministic. The backend's emergency assistant actions use
112/108; the SOS interface also preserves its existing 112/102 actions.
These are contact actions, not promises of provider availability or dispatch.

Urgent blood stays in its dedicated flow. Standard requests and emergency bed
requests retain their existing routes and authentication rules. Selecting an
action does not itself submit a request; the existing forms and backend
validation still apply. Hospital bed requests leave ambulance arrangement to
the hospital, separately from standalone ambulance booking.

## Real data and uncertainty

`assistantTools.js` queries `Hospital`, `HospitalFacility`,
`AvailabilityObservation`, `ResourceProvider` and `Job` collections. It returns
hospital/resource summaries and published jobs, not generated replacement
providers. Hospital summaries include source verification status. A listed
result does not become verified merely because it appears in chat.

Hospital availability is composed through `composeHospitalDataView()`:
unverified/stale observations do not establish current beds. Missing availability
remains `unknown`; unavailable contact/coordinate values remain absent.
Resource blood groups are listed services, not inventory counts. Directions and
Call controls depend on available contact/location data. Where both coordinates
are supplied, distance is a straight-line calculation, not a road ETA.

Backend search tools catch query failures and return empty result arrays. An
empty assistant result therefore does not prove that no provider exists outside
the current database or that its underlying database query succeeded.

## Reply providers

`backend/src/services/aiProviders/index.js` selects `AI_PROVIDER`, defaulting to
`rule_based` (also used for unknown settings):

- `rule_based`: deterministic templates, no external API configuration or calls.
- `openai`: optional server-side provider using `AI_API_KEY` and `AI_MODEL`.
- `gemini`: optional server-side provider using the same assistant `AI_*` settings.

API keys never belong in `NEXT_PUBLIC_*` settings or frontend bundles. Configure
a provider/model available to the deployment; local rule-based tests do not prove
external account credentials, model availability or hosted connectivity.

External providers receive bounded context with real result summaries and a
system prompt prohibiting invented providers, quantities, clinical diagnoses,
dosages and dispatch claims. Those instructions are not a clinical correctness
certification; optional generated reply text still requires live review.
Provider exceptions fall back to the deterministic provider. Unexpected service
failures return the unavailable state with emergency contact actions; backend
network failures also produce an unavailable UI instead of hiding emergency
contacts.

These settings are separate from optional crawler refinement
`GEMINI_ENABLED`/`GEMINI_API_KEY`/`GEMINI_MODEL`; see [crawler](crawler.md).

## API and security

`POST /api/assistant/message` is public and has a separate limiter: 20 requests
per five minutes per IP. It validates a nonempty string of at most 500 characters,
optional locality (at most 100 characters) and coordinate ranges. Sanitization
strips control characters and caps messages. Raw credentials/provider errors are
not included in the response.

The response includes `reply`, `intent`, `source`, result arrays, suggested
actions/prompts and detected locality/category/blood group. It does not create
beds, blood inventory, jobs, bookings or applications. Follow-on submission
routes enforce their own access, validation, idempotency and private tracking.
See [API reference](api.md) and [security](security.md).

## Verification and manual smoke checks

- `backend/test/assistant.test.js`: intent priority across all supported domains,
  blood-group/locality extraction, sanitization, public access, validation and
  rate limiting.
- `tests/e2e/assistant-ui.spec.js`: opaque header and viewport bounds, preserved
  hospital actions, blood/ambulance/diagnostic/career actions, unavailable states
  and durable ambulance booking/private tracking across all three variants.
- [test-bot](../test-bot/README.md): a manual API reply smoke test, with deliberately
  narrower assertions than the automated suite.

Run the deterministic release commands in [Release QA](release-qa.md). No live
OpenAI/Gemini requests were performed for this documentation update. The full
browser suite's recorded pass is functional evidence for the tested fixtures;
it is not a complete accessibility, visual or medical-content certification.
