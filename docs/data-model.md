# Data model

[Documentation](README.md) · [Project overview](../README.md)

MongoDB is the source of truth. Schemas live in `backend/src/models`;
this guide groups their responsibilities rather than duplicating every field.

## Identity and provider onboarding

| Model | Responsibility |
| --- | --- |
| `User` | Login identity, bcrypt password hash, role/status, profile, notification contact and session version |
| `AuthToken` | Hashed refresh, activation, recovery and verification tokens with purpose/expiry/revocation |
| `ProviderMembership` | User + organisation kind + organisation ID + active assignment |
| `ProviderApplication` | Applicant contacts, pending/approved/rejected review and provisioning state |
| `AuditLog` | Selected administrative and workflow before/after history |

Assignable roles: `system_admin`, `provider_admin`, `user`. Historical legacy
role values remain readable where necessary; retaining a value does not grant
global administration. Provider membership kinds are `hospital`, `blood_bank`,
`diagnostic` and `ambulance`. A unique compound key prevents duplicate
membership rows for the same user/organisation/type.

Login addresses and verified notification contacts are distinct. A local
`.example` login is not a deliverable mailbox. Passwords are never retrievable
from their stored hashes; a generated manual credential is disclosed only at
creation/reset and kept out of database plaintext and audit payloads.

## Healthcare directory and evidence

- `Hospital`: identity, location/contact fields, approval state and historical
  hospital administrator references.
- `ResourceProvider`: blood-bank, diagnostic and ambulance organisations.
- `DataSource`, `FacilitySourceClaim`, `HospitalFieldClaim`, conflict models:
  stored evidence, competing claims, confidence and review history.
- `HospitalFacility`, `AvailabilityObservation`: capability and dated
  availability observations.

Static capability never establishes live capacity. The public data composer
requires a recent verified observation for non-unknown current availability.
Missing/stale observations remain unknown. Removed scraping badges are a
frontend decision; stored provenance is preserved.

## Requests, Careers and campaigns

- `EmergencyRequest`: standard/emergency bed coordination, owner/hospital,
  private tracking credential, status/timeline, expiry and notification version.
- `BloodRequest`: normal/urgent blood requests and blood donation pledges.
- `AmbulanceBooking`: booking request, explicit emergency classification,
  provider snapshot and per-recipient delivery metadata.
- `Job`: published/draft/moderated roles tied to a hospital or resource provider.
- Job and organisation application models preserve candidate submissions,
  status history and public `CAR-J…` / `CAR-O…` references.
- Campaign models store blood donation campaigns and their moderation.

Patient contacts, resume data and medical details are not public directory
fields. Reference-only tracking exposes a limited status summary; it does not
grant ownership or update access.

## Notification persistence

`RequestNotification` stores recipient-specific routing intents.
`EmailDelivery` deduplicates by event key and records attempts, lease, transport
status, safe failure category and optional encrypted retry content.

The optional `queued` field opts a replay-safe message into the background
outbox. No existing delivery rows are migrated or automatically opted in.
Account-link templates retain no replay envelope and cannot enter this queue.
Sent means provider acceptance, not confirmed receipt. Uncertain sends are not
automatically replayed.

## Preservation

The canonical recovered local directory is `/home/anonymous/medreach/data`.
Its records, indexes, relationships and recovery backups must survive code
updates. Test fixtures belong in separately named disposable databases.
No account conversion, production index creation or database rewrite is implied
by a schema description. See [stored dataset](stored-data.md) and
[local startup/recovery](../LOCAL_MONGODB_SETUP.md).
