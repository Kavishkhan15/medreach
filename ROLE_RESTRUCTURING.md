# MedReach role restructuring

## Implementation status

Code changes are local and uncommitted. No deployment, production account migration, production database write or environment change has been performed.

The local development target was confirmed as standalone MongoDB at `127.0.0.1:27017/medreach`. The owner approved conversion of exactly `admin@medreach.test` to `system_admin`, preserving its password hash, 30 hospital assignments, job references and audit history. Eight old sessions were revoked. No accounts or healthcare records were deleted. Production inventory and migration remain pending separate approval.

## Permissions

| Role | Scope |
| --- | --- |
| `system_admin` | Entire platform: providers, approvals, accounts, careers moderation, requests, security, reports and email operations |
| `provider_admin` | Active explicit memberships in hospitals, blood banks, diagnostics or ambulance organisations; contact information, permitted hospital workflows, scoped requests and careers/applicant management |
| `user` | Existing public and personal healthcare workflows |

Backend checks enforce scope for reads and writes, including direct resource IDs, applications and request details. UI visibility is a convenience, not a permission boundary. Assignment and account changes revoke sessions. System Admin cannot disable or demote their own account, or remove the last active System Admin. A database lease serializes account-access mutations across API processes; contention returns a retryable conflict. Its five-minute lease recovers after a crashed process, renews while processing, and checks ownership before account writes. The actor is rechecked inside the account mutation guard.

### Legacy roles

There is no separate obsolete global-admin page. `/admin` remains the main System Admin dashboard. The legacy `admin` global grants and navigation have been removed. The three legacy values (`admin`, `hospital_admin`, `user_admin`) remain readable by the schema to avoid rewriting existing accounts. Existing `hospital_admin` accounts retain only their previous hospital assignment scope until a separately approved migration. Legacy roles cannot be newly assigned by the role-management API. The obsolete `/user-admin` pages and navigation were removed from all variants. Retired `user_admin` accounts have no administrative privileges; proposed conversion to `user` requires individual review.

## Provider onboarding and accounts

- A signed-in representative submits an organisation at `/provider/register`.
- System Admin reviews at `/admin/provider-approvals`; approval creates a new organisation and separate Provider Admin account. The original submitting user remains unchanged.
- New organisations stay unpublished until approval and account provisioning complete. Existing records without the new approval flag remain visible unchanged.
- `/admin/provider-accounts` supports explicit approval of existing organisations, new account provisioning, additional assignments, revocation/restoration, activation/deactivation, invitation reissue, recovery and verified notification-contact configuration.
- Hospital ownership review can explicitly select an active Provider Admin account, preserving the original claimant and avoiding implicit promotion.
- New non-demo accounts are pending, with no shared default password. A short-lived single-use invitation goes to the real representative contact, who chooses a personal password. Account creation is distinct from invitation delivery and activation. Failed or disabled email is shown accurately.
- Email collisions are conflicts; existing accounts, password hashes and assignments are never overwritten by provisioning. Repeated provisioning keys can resume partial creation without replacing credentials.
- Provider passwords are bcrypt hashes. Authentication/reset/verification tokens are stored as hashes. Email envelopes containing activation or contact-verification tokens are not retained for replay.

### Isolated demo accounts

`backend/scripts/provisionDemoAccounts.js --demo` is an explicit, non-destructive helper. It refuses production, remote databases, an enabled email transport or any database outside the narrow local demo naming convention. It skips existing accounts and operates on existing approved demo organisations.

Approved demo login: `admin@medreach.com`; provider logins use `admin@<organisation>-<stable-id>.example`. The approved shared defaults are defined only in the gated server-side demo helper. Database records and audit logs never contain plaintext passwords. Account views expose a demo-default label only in the isolated demo database; after a password change they show “Custom password set,” never the custom password. Login addresses are separate from real notification addresses.

## Notifications

