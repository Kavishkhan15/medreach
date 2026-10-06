# MedReach implementation inventory

Current repository state, updated 2026-10-07. This is a capability/gap inventory,
not proof of live deployment or provider participation. [Release QA](release-qa.md)
is the canonical owner of current test counts, commands and verification limits.

## Implemented

| Area | Implementation |
| --- | --- |
| Architecture | Shared Express/Mongoose backend, MongoDB, shared core client/ranking/hooks, three active Next.js frontends with distinct designs |
| Discovery | Hospitals/details, search, geo directories/maps, source/freshness/verification, saved hospitals and contact/directions |
| Provenance | Per-source facility and hospital-field claims, evidence, conflicts/review history, verified recent observations for current availability |
| Bed coordination | Guest emergency and signed-in standard requests, assigned staff review/information/accept/reject/complete, patient reply/cancel, expiry and timeline |
| Resources | Blood-bank/diagnostic/ambulance listings, separate standard/urgent blood and donation records, durable ambulance bookings and delivery state |
| Careers | Moderated jobs and organization applications, persisted unique public references, dashboard/confirmation tracking and staff review |
| Tracking | Public reference-only status for blood, bed, career and ambulance; private detail/mutation authorization retained |
| Accounts | Password login, region onboarding, recovery/verification, rotating/revocable sessions and system-only account administration |
| Staff ownership | Evidence submission and manual ownership review before hospital access is assigned |
| Email | Delivery records, safe failure metadata, eligible encrypted retries, patient status history and bounded submission email concurrency |
| Dashboard resilience | Independent saved/profile, request and application fetching with targeted retry |
| Existing dataset | MongoDB provider records, source claims, historical observations and provenance remain available through Express APIs; acquisition code has been removed |
| Operations | Scoped hospital staff, verification/conflicts, claim/resource/job controls, analytics and audit |
| Shutdown | HTTP and worker drain before MongoDB disconnect, unready state, repeated-signal handling and deadline |
| Assistant | Compact responsive panel, real backend resource actions, deterministic default and optional server-side providers |
| QA | Strict database gate, three production builds, browser journeys and backup/restore tooling |
| Cloud deployment preparation | Vercel frontends, always-running Railway Express API with request-expiry worker, bounded Atlas connection pool and verified database-copy tooling; [cloud setup](cloud-deployment.md) still required |

## Remaining limits

- **Live deployment:** hosted API/public URLs, CORS, cookies, health, `/track`,
  real SMTP mailbox receipt and remote CI require their
  own verification. Local tests do not prove these integrations.
- **Care coordination:** requests do not reserve beds, establish blood inventory,
  prove hospital participation or confirm ambulance dispatch.
- **Evidence:** historical records can lack verbatim excerpts; keyword extraction
  needs human interpretation. Unreviewed conflicts stay visible and unknown.
- **Recovery:** saved primary state survives secondary failures, but there is no
  transactional outbox replay for an audit/email intent lost before it could be
  stored. The email concurrency cap is per request, not global SMTP rate control.
- **Research/accessibility:** placeholder scoring and preliminary bundle numbers
  are not current empirical results. Controlled datasets, broad assistive-tech
  testing and participant studies remain separate work.

## Intentional removals and retained behavior

Google OAuth, in-app notifications and crawler execution are removed. Existing MongoDB
provider/provenance documents are retained. Password login and all emails
remain. Map was removed from the navbar only; `/map`, the homepage Full Map View
link and integration remain. SOS is the only floating launcher; assistant
functionality remains through its existing entry actions. Recreating removed
features requires a new product decision.

## Historical evidence

The 2026-09-14 fusion milestone had 64 ordinary backend passes/four opt-in skips,
four separate Mongo integration checks and 100 crawler passes/ten live skips.
Those numbers and database-specific observations describe that historical
snapshot only. See [fusion report](Hospital_Data_Fusion_Verification_Report.md)
and [current release QA](release-qa.md) rather than treating old local backups or
provider counts as current product state.
