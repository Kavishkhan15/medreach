# Local security fixes and verification

Date: 11 October 2026. Repository: `/home/anonymous/medreach`, branch `main`.

This task made no commit, push, deployment, remote database write, remote index creation or environment-file change. During verification another session committed most of the existing implementation (`e444436`) and UI changes (`deaa47f`); those commits were preserved. The remaining working-tree changes are the final unused-email-template cleanup, its regression test and this report. The broader UI suite still has the failures listed below; the complete application is therefore not reported as all-green.

## Security and reliability fixes

| Finding | Implemented behavior |
| --- | --- |
| Contact-change races | Activation, notification verification and password writes use conditional updates against the current contact, account role/state and session version. Contact changes invalidate old invitations, recovery tokens, contact-verification links and sessions. Versionless historical accounts are supported without rewriting them. |
| Repeated Operations requests | Provider Accounts uses a stable validator. All eight Operations resources load independently and retry only their own reads. The account choices state is visible even when no ownership requests exist. |
| Generic activation bypass | Both Users and Provider Accounts reject activation until the representative has accepted an invitation and established credentials. Suspended unactivated accounts can receive a new invitation while remaining inaccessible. Recovery actions reject unavailable accounts and unverified provider contacts. |
| Notification states and recovery | Active sends stay `pending`; sent deliveries reconcile without another email. Recovery works independently of the source's routed marker, checks current recipient eligibility, and makes at most three automatic attempts. Expired in-flight sends and ambiguous SMTP/persistence outcomes become `uncertain` and cannot be blindly replayed. Revoked recipients are cancelled. Ambulance delivery summaries reflect recovery. |
| Incomplete protected hospital listings | System Admin uses `GET /api/admin/hospitals`, including pending/rejected records. Public discovery still excludes them. Overview and verification queues share the non-verified/non-rejected definition. Unpublished records do not link to inaccessible public profiles. |

Additional safeguards:

- Account changes serialize through a renewable database lease. The current System Admin actor is checked after obtaining the lease; account writers check ownership before saving. Concurrent administrator removal and self-lockout are covered by regressions.
- Password changes preserve hashing, use conditional writes and revoke sessions. Recovery messages for Provider Admin go to the verified real contact, separately from the login address.
- Demo credentials remain restricted to the isolated local demo environment with outbound email disabled. Custom passwords are never displayed or inferred.
- Source-backed provider records, assignment checks, requests, tracking, authentication, Careers, email and existing admin failure states remain in place.

## Role cleanup

Only `system_admin`, `provider_admin` and `user` are assignable roles. `/admin` remains the System Admin dashboard.

Removed:

- User Admin hooks, navigation, management branches and all three `/user-admin` pages.
- Undefined/obsolete `USER_ADMIN` role constants and duplicate route guard definitions.
- Four unused legacy administrator/provider notification templates and the unused central-mailbox export. Existing delivery/history records were retained; stored encrypted retry envelopes remain readable by the existing controlled retry mechanism.

Legacy role strings remain storage compatibility only. `admin` and `user_admin` have no global administrative privileges. Existing `hospital_admin` assignments remain narrowly scoped until individually reviewed migration; no bulk account migration was introduced.

## Local data inventory and approved change

The application database was positively identified as standalone local development MongoDB at `127.0.0.1:27017/medreach`. Read-only inventory used the native driver without model initialization or index writes.

Inventory before conversion:

- Three active accounts: one legacy `admin`, two regular `user` accounts.
- No `hospital_admin`, `user_admin` or Provider Admin accounts; no duplicate or explicitly marked disposable demo accounts were identified.
- The administrator was referenced by 30 hospitals, 37 job records and audit/token history.
- No safe, approved deletion targets were identified. Historical healthcare, job/application, request, availability, audit and crawler-provenance records were retained.

The owner explicitly approved conversion of account `6ac28cd398836512dc7f645a`, `admin@medreach.test`, to `system_admin`. Its password hash and all assignments/references were preserved. Eight old refresh sessions were revoked and an audit record was appended.

**Removed accounts/documents: zero.** The two regular users were retained. No other account was converted, reset or overwritten.

The final inventory has one active System Admin and no legacy accounts in this local database. Healthcare/provider, Careers, request, application, availability and historical dataset collection counts did not decrease. Audit/token counts increased through the approved conversion and local development activity. Original healthcare records were not rewritten by this task.