- Explicit emergency bed requests, urgent blood requisitions and explicitly marked emergency ambulance bookings notify every active, opted-in System Admin with a verified notification address and the relevant configured Provider Admins.
- Ordinary requests, donation pledges and careers submissions notify the relevant configured provider representatives only. Retired support accounts do not receive routine request notifications.
- `ambulanceRequired` alone does not classify a request as an emergency.
- Existing user confirmations and status updates remain intact.
- Notification contacts require verification; changing an address invalidates verification, old invitations, recovery tokens and sessions. Final activation/reset writes compare the contact, role, account state and session version, including older versionless records. Password recovery for Provider Admin uses the verified contact and binds its token to that address.
- A durable `RequestNotification` intent and existing `EmailDelivery` infrastructure support deduplication, recipient eligibility checks on retry and accurate delivery states. A small recovery worker resumes notification routing only for newly opted-in requests. It never rebroadcasts historical requests. In-flight sends remain pending. Confirmed failures receive up to three automatic attempts, with eligibility checked again before retry. An expired send lease or ambiguous SMTP outcome becomes `uncertain`; automatic and manual replay is blocked. Operators must check the recipient inbox before preparing a fresh message. Recipients sharing an inbox are deduplicated; emergency System Admin routing takes priority for that shared inbox.
- No eligible configured recipient is reported honestly; no fallback to a central demo mailbox. SMTP outages do not discard the saved request.

## Routes and data additions

New API groups: `/api/admin/provider-accounts`, `/api/admin/provider-approvals`, `/api/providers`.

New authentication actions: `/api/auth/activate-provider`, `/api/auth/verify-notification-email`.

Notification settings: `PATCH /api/admin/users/:id/notifications` (System Admin only).

New frontend routes in all three variants: `/provider`, `/provider/jobs`, `/provider/register`, `/admin/provider-accounts`, `/admin/provider-approvals`, `/activate-provider`, `/verify-notification-email`.

New collections/models: `ProviderMembership`, `ProviderApplication`, `RequestNotification`, `AdminMutationLock`. Optional account, approval, delivery and request-routing fields preserve older records. No healthcare data was transformed, reseeded or migrated. Only the separately approved local administrator role conversion and session revocation were applied.

## Read-only inventory and rollout boundary

`node backend/scripts/roleInventory.js` uses the native MongoDB driver without model initialization or index writes. It outputs existing legacy accounts, hospital assignments, proposed mappings, active System Admins and collection counts. It contains no apply path.

- Legacy `admin`: manual review; never automatically proposed for System Admin promotion.
- Active `hospital_admin` with hospital assignments: proposed `provider_admin`, retaining every assignment and the existing password hash.
- Inactive, unknown-status or unassigned hospital accounts: manual review.
- If no active System Admin exists, the report flags lockout risk.

Before any deployment, the owner must review the actual inventory and separately approve named account mappings, preservation of assignments and a verified System Admin access path. Do not deploy the removal of legacy global permissions before ensuring an approved active System Admin can sign in. A read-only inventory is not a migration or backup.

## Known backend boundaries

The existing API does not offer blood fulfillment or ambulance booking-status mutations. Provider workspace displays recorded requests and contact information without inventing fulfillment controls or confirmed availability. Provider contact updates do not claim to verify healthcare capabilities. Automated tests use disposable local databases and controlled transports. The separate real SMTP check sends exclusively to the explicitly approved inbox, using the existing SMTP configuration. SMTP acceptance is verified; inbox arrival is not independently read.

## Verification

See the completion report for the final executed test and build totals. All database-dependent automated checks use disposable local test namespaces, separate from the configured application dataset. Local healthcare collection counts were compared to the inventory and did not decrease. Actual remote counts remain unverified.

## Files changed for role restructuring

The list below excludes unchanged pre-existing dirty files. Existing admin error-state files were extended in place; their earlier changes remain.

