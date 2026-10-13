# MedReach full-stack implementation and local verification

Date: 11 October 2026. Repository: `/home/anonymous/medreach`, branch `main`.

## Scope and safety

No commits, pushes, deployments, remote database operations, environment-file changes or SMTP configuration changes were performed. Existing uncommitted security, styling, MongoDB setup and documentation work was preserved. Frontend changes extend the existing design instead of replacing it.

The confirmed decision is to keep shared demo credentials pending and preserve the existing demo guard. The recovered dataset is not designated as an isolated demo database.

## Completed functionality

- All three homepages embed **Join the MedReach Network** immediately after Using MedReach and above the footer. The responsive form validates required organisation/contact fields, prevents duplicate submission, uses persistent backend storage, and distinguishes confirmed receipt from unavailable/malformed responses. The older registration route redirects to the embedded section.
- Guest submissions are rate-limited and normalised. A private unique submission fingerprint includes city and collapses repeated and concurrent submissions without exposing another applicant's details. No account access or public organisation is granted by submission.
- System Admin approval automatically reserves/creates the organisation and provisions its organisation-specific account and explicit assignment. Repeated approvals/rejections reuse the decision; conflicting decisions fail safely. Matching existing organisations require manual ownership review; matching ignores case and spacing and treats missing historical city information conservatively.
- Onboarding confirmation, System Admin notification, activation invitation and decision emails use the existing delivery mechanism. Recovery is bounded, historical applications are not rebroadcast, and uncertain sends are not blindly repeated.
- Only `system_admin`, `provider_admin` and `user` remain assignable. Existing historical compatibility and scoped permission checks remain; no legacy global administrator privileges were added. `/admin` remains the System Admin dashboard.
- System Admin navigation includes Provider Approvals, Provider Accounts, Emergency Requests and Activity & Settings. Emergency panels independently distinguish loading, error/retry, genuine empty and actual records. Only explicit emergencies qualify.
- Provider workspace preserves organisation switching, contact management, hospital evidence/availability and Careers. Assigned blood and ambulance requests now support guarded status transitions, atomic stale-write checks and user status notifications. Reports use actual organisation-specific request/application/observation counts and reject unrelated providers.
- Regular-user navigation and request history include blood requests, blood donation pledges, ambulance requests and existing bed requests, with independent loading/error/retry states and private tracking links.
- Desktop logo/navigation spacing, login scroll visibility and temporary breakpoint overflow were corrected. Map information popups do not steal focus from navigation or directory controls. Mobile Escape handling takes priority while the menu is open. Map keys, map IDs and provider data were not changed.
- The Bootstrap-local core mirror and shared core remain aligned. Each variant retains native framework styling. No new packages, decorative assets, videos or unrelated redesign were added.

## Recovered database and backup verification

Canonical storage: `/home/anonymous/medreach/data`. `mongod` is active and enabled for automatic startup.

Backup: `/home/anonymous/.local/share/medreach-recovery/fullstack-20261011/before-provider-provisioning.archive.gz`.

SHA-256: `d0c05bb3660a0f6ae8f3e9b09fcfd36d1c06611e7eeb1032b37b2ae45f21b415`.

The backup was restored into a newly owned disposable local verification namespace, compared against the canonical dataset, and only that verification namespace was removed. All original documents in 34 collections were present and unchanged, including all original user/password documents. All original indexes were retained.

| Records | Before | After | Meaning |
| --- | ---: | ---: | --- |
| Users | 3 | 59 | Original 3 unchanged; 56 new pending provider accounts |
| Hospitals | 30 | 30 | All original documents unchanged |
| Resource providers | 28 | 28 | All original documents unchanged |
| Jobs | 256 | 256 | All original documents unchanged |
| Provider memberships | 0 | 56 | New explicit assignments |
| Audit records | 476 | 588 | Original history retained; provisioning activity appended |

Readiness and hospital discovery returned HTTP 200 against the recovered database; hospital discovery reported total 30. A controlled API harness avoided background mutation workers and mail delivery during this read-only check. Production server startup was exercised by the isolated browser harness. The newly owned `medreach_focus_e2e` and `medreach_fallback_e2e` and `medreach_onboarding_final_e2e` fixture databases were removed after tests; the existing default `medreach_e2e` fixture namespace was retained. SMTP and backup-verification namespaces were also cleaned up.

## Accounts: created versus login verified

[LOCAL_PROVIDER_ACCOUNTS.md](LOCAL_PROVIDER_ACCOUNTS.md) lists every exact username, organisation identifier, assignment and pending status.

