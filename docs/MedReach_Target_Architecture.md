# MedReach research architecture

Updated 2026-10-06. Bootstrap, Tailwind and Skeleton are independent frontend
implementations over one Express API and one existing MongoDB healthcare dataset.
Bootstrap remains the functional reference for parity checks.

```text
Existing healthcare dataset → MongoDB → Express API → Bootstrap / Tailwind / Skeleton
```

The original dataset may include historically collected provider pages,
directory entries, source URLs, claims, parser versions and observations. These
records are retained for provenance. The current application has no crawler,
scraper, registry adapter, scheduler or crawl control. It does not refresh this
dataset by visiting external provider websites. Staff-entered observations,
admin reviews, new requests, bookings and job workflows remain normal app writes.

For the research comparison, keep the backend, API contracts and dataset fixed
while measuring responsiveness, accessibility, performance, security and
usability across the three UI variants. Record database counts and collection
identity at the start and end of each study run. Use only isolated disposable
databases for automated tests; never seed or reset the existing product dataset.

A service listing or historical capability claim does not establish live bed,
blood or ambulance availability. Current availability requires the existing
verified-observation rules, and a bed or ambulance request is not a confirmed
reservation or dispatch. Human review of stored claim conflicts and optional
refinement candidates remains available. See [architecture](architecture.md),
[stored data](stored-data.md), [data model](data-model.md) and
[implementation inventory](MedReach_Implementation_Inventory.md).
