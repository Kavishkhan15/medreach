// DirectoryAdapter — base contract for government-directory-style sources
// that describe MANY hospitals from ONE page, as opposed to SiteAdapter
// (one hospital website -> one normalized record). A directory's run()
// returns a LIST of lightweight listings, never a single hospital record —
// this is why it needs its own orchestration path (crawlDirectorySource in
// orchestrator.js) rather than reusing crawlHospitalSource()/
// PersistenceService.apply(), both of which assume one hospital per source.
//
// Pipeline: discoverPages() -> guardedFetch each -> parseListings(html) ->
// (loose fallback on zero matches) -> return { ok, listings, sourcePageUrl }.
// All fetching goes through guardedFetch (robots+SSRF+registry), same as
// SiteAdapter. Never executes page scripts. Deterministic; NO AI/ML.

import { guardedFetch } from "../fetchers/guardedFetch.js";

export class DirectoryAdapter {
  constructor(source, deps = {}) {
    this.source = source;
    this.deps = deps;
    this.parserVersion = `${source.adapter}-v1`;
  }

  // Subclasses override: return array of absolute/relative page URLs to fetch.
  discoverPages() {
    return ["/"];
  }

  // Subclasses override: parse raw HTML into an array of listing objects.
  // Must return [] (not throw) on total failure — the loose fallback and
  // parser-anomaly handling live in run().
  parseListings(/* html */) {
    return [];
  }

  // Optional looser fallback parse, used only when parseListings() returns
  // zero results, to distinguish "page structure changed" from "genuinely
  // zero hospitals listed today". Subclasses may override; default: none.
  parseListingsLoose(/* html */) {
    return [];
  }

  async run() {
    const pages = this.discoverPages().slice(0, this.source.maxPages || 1);
    const pageResults = [];
    let firstPageUrl = null;
    let listings = [];
    let usedFallback = false;

    for (const page of pages) {
      const res = await guardedFetch(this.source, page, this.deps);
      pageResults.push({ page, ok: res.ok, status: res.status, reason: res.reason });
      if (res.status === 403 || res.status === 429) return {
        ok: false, pagesVisited: pageResults.filter((p) => p.ok).length, pageResults,
        reason: res.status === 403 ? "access_blocked" : "rate_limited",
      };
      if (!res.ok) continue;
      if (!firstPageUrl) firstPageUrl = new URL(page, this.source.baseUrl).href;
      try {
        const found = this.parseListings(res.body);
        if (found.length > 0) {
          listings = listings.concat(found);
        } else {
          const loose = this.parseListingsLoose(res.body);
          if (loose.length > 0) { listings = listings.concat(loose); usedFallback = true; }
        }
      } catch (e) {
        pageResults.push({ page, ok: false, reason: `parse_error:${e.message}` });
      }
    }

    if (pageResults.every((p) => !p.ok)) {
      const blocked = pageResults.find((p) => p.reason === "robots_disallowed");
      return {
        ok: false, pagesVisited: 0, pageResults,
        reason: blocked ? "robots_disallowed" : "no_pages_fetched",
      };
    }

    return {
      ok: true,
      listings,
      usedFallback,
      sourcePageUrl: firstPageUrl,
      pagesVisited: pageResults.filter((p) => p.ok).length,
      pageResults,
      parserVersion: this.parserVersion,
      retrievedAt: new Date().toISOString(),
    };
  }
}
