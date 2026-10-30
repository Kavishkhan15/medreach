# Availability transparency and provider careers

This release extends the Bootstrap client and shared API. It does not seed real
bed counts, approve diagnostic centres, change blood-bank booking, or backfill
historical vacancy values.

## Public availability

- Hospital details and ordinary bed forms show General/ICU inventory only while
  provider-confirmed evidence remains fresh. Confirmed zero is displayed as zero;
  missing, demo and expired evidence remains unknown. Observation time, operational
  capacity and a refresh control help visitors interpret the report. Emergency bed
  forms continue to omit counts and are not blocked by them.
- The diagnostic directory offers one centre/date selector with four tests. It
  reads the existing public daily-capacity endpoint, showing routine limit,
  booked/held quota and remaining quota. This is aggregate request capacity, not a
  patient list or evidence that a test is performed. Unknown/unreviewed capacity
  stays unknown. The selected date carries into the request form.
- Diagnostic snapshots refresh every 30 seconds. Changing the centre/date clears
  old counts and cancels the previous read; the booking API remains authoritative.

## Career positions

Providers can create roles at their server-verified assigned organisations. A role
includes title, category, employment type, department, description, qualifications,
location, compensation, deadline and optional total positions. Existing moderation
remains: provider submission goes to pending review, not immediate publication.

New optional Job fields are `vacancies` (total positions, null when unknown),
`filledPositions`, `availabilityReportedAt` and the private reporting actor.
Available positions = total positions − filled positions, only when both are known
and consistent. Existing jobs receive no database rewrite. Legacy public reads
with absent counts return null. Demo roles remain explicitly marked.

An application does **not** consume a position. A provider records filled positions
after hiring is confirmed. Known zero remaining positions or an expired deadline
closes new applications on the API. Existing applications and tracking remain.
Applications already validated while a role was open may finish during a concurrent
closure; they do not reserve or guarantee a hiring position. Diagnostic booking
quotas and hospital allocations continue to use their separate transactional rules.
Unknown position counts do not imply zero and still allow applications to a
published role.

`PATCH /api/jobs/:id/availability` accepts exactly:

```json
{ "vacancies": 5, "filledPositions": 2, "expectedVersion": 3 }
```

Counts must be whole numbers from 0 to 10,000; filled cannot exceed a known total.
`vacancies: null` explicitly reports unknown total. Assignment, active account and
existing privileged reauthentication rules are checked server-side. Atomic version
comparison allows one concurrent editor to succeed; another receives HTTP 409.
Updates record the original/new counts and version in the audit log. The generic
job patch cannot bypass this endpoint. Job document saves also use optimistic
concurrency. No new indexes or production data migration are required.

Public job list/detail responses include `availability` with total, filled,
remaining, acceptingApplications, reportedAt and source. Public lists require
revalidation on every read and retain compression; job details and authenticated
reads use no-store. `GET /api/jobs` supports page (1–10,000), limit (1–150), employmentType
and existing search/category/organisation filters, returning a `pagination.hasMore`
flag. The Bootstrap list requests 12 roles per page and links to the existing
job-specific application form. General expressions of interest remain separate
and are explicitly not advertised vacancies.

## Verification

- `backend/test/careerVacancies.test.js`: unknown/zero/deadline/demo semantics,
  provider assignment, moderation, concurrent update conflict, invalid values,
  field tampering, public privacy, applications versus hires, legacy records.
- `tests/e2e/bootstrap-career-transparency.spec.js`: role search, employment filter,
  job application links, unknown/full display and conflict feedback.
- `tests/e2e/bootstrap-transparency.spec.js`: diagnostic quotas, changed-date races,
  date transfer/validation and confirmed-zero versus unknown beds.
- Existing capacity and career tests remain regression gates.