**Created:** 56 Provider Admin accounts for clearly identified approved organisations. These accounts have no password hash, no verified notification contact and no active sessions. No invitations were sent to historical provider contacts. Interrupted provisioning can resume missing assignments without replacing credentials or reactivating disabled assignments.

**Login verified using isolated test accounts:** System Admin, activated Provider Admin and registered regular User through actual backend endpoints and browser flows. Cross-provider access, unauthorised role operations and unactivated login were tested.

**Not completed in the recovered database:** Shared demo credentials, changing `admin@medreach.test` to `admin@medreach.com`, and login/activation of the 56 pending accounts. The original active System Admin account and its password hash were left unchanged; its password was not guessed.

**Ownership review required:** Tata Memorial Advanced Diagnostic & Pathology Lab, and State Blood Transfusion Council (SBTC) / KEM Central Blood Bank. Their possible hospital relationships are text hints rather than explicit ownership links. No account was invented for either.

## SMTP checks actually executed

Only `medreachforyou@gmail.com` was used, with isolated local test accounts and the unchanged existing SMTP configuration.

- Onboarding: 4 SMTP-accepted messages (submission confirmation, System Admin notice, provider activation and approval decision). Replayed approval sent no duplicate mail.
- Healthcare/account workflows: 17 SMTP-accepted messages. Tests exercised activation, provider password recovery, notification-contact verification, emergency/ordinary bed, blood and ambulance routing, user confirmations, bed status update and shared-inbox deduplication.
- Controlled transport regressions additionally cover invalid contacts, unavailable SMTP, bounded retries, revoked/changed recipients, ambiguous delivery and persistence failures after SMTP acceptance.

SMTP acceptance is verified. Inbox arrival/read status is **not** verified. Shared test inboxes are intentionally deduplicated; independent-address regression fixtures verify distinct eligible System Admin/provider recipients. No messages went to unrelated existing users or providers.

## Verification

- Full backend database-gated suite: **337 passed, 0 failed, 0 skipped**.
- Latest source production builds: Bootstrap, Tailwind and Skeleton passed; separate transient test builds also cover Maps unavailable.
- ESLint: **0 errors, 15 pre-existing hook warnings**.
- Backend syntax: **19 changed/new JavaScript files passed**.
- Four changed shared-core/Bootstrap mirror files match exactly.
- `git diff --check` passed.
- Final onboarding browser rerun against the latest backend: **9 passed**, covering success, approval/provisioning, responsive views, service outages and malformed-receipt retries across all three variants.
- Live-map-enabled focused navbar regression: **3 passed**, one per variant.
- Broader live-map-enabled browser run before the final focus correction: **226 passed, 11 failed, 24 intentionally skipped**. Three navigation focus failures were fixed and rechecked. The other failures involved Google Maps demo quota exhaustion/SDK errors. API keys and hosting configuration were preserved.
- Final complete browser suite with transient Maps-unavailable test configuration: **240 passed, 0 failed, 24 intentionally skipped**. This tests the graceful fallback with actual API-backed directory records; it does not establish uninterrupted live Google Maps availability.

No separate TypeScript check is configured for these JavaScript frontends. No coverage measurement was run. Existing Bootstrap-specific layout tests intentionally skip Tailwind/Skeleton; cross-variant journeys remain enabled.

Logs are local in `/tmp/medreach-final-backend.log`, `/tmp/medreach-focus-build.log`, `/tmp/medreach-final-lint.log`, `/tmp/medreach-final-browser.log`, `/tmp/medreach-focus-browser.log`, `/tmp/medreach-fallback-browser.log`, `/tmp/medreach-final-onboarding-smtp.log` and `/tmp/medreach-final-workflow-smtp.log`.

## Remaining manual actions and deployment considerations

1. Review the two ambiguous organisation ownership relationships.
2. Verify real notification contacts before inviting the pending provider accounts. Use secure activation and individual passwords; do not put shared demo passwords into the recovered database.
3. The original System Admin has no configured verified emergency notification contact. Configure/verify its intended contact through the existing account flow before relying on live emergency email. It was not silently enabled during this task.
4. Google Maps demo quota prevented a completely clean broad live-service run. Validate live Maps with the intended configured account/origin after quota is available. The unavailable-map fallback remains separately tested.
5. Production disables automatic schema/index creation. A separately reviewed and authorised rollout must establish the new sparse unique provider-application fingerprint index before relying on concurrent public-submission deduplication. No production migration or remote index creation was performed.
6. Approval and account provision writes are retryable rather than a multi-document transaction. Interrupted pending organisations remain unpublished; retry or explicitly review partial state. Ambiguous SMTP outcomes require inbox verification before a new message is prepared.
7. Live blood stock, diagnostics capacity and ambulance dispatch availability are not reported by the existing data/API. The interface reports this limitation rather than inventing availability.
8. Committing, pushing and deployment require separate approval.

