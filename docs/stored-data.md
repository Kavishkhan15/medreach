# Existing healthcare dataset and provenance

MedReach now uses the provider and workflow data already stored in MongoDB.
The application does not run a crawler, scraper, source scheduler or external
provider-site fetch. The data path is:

```text
Existing healthcare dataset → MongoDB → Express API → Bootstrap / Tailwind / Skeleton
```

Keep all existing collections and documents. In particular, retain hospitals,
resource providers (blood banks, diagnostics and ambulances), jobs,
`DataSource`, `FacilitySourceClaim`, `HospitalFieldClaim`, conflicts,
`AvailabilityObservation`, `CrawlJob`, `CrawlResult`, and any historical
crawler-setting collection. The latter three document past acquisition; they
are not active jobs or controls, and the application has no models for them.
No migration or data rewrite is part of the crawler removal.

Provider APIs continue to read stored records. Source names, URLs, confidence,
verification, timestamps and historical results remain useful evidence for the
research paper. Historical freshness is not a promise of live capacity. Staff
may submit new verified observations and admins may review stored evidence
through existing non-crawler routes. Optional Gemini refinement reads stored
excerpts and creates review candidates; it never visits source websites.

Before a deployment or study, take a MongoDB backup and record collection
counts using a read-only credential. Compare counts after deployment. Never run
`backend:seed`, `seed:mumbai`, `./run.sh seed`, browser fixture seeding or test
suites that drop databases against the existing dataset. Use separate disposable
MongoDB instances for those tools. See [deployment](deployment.md) and
[data model](data-model.md).
