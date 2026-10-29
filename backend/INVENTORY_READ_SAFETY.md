# Inventory read safety — 29 October 2026

Current inventory reads evaluate freshness after organisation and inventory database
queries complete. An observation crossing the 30-minute boundary while a query is
in flight is withheld in the response. Explicit service-level test/replay times
remain supported; public routes never accept a caller-selected evaluation time.

The public inventory serializer validates stored numerical values as well as
incoming writes. Capacity and availability must be nonnegative safe integers, and
availability cannot exceed known capacity. Invalid counts become `null`/`unknown`;
confirmed zero remains zero. Invalid timestamps become null; future or invalid
observations have unknown freshness and cannot publish numerical availability.
Demo records remain demo and cannot publish confirmed numerical availability.
Scoped inventory exports share these checks at creation and download.

Hospital evidence responses also withhold negative, fractional and unsafe facility
quantities from legacy/imported observations. A separately verified qualitative
status remains usable, and the facility count never becomes a hospital-wide bed
count. These protections change disclosure, not stored historical evidence.

Inventory organisation lookup now includes archival in its initial database
filter, removing a redundant read of the same organisation. A hospital inventory
read needs one hospital lookup and one bounded current-inventory lookup, down from
two hospital lookups plus inventory. Child resources retain a separate check for
an existing, unarchived parent. Active/approval requirements and historical access
are preserved. Fewer database round trips are verified by regression tests; this
release does not claim a new hosted latency percentage.

Regression tests reproduce expiry during database I/O with a controlled clock,
check malformed legacy values and confirmed zero, and exercise archived/inactive
providers, missing parents, historical access and organisation lookup count.
Existing tests cover concurrent updates, stale writes, permission checks,
observation journals, recovery, scoped exports and membership revocation.

Release validation: `npm run backend:test:db` passed 647 checks with zero failures
or skips. Backend lint passed with zero errors and seven existing warnings. The
new safety and lookup tests failed against the prior implementation before the
fixes were applied. No frontend code changed in this release.

No schema migration, index change or existing-record rewrite is required. Deploy
the compatible API/worker release normally. Rollback restores the previous
application code without changing data; it also restores the older disclosure
behaviour, so investigate before rolling back these protections.