An additional end-of-task count recheck could not connect to `127.0.0.1:27017` (`ECONNREFUSED`). The earlier completed inventory/count comparison remains the latest verified evidence. The application database was not restarted or changed to bypass this blocker.

The actual remote inventory, migration, indexes and deployment remain pending separate approval. No automatic promotion of legacy accounts is permitted.

## SMTP evidence

Existing SMTP settings were used unchanged. The real transport wrapper refused any destination other than the explicitly approved `medreachforyou@gmail.com` inbox.

The completed local SMTP check verified 17 SMTP-accepted messages covering:

- Provider activation, password recovery and password-change confirmation.
- Notification-contact verification.
- Emergency and ordinary hospital bed requests.
- Urgent and ordinary blood requests.
- Explicit emergency and ordinary ambulance bookings; `ambulanceRequired` alone did not trigger System Admin routing.
- User confirmations and a bed-request status update.
- Shared-inbox deduplication.

All test accounts/providers/requests were in a separate disposable `medreach_local_email_test` database on the task-owned local MongoDB instance. Those SMTP fixtures were cleaned up afterwards. No tests mailed unrelated real users or providers.

SMTP acceptance is verified; inbox arrival/read status was not independently inspected. Because all three test roles share the approved inbox, emergency deduplication keeps one System Admin copy for that inbox, while ordinary requests use the provider channel. Separate-address automated regressions verify all configured System Admins and relevant Provider Admin recipients.

Controlled-transport regressions also cover unavailable SMTP, invalid contacts, pending sends, safe retries, changed/revoked recipients, expired leases, ambiguous DATA failures and persistence failures after SMTP acceptance. Token-bearing messages are reissued through account recovery rather than replayed.

## Executed checks

Final totals are recorded in the local logs under `.git/local-security-baseline/`.

| Check | Result |
| --- | --- |
| Full backend database gate | 327 passed, 0 failed, 0 skipped; all database-gated suites enabled on disposable local namespaces |
| Shared admin-state unit tests | 7 passed, 0 failed |
| Bootstrap production build | Passed |
| Tailwind production build | Passed |
| Skeleton production build | Passed |
| Final admin/role browser suite, all three variants | 102 passed, 0 failed, 0 skipped |
| Broad browser suite, all three variants | 225 passed, 6 failed, 24 intentionally skipped |
| ESLint | 0 errors, 15 existing hook warnings |
| Backend JavaScript syntax | 190 files checked; later-edited controllers/services/tests checked again |
| Shared core / Bootstrap mirror | Five affected core modules match exactly |
| Diff whitespace | `git diff --check` passed |
| Local dataset inventory/count comparison | Earlier comparison completed with no healthcare collection decrease; additional final recheck blocked by local MongoDB connection refusal |

No separate TypeScript check is configured for these JavaScript frontends. Backend ESLint is not configured; backend syntax and executable tests were used.

The browser servers started and passed readiness on isolated ports 4100 and 3100–3102, with their own `.next-security-test` build directories. Defaults remain 4000 and 3000–3002. Both MongoDB variable aliases are set consistently in the browser harness. Existing development servers were left running.

Google Maps' live service was blocked by external CORS/configuration errors in the first browser attempt. The completed isolated run used a transient empty map key to verify real API-backed directory data and the graceful map fallback. Live Google Maps rendering still needs separate verification with the actual allowed browser origin; no map configuration or secrets were changed.

## Remaining UI issues and boundaries

The broad run found:

1. Bootstrap desktop logo centering regression: the center was about 77 pixels away from the expected midpoint.
2. Login scroll-visibility failures in Bootstrap's dedicated test and the home-parity test across Bootstrap, Tailwind and Skeleton.
3. Skeleton mobile career-tracking horizontal overflow.

These six test failures involve the concurrently changed navigation/typography styles. Those six `globals.css`/`landing.css` files were not edited, reverted or restored by this security task. The earlier emergency-page work remains unchanged. Admin failure/retry, role restrictions, provider account provisioning, healthcare journeys and assistant journeys passed in the isolated run.

The local System Admin currently has no enabled verified notification contact. Configure and verify its intended emergency inbox through Users before relying on live emergency delivery. The SMTP checks used separate test accounts and did not silently alter this existing account's notification settings.

SMTP cannot provide an unconditional exactly-once guarantee after a lost acknowledgement. Uncertain sends require inbox verification before preparing a fresh message. Historical delivery recipients/envelopes should be reviewed during the separately approved remote inventory rather than automatically rebroadcast.

