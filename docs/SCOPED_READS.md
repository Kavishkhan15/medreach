# Scoped directory and booking reads

The Bootstrap resource directories request `/api/{diagnostics,ambulances,blood-banks}?view=summary&limit=12&page=1&q=…`. Each endpoint fixes the resource kind server-side. Summary responses include the public fields needed by cards and forms, without source evidence or administrative fields. Pagination reports `hasMore` without calculating an exact collection count. Searches wait 200 ms while typing; changing a search cancels the previous request and resets to page one.

Legacy clients keep the existing default response fields and 100-record maximum. Detail requests remain specific to one provider. Parent archival and provider approval are checked within the resource aggregation, including summary reads.

Hospital form selectors use `/api/hospitals?view=options`, selecting only `_id`, `name`, `slug` and `locality`. A preselected hospital adds `id=<id-or-slug>`; no availability evidence is joined for selector labels. Additional choices load in bounded pages. Current inventory is requested separately for the selected hospital.

## Availability and booking integrity

- Ordinary bed holds use the existing MongoDB transaction and version checks, only when reservations are explicitly enabled and inventory is fresh and provider-confirmed. Each successful hold reduces available inventory once. Cancellation and expiry release it once; confirmation does not deduct again.
- Emergency hospital requests remain coordination-only and do not show or consume bed inventory.
- Diagnostic routine capacity is per approved centre, test and date. The configured daily limit is at most 30. Atomic holds prevent the 31st routine patient from taking a full test/date. Multiple tests either allocate together or fail together.
- The diagnostic form rereads the selected date after a successful submission. Hospital counts refresh every 30 seconds and on window focus; expiry still hides stale numbers immediately.
- Unapproved centres remain review-only. Unknown inventory remains unknown. No real hospital counts, approvals, accounts or blood-bank inventory are changed by this release.

## Verification

Regression coverage includes service isolation, two-page boundaries, summary projections, single-hospital selector reads without evidence joins, debounce behaviour, selected inventory reads, existing concurrent capacity tests, and shared credential limits. Retired MFA POST routes now apply authentication and shared credential limits before returning the disabled-feature response, preserving the shared password-attempt budget.

Hosted timing is a network sample, not a service-level guarantee. Payload reduction and database work should be assessed separately from variable cross-region network latency.
