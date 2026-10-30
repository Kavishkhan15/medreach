# Diagnostic test requests

The Bootstrap diagnostic directory links to `/diagnostics/request?centre=<id>`. Patients can request one to four tests: CBC, blood glucose, lipid profile and thyroid profile. These are request options; their presence does not assert that a centre offers them.

Every public Bootstrap diagnostic listing offers **Request tests** and opens a usable form. Approved centres receive the normal coordination request. Imported listings without explicit approval can collect a request for MedReach review, marked `centreApprovalPending=true`. Explicitly pending/rejected, inactive and archived centres remain ineligible, and a linked parent hospital must exist and be unarchived. This feature never approves or modifies existing provider records automatically.

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

List queries accept `limit` (1–100; default 30), `before` (the previous `nextCursor`), and an authorised `providerId`. System Admins can use `followup=true` to find open requests awaiting centre approval or an eligible notification contact. Providers cannot select another centre through query parameters. Responses containing request details use `Cache-Control: no-store`.

## MedReach review and centre handoff

Requests marked `centreApprovalPending=true` are saved as Requested and held in the
System Admin review queue under **Admin → Emergency Requests → Diagnostic test
requests**. Patients can track and cancel using their account/private link.
Assigned provider staff cannot list, read or mutate these requests, and provider
notification intents are withheld even during recovery. The form explains this
review step and obtains consent to coordinate through MedReach and the centre.

System Admins can review or decline a request. Centre approval and account/contact
onboarding use the existing Provider Accounts workflow. After approval, the review
action sends the request to the centre; an already-under-review request supports
this explicit handoff without a false appointment confirmation. A version-checked
atomic update clears the pending marker and reopens notification routing. Recovery
finishes a handoff interrupted after the save, and stable notification keys prevent
duplicate intents. Centre approval is rechecked for notification recipients/retries
and before appointment confirmation. Normal provider processing starts after
handoff. Approval itself does not confirm an appointment.

The Boolean marker defaults to false for existing requests. It adds no index or
backfill requirement to an installation that already has diagnostic request
indexes. The status names and existing response fields remain compatible.
Retain this disclosure guard during rollback: an older API/worker that ignores the
pending marker must not process newly held review requests. Preserve the records
and use a compatible release or suspend intake while arranging recovery.

## Lifecycle and confirmation

`REQUESTED → UNDER_REVIEW → CONFIRMED → COMPLETED`, with `DECLINED` and `CANCELLED` alternatives. A centre may confirm or decline directly from Requested. Patients may cancel Requested, Under Review or Confirmed requests. Terminal states cannot be reopened.

Temporary unconfirmed holds may also become `EXPIRED`; confirmed appointments do
not expire through this mechanism. A held multi-test request must be confirmed for
all held tests on the selected date, or declined and replaced. The subset rule below
continues to apply to legacy coordination requests.

Every mutation requires `expectedVersion`. Status, version increment, history and pending audit/notification effects are saved atomically in one document. Concurrent or stale updates return 409. Confirmation requires a nonempty, distinct subset of the originally requested tests and a future ISO appointment timestamp within 180 days. The Bootstrap review form explicitly labels its appointment input as India time and converts it to UTC for storage. Tracking displays accepted tests and any requested tests excluded from the appointment.

Configured diagnostic daily capacity now supports transactional temporary holds,
with a maximum of 30 routine patients per test/date, date selection from today and
Routine/Emergency priority. All selected tests allocate together. Full routine dates
reject extra routine allocations; emergencies can request provider review without
displacing a confirmed appointment. Confirmation does not deduct a second slot,
and completing a test still consumes that day's capacity. Unconfigured or unapproved
listings retain coordination/review handling. No report uploads or payments are
part of this release. See [capacity setup and rollout](CAPACITY_RESERVATIONS.md).

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

Additional regression coverage includes legacy/null approvals, withheld provider access, confirmation blocking, concurrent handoff, interrupted handoff recovery, revoked-approval retries, and the visible legacy listing → enabled form → saved review request → private tracking → cancellation browser journey. Tailwind and Skeleton frontend code is unchanged.

Release validation: 650 backend checks passed with zero failures or skips; 21
Bootstrap browser journeys passed. The Bootstrap production build passed. Backend
and Bootstrap lint report zero errors, with seven and four existing warnings
respectively. Browser submissions and provider confirmation used isolated synthetic
fixtures, not live patient requests or external notification delivery.
