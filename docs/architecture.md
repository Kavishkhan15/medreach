# MedReach architecture

Updated 2026-10-06. See [implementation inventory](MedReach_Implementation_Inventory.md)
and [release QA](release-qa.md) for capability and verification status.

```text
Existing healthcare dataset → MongoDB → Express API → Bootstrap / Tailwind / Skeleton
                                  ↑
                  Staff observations, requests and reviews
```

MedReach does not crawl or scrape websites at runtime. The existing provider,
job, source, claim, conflict, availability and historical ingestion records stay
in MongoDB. No migration, reseed or collection drop is required to remove the
acquisition code. Historical source URLs and timestamps describe the stored
dataset; they do not imply current availability. See [stored data](stored-data.md).

## Backend

`backend/src/app.js` mounts the shared Express API. `server.js` connects MongoDB,
starts HTTP and the unrelated emergency-request expiry worker, then registers
graceful shutdown. There is no crawler worker or scheduler. Readiness requires
a MongoDB connection. Public provider APIs query stored `Hospital`,
`ResourceProvider`, `Job` and related models. Requests, tracking, authentication,
email and staff/admin workflows continue through their existing routes.

Claims and conflicts remain reviewable. `DataSource`, `FacilitySourceClaim`,
`HospitalFieldClaim`, `AvailabilityObservation`, `CrawlJob` and `CrawlResult`
schemas preserve historical evidence. No public availability is inferred from
static facility capability: only eligible recent verified observations can
establish a current status. Optional Gemini refinement uses already stored
excerpts and requires human review; it does not fetch provider websites.

## Frontends

Bootstrap is the functional reference. Tailwind and Skeleton use their own
components and styling. All three call the same Express APIs for hospital and
resource discovery, maps, careers, requests, tracking and authentication. The
shared `packages/core` client and Bootstrap's `_core` copy are kept aligned.
Crawler dashboards, source-management screens and crawl API calls have been
removed from all variants. Provider verification and resource administration
remain available.

## Operations and research

The architecture isolates the frontend comparison from the shared backend and
fixed dataset. Runs should record dataset identity and counts before collecting
framework measurements; changing stored data between variants would confound
results. Use a disposable database for integration and browser tests. Development
seed scripts are destructive and must not target the existing dataset.

See [API](api.md), [data model](data-model.md), [deployment](deployment.md),
[assistant](ai-assistant.md) and [target architecture](MedReach_Target_Architecture.md).
