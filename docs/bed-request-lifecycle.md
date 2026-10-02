# Hospital response and private patient tracking

This milestone covers emergency and standard bed requests in Bootstrap, Tailwind
and Skeleton. It uses the existing request API, MongoDB state, audit records,
in-app notifications and durable email delivery records.

## State and access contracts

| Backend state | Meaning shown to the patient |
| --- | --- |
| REQUESTED | Submitted; hospital receipt has not been confirmed |
| SENT | Available in connected hospital staff's inbox; review has not started |
| UNDER_REVIEW | Staff started review, or a patient supplied requested information |
| INFORMATION_REQUESTED | Staff asked for more information |
| ACCEPTED | Hospital accepted the coordination request; contact staff for next steps |
| REJECTED | Hospital declined the request |
| COMPLETED | Hospital staff completed coordination |
| CANCELLED | Request cancelled |
| EXPIRED | Response deadline passed before acceptance |

Emergency submission remains public. Standard requests require an account.
Signed-in patients can access their own records; guests need the private tracking
token. Tokens are stored in session storage and can be recovered from a saved
tracking link. The link uses a URL fragment that is removed after opening it.
Other users and unassigned hospital staff cannot retrieve or modify requests.

Assigned staff use `/hospital` to start review, send response messages, request
information, accept, reject and complete. Both bed-request types appear there.
A patient may cancel an active request or reply to an information request;
patients cannot accept or complete their own requests. Information requests must
explain what the patient should provide. Replies return the request to review and
notify connected staff. Cancellation also notifies connected staff.

Response messages and patient replies remain in the timestamped timeline, with
patient, hospital staff and system events distinguished. Requests retain the
existing two-hour response deadline; accepted requests can be completed after
that deadline. The expiry worker runs every minute and handles guests with or
without an email address as well as signed-in patients.

Updates compare the current state and timeline length. Stale actions are rejected
with 409; identical retries of the most recent action return its saved result
without creating another timeline entry, audit record or notification.

## Tracking UI

The detail page shows hospital contact/navigation actions, response messages,
timestamps and patient-facing notification history. Delivery labels distinguish
recorded in-app notifications, disabled email, queued email, failed email and
email accepted by the mail server. SMTP acceptance does not prove inbox receipt.
Internal staff recipients, SMTP errors and encrypted retry payloads are not
included in the tracking response.

Status refreshes every 20 seconds while the page is visible, and a manual refresh
is available. Outages preserve the last checked status with a warning and disable
mutation controls until status can be refreshed. Access failures clear the record.
Guest tracking includes manual token entry and a selectable private tracking link.
New request controls have at least 44-pixel touch targets; reply/token fields use
16-pixel text. Every design keeps its own styles.

## Automated verification

```sh
npm run backend:test:db
npm run build:variants
MEDREACH_E2E_MONGO_URI=mongodb://127.0.0.1:27017/medreach_lifecycle_e2e npm run test:e2e

git diff --check
```

`backend/test/bedRequestLifecycle.mongo.test.js` covers routing, permissions,
notifications, full response/reply/completion, guest tracking and cancellation,
immutable message history, concurrent responses, stale updates, repeated
transitions, expiry, malformed updates and saved responses despite audit/email
failures. Its database gate is explicitly enabled by `backend:test:db`.

`tests/e2e/bed-request-lifecycle.spec.js` adds six browser journeys per variant:
standard lifecycle, mobile guest lifecycle, rejection/cancellation and token
recovery, lost-response retry/outage recovery, expiry, and automatic status
refresh. It checks runtime and console errors, mobile overflow, keyboard submission and touch targets.
The existing critical journeys also run. These tests use isolated test fixtures
and databases; no production hospital response is simulated in public data.
Client IPs in these journeys are isolated using the configured proxy header;
production rate limits remain enabled.

## Local verification evidence — 2026-10-02

| Check | Result |
| --- | --- |
| `npm run backend:test:db` | PASS: 207 tests, zero failures or skips; all database gates enabled |
| `npm run build:variants` | PASS: Bootstrap, Tailwind and Skeleton production builds |
| `npm run test:e2e` with the isolated URI above | PASS: 42 journeys across all three variants, including 18 lifecycle journeys |
| `git diff --check` | PASS |

Browser journeys used production frontend builds, Chromium, real local Express
and MongoDB, isolated accounts and providers, disabled outbound SMTP, and mocked
failure conditions. Mobile checks used a 390 × 844 viewport. Backend SMTP failure
checks used a controlled test transport. No live hospital participation, inbox
receipt, physical-device accessibility or hosted deployment was verified here.
No dependencies or environment files were changed. No commit or push was made.

## Remaining operational limits

- Live SMTP receipt and real staff participation require live verification.
- A disconnected hospital cannot receive requests through a staff inbox. The UI
  says receipt is unconfirmed and preserves direct contact actions.
- Tracking uses polling; background or closed tabs do not receive browser push.
- Guest callers without email receive updates on their private tracking page.
- Audit/notification-store failures are logged and do not undo saved state.
  Failed email deliveries retain the existing controlled retry mechanism when
  a delivery record could be stored. There is no transactional outbox that can
  replay an audit or in-app notification lost during a database write failure.
- Coordination does not reserve a bed, prove inventory, or confirm dispatch.