- `backend/scripts/provisionDemoAccounts.js`
- `backend/scripts/roleInventory.js`
- `backend/src/app.js`
- `backend/src/config/constants.js`
- `backend/src/controllers/adminUserController.js`
- `backend/src/controllers/authController.js`
- `backend/src/controllers/bloodCampaignController.js`
- `backend/src/controllers/bloodRequestController.js`
- `backend/src/controllers/careersController.js`
- `backend/src/controllers/emergencyRequestController.js`
- `backend/src/controllers/hospitalController.js`
- `backend/src/controllers/notificationContactController.js`
- `backend/src/controllers/organizationCareersController.js`
- `backend/src/controllers/ownershipController.js`
- `backend/src/controllers/providerActivationController.js`
- `backend/src/controllers/providerAdminController.js`
- `backend/src/controllers/resourceController.js`
- `backend/src/middleware/auth.js`
- `backend/src/models/AmbulanceBooking.js`
- `backend/src/models/AuthToken.js`
- `backend/src/models/BloodRequest.js`
- `backend/src/models/EmailDelivery.js`
- `backend/src/models/EmergencyRequest.js`
- `backend/src/models/Hospital.js`
- `backend/src/models/OwnershipClaim.js`
- `backend/src/models/ProviderApplication.js`
- `backend/src/models/ProviderMembership.js`
- `backend/src/models/RequestNotification.js`
- `backend/src/models/ResourceProvider.js`
- `backend/src/models/User.js`
- `backend/src/routes/admin.js`
- `backend/src/routes/alertRoutes.js`
- `backend/src/routes/analytics.js`
- `backend/src/routes/authRoutes.js`
- `backend/src/routes/availability.js`
- `backend/src/routes/bloodCampaignRoutes.js`
- `backend/src/routes/careers.js`
- `backend/src/routes/hospitalRoutes.js`
- `backend/src/routes/organizationCareers.js`
- `backend/src/routes/providerAdmin.js`
- `backend/src/routes/refinement.js`
- `backend/src/routes/resources.js`
- `backend/src/server.js`
- `backend/src/services/adminMutationGuard.js`
- `backend/src/services/ambulanceDeliveryState.js`
- `backend/src/services/assistantTools.js`
- `backend/src/services/authTokenService.js`
- `backend/src/services/bedRequestEmails.js`
- `backend/src/services/careerJobSeeder.js`
- `backend/src/services/demoAccounts.js`
- `backend/src/services/emailService.js`
- `backend/src/services/emergencyRequestService.js`
- `backend/src/services/hospitalAccess.js`
- `backend/src/services/hospitalEnrichmentService.js`
- `backend/src/services/notificationContacts.js`
- `backend/src/services/ownershipService.js`
- `backend/src/services/providerAccess.js`
- `backend/src/services/providerAccounts.js`
- `backend/src/services/providerInvitation.js`
- `backend/src/services/requestNotificationWorker.js`
- `backend/src/services/requestNotifications.js`
- `backend/test/ambulanceBooking.test.js`
- `backend/test/authSecurity.mongo.test.js`
- `backend/test/bedRequestLifecycle.mongo.test.js`
- `backend/test/careerReference.mongo.test.js`
- `backend/test/emailLatency.mongo.test.js`
- `backend/test/hospitalAccess.test.js`
- `backend/test/models.test.js`
- `backend/test/product.mongo.test.js`
- `backend/test/roleRestructuring.mongo.test.js`
- `backend/test/workflowsVerification.test.js`
- `docs/api.md`
- `docs/architecture.md`
- `docs/security-verification.md`
- `packages/core/src/adminState.js`
- `packages/core/src/constants.js`
- `packages/core/src/hooks.js`
- `scripts/e2e-seed.mjs`
- `tests/e2e/navbar-design.spec.js`
- `tests/e2e/roles.spec.js`
- `variants/bootstrap/_core/adminState.js`
- `variants/bootstrap/_core/constants.js`
- `variants/bootstrap/_core/hooks.js`
- `variants/bootstrap/app/activate-provider/page.js`
- `variants/bootstrap/app/admin/operations/page.js`
- `variants/bootstrap/app/admin/provider-accounts/page.js`
- `variants/bootstrap/app/admin/provider-approvals/page.js`
- `variants/bootstrap/app/admin/users/page.js`
- `variants/bootstrap/app/hospital/jobs/page.js`
- `variants/bootstrap/app/provider/jobs/page.js`
- `variants/bootstrap/app/provider/page.js`
- `variants/bootstrap/app/provider/register/page.js`
- `variants/bootstrap/app/verify-notification-email/page.js`
- `variants/bootstrap/components/AccountSidebar.js`
- `variants/bootstrap/components/AdminGuard.js`
- `variants/bootstrap/components/AdminNav.js`
- `variants/bootstrap/components/AmbulanceBookingModal.js`
- `variants/skeleton/app/activate-provider/page.js`
- `variants/skeleton/app/admin/operations/page.js`
- `variants/skeleton/app/admin/provider-accounts/page.js`
- `variants/skeleton/app/admin/provider-approvals/page.js`
- `variants/skeleton/app/admin/users/page.js`
- `variants/skeleton/app/hospital/jobs/page.js`
- `variants/skeleton/app/provider/jobs/page.js`
- `variants/skeleton/app/provider/page.js`
- `variants/skeleton/app/provider/register/page.js`
- `variants/skeleton/app/verify-notification-email/page.js`
- `variants/skeleton/components/AdminGuard.js`
- `variants/skeleton/components/AdminNav.js`
- `variants/skeleton/components/AmbulanceBookingModal.js`
- `variants/skeleton/components/Navbar.js`
- `variants/tailwind/app/activate-provider/page.js`
- `variants/tailwind/app/admin/operations/page.js`
- `variants/tailwind/app/admin/provider-accounts/page.js`
- `variants/tailwind/app/admin/provider-approvals/page.js`
- `variants/tailwind/app/admin/users/page.js`
- `variants/tailwind/app/hospital/jobs/page.js`
- `variants/tailwind/app/provider/jobs/page.js`
- `variants/tailwind/app/provider/page.js`
- `variants/tailwind/app/provider/register/page.js`
- `variants/tailwind/app/verify-notification-email/page.js`
- `variants/tailwind/components/AdminGuard.js`
- `variants/tailwind/components/AdminNav.js`
- `variants/tailwind/components/AmbulanceBookingModal.js`
- `variants/tailwind/components/Navbar.js`