Deployment and pushing require explicit approval. Resolve the unrelated UI regressions and verify the intended remote System Admin access path before declaring the whole product ready.

The application MongoDB must be available again for local application startup and a fresh data-count comparison. The isolated test database was separate from it.

## Files changed by this security task

The list below excludes unrelated concurrent styling changes and earlier untouched role/fallback work. Existing files were extended in place.

```text
LOCAL_SECURITY_VERIFICATION.md
.gitignore
eslint.config.mjs
playwright.config.mjs
backend/scripts/verifyLocalNotifications.js
scripts/verify-backend-tests.mjs
tests/e2e/assistant-ui.spec.js
tests/e2e/critical-journeys.spec.js
tests/e2e/navbar-design.spec.js
tests/e2e/security-hardening.spec.js
tests/e2e/stability-polish.spec.js
variants/bootstrap/next.config.mjs
variants/tailwind/next.config.mjs
variants/skeleton/next.config.mjs
ROLE_RESTRUCTURING.md
backend/scripts/roleInventory.js
backend/src/config/constants.js
backend/src/controllers/adminUserController.js
backend/src/controllers/authController.js
backend/src/controllers/hospitalController.js
backend/src/controllers/notificationContactController.js
backend/src/controllers/ownershipController.js
backend/src/controllers/providerActivationController.js
backend/src/controllers/providerAdminController.js
backend/src/models/AmbulanceBooking.js
backend/src/models/EmailDelivery.js
backend/src/models/RequestNotification.js
backend/src/models/User.js
backend/src/routes/admin.js
backend/src/services/adminMutationGuard.js
backend/src/services/ambulanceDeliveryState.js
backend/src/services/emailService.js
backend/src/services/notificationContacts.js
backend/src/services/requestNotificationWorker.js
backend/src/services/requestNotifications.js
backend/test/authSecurity.mongo.test.js
backend/test/localSecurity.mongo.test.js
backend/test/roleRestructuring.mongo.test.js
backend/test/workflowsVerification.test.js
docs/api.md
docs/architecture.md
docs/security-verification.md
packages/core/src/adminState.js
packages/core/src/api.js
packages/core/src/constants.js
packages/core/src/hooks.js
scripts/e2e-seed.mjs
tests/e2e/admin-reliability.spec.js
tests/e2e/bed-request-lifecycle.spec.js
tests/e2e/roles.spec.js
variants/bootstrap/_core/adminState.js
variants/bootstrap/_core/api.js
variants/bootstrap/_core/constants.js
variants/bootstrap/_core/hooks.js
variants/bootstrap/app/admin/audit/page.js
variants/bootstrap/app/admin/hospitals/page.js
variants/bootstrap/app/admin/operations/page.js
variants/bootstrap/app/admin/provider-accounts/page.js
variants/bootstrap/app/admin/provider-approvals/page.js
variants/bootstrap/app/admin/security/page.js
variants/bootstrap/app/admin/users/page.js
variants/bootstrap/app/admin/verification/page.js
variants/bootstrap/app/user-admin/page.js
variants/bootstrap/components/AccountSidebar.js
variants/bootstrap/components/AdminGuard.js
variants/bootstrap/components/AdminNav.js
variants/skeleton/app/admin/audit/page.js
variants/skeleton/app/admin/hospitals/page.js
variants/skeleton/app/admin/operations/page.js
variants/skeleton/app/admin/provider-accounts/page.js
variants/skeleton/app/admin/provider-approvals/page.js
variants/skeleton/app/admin/security/page.js
variants/skeleton/app/admin/users/page.js
variants/skeleton/app/admin/verification/page.js
variants/skeleton/app/user-admin/page.js
variants/skeleton/components/AdminGuard.js
variants/skeleton/components/AdminNav.js
variants/skeleton/components/Navbar.js
variants/tailwind/app/admin/audit/page.js
variants/tailwind/app/admin/hospitals/page.js
variants/tailwind/app/admin/operations/page.js
variants/tailwind/app/admin/provider-accounts/page.js
variants/tailwind/app/admin/provider-approvals/page.js
variants/tailwind/app/admin/security/page.js
variants/tailwind/app/admin/users/page.js
variants/tailwind/app/admin/verification/page.js
variants/tailwind/app/user-admin/page.js
variants/tailwind/components/AdminGuard.js
variants/tailwind/components/AdminNav.js
variants/tailwind/components/Navbar.js
```
