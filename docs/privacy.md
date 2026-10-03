# Privacy and Stored Data

MedReach stores personal data and may store sensitive health-related information submitted in requests. The account profile is small, but the whole platform does **not** satisfy a “no medical/PHI data stored” claim. This document describes current behavior, not a regulatory compliance certification.

## Data held in MongoDB

| Area | Stored information |
|------|--------------------|
| Account | Email, name, password hash, region, emergency contact, role/status, verification/login timestamps and saved hospital references |
| Sessions and recovery | Hashed tokens, expiry/use/revocation metadata, refresh families and hashed client fingerprints |
| Bed requests | Contact phone/email, hospital and facility, emergency category, optional age group/patient reference/summary, locality, transport pickup address, staff responses and patient/staff timeline notes |
| Blood requests/pledges | Patient/donor name, blood group, requested units/urgency, optional hospital/doctor/general notes, contact details; donor age/weight/preferred date when supplied |
| Ambulance bookings | Patient name/age, contact details, pickup address and notes, selected provider snapshot, booking and per-recipient email states |
| Career applications | Applicant identity/contact, qualifications, experience, employer, SOP/statement, resume metadata and URL or embedded file data URL, review metadata and public career reference |
| Ownership/campaign submissions | Claimant identity, hospital email/domain and supporting explanation/document reference; organizer contact, campaign location and description |
| Email delivery | Recipient, template/subject, attempts/status/timestamps and sanitized error metadata; encrypted replayable message envelope for eligible emails |
| Audit and ingestion | Actor/entity references, selected before/after values and optional hashed IP; crawled source evidence/payloads, verification history and operational metadata |

Free-text fields and uploaded resumes can contain additional personal or medical information. MongoDB stores many request fields directly; the code does not implement blanket field-level encryption for patient or application data. Infrastructure encryption, backup access and retention need explicit deployment controls. See [data model](data-model.md).

## Public versus private tracking

`/track` and `/api/tracking/:type/:reference` expose only **reference, current status and update time**. They do not reveal name, contact details, patient summary, resume, provider or the MongoDB document ID. Anyone possessing a valid reference can see that status summary; share it carefully.

Private request details/actions remain restricted to the owner, an authorized administrator/assigned staff member or a permitted private tracking token. Guest tokens are stored as hashes and should remain private. Career applicant history and organization review require authenticated access. Published campaign entries retain explicitly supplied organizer/contact information. Public responses omit creator account identity; unpublished proposals are visible only to their creator or global administrators. Account email is not automatically used as a public contact. Administrative access can legitimately include personal data needed to handle a request/application; it is not a guarantee that all admin tables are anonymous. See [API permissions](api.md) and [security controls](security.md).

## Location handling

Browser geolocation is requested on demand for nearby discovery, maps and routing. Discovery origin coordinates are passed to relevant APIs and are not saved as a user location history by those paths. Manual locality selection remains available when permission is denied or location fails.

Provider coordinates/addresses are stored directory data. A patient-entered ambulance/bed pickup address and locality **are persisted with the request**. Map/routing providers may receive coordinates when their integration is enabled; browser and third-party service behavior must be included in production disclosures.

## Email and external services

Email verification, password reset, confirmations, status changes and provider/staff/admin emails remain enabled when configured. The in-app notification inbox/model/API is intentionally removed; this does not remove email data or delivery records.

Request details required by a template are sent to its recipients and SMTP provider. Replayable messages retain encrypted retry envelopes; token-bearing verification/reset emails are not replayable and fresh links must be issued. SMTP acceptance does not prove inbox delivery. Email content and stored subjects can themselves contain personal information, even when an administrative API omits the message body.

The assistant defaults to a local rule-based provider. If an external AI phrasing provider is configured, it receives the user's message, inferred locality/intent and selected directory results/actions. Assistant conversation history is not persisted in a backend conversation collection; that does not control browser state or external-provider retention. Do not instruct users to submit sensitive records to the assistant, and review the provider's data-processing terms before enabling it.

Google OAuth is intentionally removed. SMTP using a Google/Gmail mailbox is an independent email configuration and does not restore Google sign-in.

## Logs and audit

The application request logger records timestamp, request ID, method, matched route/path, status and duration rather than request bodies, passwords or cookie headers. Unmatched paths may still contain user-supplied text; reverse proxies, database logs and external services are outside that logger's guarantees.

Audit records cover more than verification-status changes: authentication, roles/account changes, ownership, source/claim review and request status transitions. Authentication helpers hash IPs with a secret-derived salt; raw IPs are not part of `AuditLog` schema. Hashed identifiers and actor/entity references still merit access and retention controls.

## Retention and production responsibilities

Expiring `AuthToken` records have TTL cleanup; request expiry changes lifecycle status rather than deleting the record. There is no universal automated retention/deletion policy for requests, resumes, email deliveries, audits or backups.

Before a real deployment, define and implement:

- Purpose and consent/disclosure for the collected request/application data and external providers.
- Retention/deletion periods covering MongoDB, embedded resumes, email, logs and backups.
- Account/data access and deletion procedures, staff access review and incident response.
- TLS, database/backup encryption, restricted credentials and tested recovery.
- Appropriate agreements and assessment for SMTP, hosting, map/routing and optional AI processors.

Fixtures used by local tests are isolated test data; a banner or a seeded record must not be treated as proof that a deployment uses only demo data. Provider freshness, provenance and unknown availability remain visible as their own data-quality controls.

Current local evidence and live verification requirements are maintained in [release QA](release-qa.md) and [deployment](deployment.md).