### Additional retirement check

Blood campaign publication and approval controls are System Admin-only in each variant. Legacy accounts retain the public proposal flow and do not fetch the pending approval queue.

- `variants/bootstrap/app/blood-banks/page.js`
- `variants/tailwind/app/blood-banks/page.js`
- `variants/skeleton/app/blood-banks/page.js`

### Legacy development scripts

The old dataset seeder no longer creates the retired global `admin` role. It now refuses non-isolated databases before deleting or inserting records, and its demo System Admin uses the gated demo helper. It was not executed. Existing-data environments must use the non-destructive provisioning workflow; do not run dataset seeders against real data.

- `backend/scripts/seed.js`
- `backend/scripts/seedProductDemo.js`

## Local security completion

See [LOCAL_SECURITY_VERIFICATION.md](LOCAL_SECURITY_VERIFICATION.md) for the current fixes, executed checks, local account conversion, email evidence and remaining browser issues. Older verification totals have been replaced by that report.

Protected hospital administration now uses `GET /api/admin/hospitals`. This includes pending and rejected records, while public discovery continues to exclude them. The verification queue counts non-verified, non-rejected records; all frontend queues use the same definition. Unpublished rows do not link to unavailable public profiles.

Operations resources load independently. The Provider Accounts validator is stable, and each resource has its own loading, empty, error and Retry behavior. No production audit fixtures or fake fallback counts were restored.

Browser validation can use separate local ports and `.next-security-test` build directories to avoid collisions with a running development server. Default production and development settings remain unchanged; no environment files or deployment settings were edited.