## Implementation files and working-tree attribution

The following files are changed or newly added. A dagger marks files with pre-existing edits that were preserved/extended. Local MongoDB setup files and prior verification documents also remain uncommitted and were not replaced.

- `.gitignore` †
- `README.md` †
- `backend/src/controllers/providerAdminController.js`
- `backend/src/models/AmbulanceBooking.js`
- `backend/src/models/BloodRequest.js`
- `backend/src/models/ProviderApplication.js`
- `backend/src/routes/bloodRequestRoutes.js`
- `backend/src/routes/providerAdmin.js`
- `backend/src/routes/resources.js`
- `backend/src/services/demoAccounts.js`
- `backend/src/services/emailService.js` †
- `backend/src/services/providerAccounts.js`
- `backend/src/services/requestNotificationWorker.js`
- `backend/test/localSecurity.mongo.test.js` †
- `backend/test/roleRestructuring.mongo.test.js`
- `eslint.config.mjs`
- `packages/core/src/adminState.js`
- `packages/core/src/authNavigation.js`
- `packages/core/src/index.js`
- `tests/e2e/assistant-ui.spec.js`
- `tests/e2e/critical-journeys.spec.js`
- `tests/e2e/home-parity.spec.js`
- `tests/e2e/navbar-design.spec.js`
- `variants/bootstrap/_core/adminState.js`
- `variants/bootstrap/_core/authNavigation.js`
- `variants/bootstrap/_core/index.js`
- `variants/bootstrap/app/admin/provider-approvals/page.js`
- `variants/bootstrap/app/dashboard/page.js`
- `variants/bootstrap/app/globals.css` †
- `variants/bootstrap/app/page.js`
- `variants/bootstrap/app/provider/page.js`
- `variants/bootstrap/app/provider/register/page.js`
- `variants/bootstrap/app/requests/page.js`
- `variants/bootstrap/components/AdminNav.js`
- `variants/bootstrap/components/GoogleMapView.js`
- `variants/bootstrap/components/Navbar.js`
- `variants/skeleton/app/admin/provider-approvals/page.js`
- `variants/skeleton/app/dashboard/page.js`
- `variants/skeleton/app/globals.css` †
- `variants/skeleton/app/page.js`
- `variants/skeleton/app/provider/page.js`
- `variants/skeleton/app/provider/register/page.js`
- `variants/skeleton/app/requests/page.js`
- `variants/skeleton/components/AdminNav.js`
- `variants/skeleton/components/GoogleMapView.js`
- `variants/skeleton/components/Navbar.js`
- `variants/tailwind/app/admin/provider-approvals/page.js`
- `variants/tailwind/app/dashboard/page.js`
- `variants/tailwind/app/globals.css` †
- `variants/tailwind/app/page.js`
- `variants/tailwind/app/provider/page.js`
- `variants/tailwind/app/provider/register/page.js`
- `variants/tailwind/app/requests/page.js`
- `variants/tailwind/components/AdminNav.js`
- `variants/tailwind/components/GoogleMapView.js`
- `variants/tailwind/components/Navbar.js`
- `LOCAL_PROVIDER_ACCOUNTS.md`
- `backend/scripts/provisionExistingProviders.js`
- `backend/scripts/verifyOnboardingEmail.js`
- `backend/src/services/providerApplicationNotifications.js`
- `backend/src/services/providerReport.js`
- `backend/src/services/providerRequestStatus.js`
- `backend/test/onboarding.mongo.test.js`
- `packages/core/src/providerApplication.js`
- `tests/e2e/onboarding.spec.js`
- `variants/bootstrap/_core/providerApplication.js`
- `variants/bootstrap/app/admin/emergency/page.js`
- `variants/bootstrap/components/ProviderApplicationForm.js`
- `variants/bootstrap/components/ProviderApplicationForm.module.css`
- `variants/bootstrap/components/ServiceRequestHistory.js`
- `variants/skeleton/app/admin/emergency/page.js`
- `variants/skeleton/components/ProviderApplicationForm.js`
- `variants/skeleton/components/ProviderApplicationForm.module.css`
- `variants/skeleton/components/ServiceRequestHistory.js`
- `variants/tailwind/app/admin/emergency/page.js`
- `variants/tailwind/components/ProviderApplicationForm.js`
- `variants/tailwind/components/ProviderApplicationForm.module.css`
- `variants/tailwind/components/ServiceRequestHistory.js`

Reference for explicit popup focus control: [official React Google Maps InfoWindow documentation](https://visgl.github.io/react-google-maps/docs/api-reference/components/info-window#shouldfocus-boolean).
