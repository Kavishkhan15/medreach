# Diagnostic test requests

The Bootstrap diagnostic directory links to `/diagnostics/request?centre=<id>`. Patients can request one to four tests: CBC, blood glucose, lipid profile and thyroid profile. These are request options; their presence does not assert that a centre offers them.

Only an explicitly approved, active, unarchived diagnostic centre with an unarchived parent hospital can receive a new request. Imported records without an approval status need an administrator's approval first. This feature never approves or modifies existing provider records automatically.

## API

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/diagnostics/requests` | Guest or signed-in patient; public submission limiter |
| GET | `/api/diagnostics/requests` | Signed-in owner, assigned centre administrator, or System Admin |
| GET | `/api/diagnostics/requests/:reference` | Owner, assigned administrator, System Admin, or private tracking token |
| PATCH | `/api/diagnostics/requests/:id/status` | Assigned Provider Admin or System Admin; privileged authentication policy applies |
| PATCH | `/api/diagnostics/requests/:reference/cancel` | Owner or private tracking token; administrators use the privileged status endpoint |
| GET | `/api/tracking/diagnostic/:reference` | Rate-limited reference-only status summary; no personal or appointment details |

Creation fields are `providerId`, `tests`, `patientName`, `contactPhone`, optional `contactEmail`, `preferredDate`, `preferredTime`, optional `notes`, and `consent: true`. Test keys are `CBC`, `BLOOD_GLUCOSE`, `LIPID_PROFILE`, `THYROID_PROFILE`. Time preferences are `MORNING`, `AFTERNOON`, `EVENING`. Preferred dates run from tomorrow through 180 days ahead, calculated in Asia/Kolkata. Unknown fields are rejected.

The Bootstrap client supplies an opaque `Idempotency-Key`. A unique actor-scoped hash prevents simultaneous duplicate submissions. Replaying the same payload returns the original reference and private tracking credential; reusing its key for a different payload returns 409. Only token hashes are stored. References use a cryptographically random `DX-` prefix and 20 hex characters. Private tracking uses `X-MedReach-Tracking-Token`; links carry the credential in their fragment and remove it from the address bar after loading.

List queries accept `limit` (1–100; default 30), `before` (the previous `nextCursor`), and an authorised `providerId`. System Admins can use `followup=true` to find open requests without an eligible notification contact. Providers cannot select another centre through query parameters. Responses containing request details use `Cache-Control: no-store`.

## Lifecycle and confirmation

`REQUESTED → UNDER_REVIEW → CONFIRMED → COMPLETED`, with `DECLINED` and `CANCELLED` alternatives. A centre may confirm or decline directly from Requested. Patients may cancel Requested, Under Review or Confirmed requests. Terminal states cannot be reopened.

Every mutation requires `expectedVersion`. Status, version increment, history and pending audit/notification effects are saved atomically in one document. Concurrent or stale updates return 409. Confirmation requires a nonempty, distinct subset of the originally requested tests and a future ISO appointment timestamp within 180 days. The Bootstrap review form explicitly labels its appointment input as India time and converts it to UTC for storage. Tracking displays accepted tests and any requested tests excluded from the appointment.

Requests and provider acceptance do not consume inventory, reserve slots, confirm payment or imply test completion. No report uploads or payments are part of this release.

## Notifications and recovery

Initial notifications use the existing persisted `RequestNotification` and `EmailDelivery` infrastructure, assigned provider membership checks, verified contact eligibility, bounded delivery retries and delivery lifecycle. The recovery worker includes `DiagnosticRequest` routing and status-effect journals. Audit records use deterministic IDs, and email events use stable keys, so recovery does not create duplicate effects.

If no eligible notification recipient exists, the request remains saved as Requested and records `notificationRouting: no_eligible_recipients`. The patient is told that administrator follow-up is required, and the System Admin request page exposes a follow-up filter. Assigning an account or changing contact settings does not itself prove that an earlier notification was delivered; the administrator must coordinate outstanding requests explicitly.

Submission to an email service is not delivery, provider acceptance or an appointment. Hosted Resend delivery still depends on the deployed worker and webhook configuration.

## Deployment

`migrateDiagnosticIndexes.js` is an additive, separately versioned migration for the new collection. Existing migration manifests remain unchanged. Production API and worker startup require the new unique reference and idempotency indexes. Apply the reviewed migration before rolling out this backend version; do not deploy the frontend request flow against the old API.

1. Set `MEDREACH_MIGRATION_URI` and `MEDREACH_MIGRATION_DATABASE` through secure configuration.
2. Run `npm --workspace @medreach/backend run migrate:diagnostics -- --dry-run`.
3. Verify the target, plan and checksum; create and verify a backup using the existing backup workflow.
4. Supply `MEDREACH_MIGRATION_APPROVED_CHECKSUM` and `MEDREACH_MIGRATION_BACKUP_RECEIPT`, then run the same command with `--apply --allow-unique-bootstrap`.
5. Deploy the API and workers together, verify readiness, then deploy Bootstrap. Preserve diagnostic requests and indexes during rollback. Roll back the Bootstrap request flow with the backend; older workers do not understand diagnostic routing intents, so diagnostic notification recovery must resume with a compatible worker version.

No production data changes, approvals, account assignments, notifications or migrations are performed by installing this source change.

## Verification

`MEDREACH_DIAGNOSTIC_TEST_MONGO_URI=mongodb://127.0.0.1:27017/medreach_diagnostic_requests_test NODE_ENV=test EMAIL_ENABLED=false node --test backend/test/diagnosticRequests.test.js` runs the isolated integration suite. It refuses non-loopback or differently named database targets. The standard `npm run backend:test:db` runner includes this gate. Browser journeys are in `tests/e2e/diagnostic-requests.spec.js` and cover guest submission, mobile layout, tracking/cancellation, provider review and partial confirmation. SMTP failure tests inject a synthetic transport and do not send external email.
