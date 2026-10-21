# Services, maps and request tracking

[Documentation](README.md) · [Project overview](../README.md)

Current contracts, reviewed 22 October 2026. Applies to Bootstrap, Tailwind and
Skeleton with their own designs. See [parity](PARITY_VERIFICATION.md) and
[Release QA](release-qa.md) for tested coverage and live limitations.

## Healthcare map

Hospitals, blood banks, diagnostics and ambulance providers use backend records.
Providers with usable stored coordinates can appear as category markers;
coordinates do not automatically imply the listing is verified. Map/list
selection, provider details, contact and directions use actual record fields.
Unknown availability and hours stay unknown.

The top navbar intentionally omits Map. The homepage **Full Map View →** button
continues to open `/map`. Maps integration, markers and the complete map route
remain. Without map loading or GPS permission, directory search, manual locality
and available contact/navigation actions stay usable.

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for each frontend at build time; Maps browser
configuration is separate from backend routing duration. See
[deployment](deployment.md). No ETA is inferred from a static listing.

## Bed flow separation

Hospital detail pages submit signed-in **standard bed requests**. `/emergency`
submits **emergency bed requests** without requiring login. Blood emergencies
use `/urgent-blood`; they never submit emergency bed records. Ambulance assistance
within a bed request is arranged by hospital staff, with pickup information if
required; it does not ask the patient to choose an ambulance provider.

Both bed types use the real hospital-scoped lifecycle and private detail view.
See [bed lifecycle](bed-request-lifecycle.md).

## Ambulance booking

A provider listing offers call/navigation when the corresponding real contact or
location is present, plus the existing booking modal. It collects patient name,
age (1–130), ambulance requirement, pickup information when required, contact
phone/email and optional notes. Server validation checks the provider type and
active status; at least one contact method is required.

`POST /api/ambulances/book` saves an `AmbulanceBooking` with its public `AMB-...`
reference, request/provider snapshots and per-channel delivery status before
attempting emails. A recorded request is not confirmed dispatch. The response
and authorized history distinguish user/admin/provider email outcomes. Failed
eligible deliveries retain controlled retries.

## Blood requests and donation pledges

The blood-bank modal preserves sign-in handling and its intended destination.
Backend standard submission uses optional authentication with validation/access
rules; urgent submission remains guest-accessible. API permission and frontend
entry behavior are different contracts; see [API](api.md).

Normal requests and donation pledges use `POST /api/blood-requests/standard`;
urgent requests use `POST /api/blood-requests/urgent`. A standard request requires
a listed active blood bank. Routine urgency choices are:

- `3 days`
- `1 week`
- `2 weeks`
- `1 month`

Urgent choices are:

- `within 6 hours`
- `12 hours`
- `18 hours`
- `24 hours`
- `up to 2 days`

Saved references use `BR-YYYYMMDD-XXXXXX` for requests or
`BDP-YYYYMMDD-XXXXXX` for donation pledges. Confirmation/status does not prove
inventory or fulfillment. Urgent requests can remain unassigned to a bank;
contact a real provider to confirm availability.

## Career application references

Job applications receive server-generated `CAR-J...` references; organization
applications receive `CAR-O...` references. Each includes 14 random hexadecimal
characters after its namespace and is protected by a unique database index.
MongoDB document IDs are not public tracking references. Submission responses,
dashboard history and confirmation emails expose the persisted reference and
tracking link. Staff application review retains its protected internal endpoints.

## Reference-only tracking

All three `/track` dropdowns retain four choices:

1. Blood request or donation pledge
2. Bed request
3. Career request
4. Ambulance booking

`GET /api/tracking/:type/:reference` accepts `blood`, `bed`, `career` or
`ambulance`, validates the reference pattern and returns only
`{record: {reference, status, updatedAt}}`. Lookup is public, rate-limited,
case-normalized and marked `Cache-Control: no-store`. Wrong type/malformed input
returns 400; an unknown valid reference returns 404. No contact, clinical,
resume, pickup or provider-choice fields are exposed; public lookup cannot
cancel or modify a record.

A signed-in owner or saved private guest link may open authorized detail views.
Embedded guest credentials are removed from the address bar after opening and
kept in memory/session storage as supported. Preserve those links for private
access; removing the public token field did not remove detail authorization.

Skeleton career references wrap and provide copy/manual-copy fallback. Dashboard
copy/tracking works across all variants. Bootstrap/Tailwind public tracking
presentation retains its existing behavior.

## Email reliability

In-app notifications are removed; email remains. During normal server startup,
replay-safe bed, blood, ambulance and Careers notifications persist to the
encrypted durable outbox before the API responds. A bounded worker performs
delivery afterward, retaining event-key deduplication and eligible retries.
Activation, address verification and recovery links keep their inline,
non-replayable path. SMTP/Resend acceptance does not prove mailbox receipt or
provider participation. See [architecture](architecture.md),
[security](security.md) and [latency verification](latency-verification.md).
