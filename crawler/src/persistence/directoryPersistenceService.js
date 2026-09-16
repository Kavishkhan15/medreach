// DirectoryPersistenceService — the ONLY place a government-directory crawl's
// listings become DB writes. Parallel to PersistenceService (which assumes
// one hospital per source) but built for the opposite shape: ONE source
// producing MANY lightweight hospital listings.
//
// For each listing:
//   - if an existing hospital already matches by name (e.g. one already
//     created by a hospital_site adapter, like Lilavati), link this
//     directory as an ADDITIONAL source on that hospital — this is the
//     directory<->hospital_site provenance chain the spec asks for. Identity
//     fields (address/phone/pincode) are NOT overwritten if the hospital
//     already has them from a more authoritative hospital_site source.
//   - otherwise, create a minimal, unverified hospital stub from the
//     directory-only fields. NEVER invents facility/specialty data — a
//     directory does not publish that, so none is written.
//
// repo contract (all async):
//   findHospitalByName(listing, sourceId)  -> hospital|null (unique exact identity only)
//   createHospitalStub(listing, sourceId)  -> hospital (has _id)
//   linkDirectoryListing(sourceId, listing, hospitalId, {matched})

export class DirectoryPersistenceService {
  constructor(repo) {
    this.repo = repo;
  }

  async apply(listings, { source, dryRun = false, sourcePageUrl, retrievedAt, parserVersion, confidence } = {}) {
    const result = {
      sourceId: source?.sourceId ?? null,
      listingsFound: listings.length,
      hospitalsLinked: 0, // matched an existing hospital from another source
      hospitalsCreated: 0, // new stub from directory-only data
      listingsRejected: 0,
      dryRun,
    };

    for (const listing of listings) {
      if (!listing?.name || String(listing.name).trim().length < 3
          || (!listing.pincode && !listing.address)) {
        result.listingsRejected++;
        continue;
      }

      const existing = await this.repo.findHospitalByName(listing, result.sourceId);
      if (dryRun) {
        if (existing) result.hospitalsLinked++; else result.hospitalsCreated++;
        continue;
      }

      if (existing) {
        await this.repo.linkDirectoryListing(result.sourceId, listing, existing._id, { matched: true, sourcePageUrl, retrievedAt, parserVersion, confidence });
        result.hospitalsLinked++;
      } else {
        const hospital = await this.repo.createHospitalStub(listing, result.sourceId);
        await this.repo.linkDirectoryListing(result.sourceId, listing, hospital._id, { matched: false, sourcePageUrl, retrievedAt, parserVersion, confidence });
        result.hospitalsCreated++;
      }
    }

    return result;
  }
}
