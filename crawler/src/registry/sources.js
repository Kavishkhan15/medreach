// Approved source registry — the ONLY hospitals/paths the crawler may fetch.
// Derived from real robots.txt + observed site structure (see docs/crawler.md).
// No arbitrary/user-supplied URLs are ever crawled: the runner resolves a source
// by id from this list and the fetcher additionally re-checks robots + SSRF.

export const SOURCE_STATES = [
  "enabled",
  "disabled",
  "robots_disallowed",
  "blocked",
  "rate_limited",
  "temporarily_unavailable",
  "parsing_error",
];

// crawlFrequency/rateLimit are conservative on purpose (do not overload sites).
export const SOURCES = [
  {
    sourceId: "lilavati",
    hospitalId: null, // filled by persistence on first match by name/slug
    name: "Lilavati Hospital & Research Centre",
    baseUrl: "https://www.lilavatihospital.com",
    sourceType: "hospital_site",
    adapter: "lilavati",
    // Only these path prefixes may be fetched (intersected with robots.txt).
    allowedPaths: ["/", "/contact-us", "/about-us", "/facilities", "/specialities", "/emergency"],
    enabled: true,
    crawlFrequencyMs: 6 * 60 * 60 * 1000, // every 6h
    timeoutMs: 10000,
    rateLimit: { minIntervalMs: 3000, concurrency: 1 }, // 1 req / 3s, single connection
    maxPages: 8,
    maxDepth: 1,
    priority: 1,
    reliability: 0.6, // hospital_site (see confidence engine)
    sourceState: "enabled",
    lastCrawledAt: null,
    // Known reference identity (used only as fallback identity, never as availability).
    known: { locality: "Bandra", city: "Mumbai", pincode: "400050", hospitalType: "Trust" },
  },
  {
    sourceId: "kokilaben",
    hospitalId: null,
    name: "Kokilaben Dhirubhai Ambani Hospital",
    baseUrl: "https://www.kokilabenhospital.com",
    sourceType: "hospital_site",
    adapter: "kokilaben",
    allowedPaths: ["/", "/contactus", "/patients", "/departments/centresofexcellence", "/aboutus"],
    enabled: true,
    crawlFrequencyMs: 6 * 60 * 60 * 1000,
    timeoutMs: 10000,
    rateLimit: { minIntervalMs: 3000, concurrency: 1 },
    maxPages: 8,
    maxDepth: 1,
    priority: 1,
    reliability: 0.6,
    sourceState: "enabled",
    lastCrawledAt: null,
    known: { locality: "Andheri West", city: "Mumbai", pincode: "400053", hospitalType: "Trust" },
  },
  {
    sourceId: "fortis",
    hospitalId: null,
    name: "Fortis Hospital Mumbai",
    baseUrl: "https://www.fortishealthcare.com",
    sourceType: "hospital_site",
    adapter: "fortis",
    // Drupal site; content pages allowed, /core /profiles /admin /search /user disallowed.
    allowedPaths: ["/", "/hospitals/mumbai", "/contact-us", "/specialities", "/facilities"],
    enabled: true,
    crawlFrequencyMs: 6 * 60 * 60 * 1000,
    timeoutMs: 10000,
    rateLimit: { minIntervalMs: 4000, concurrency: 1 },
    maxPages: 8,
    maxDepth: 1,
    priority: 2,
    reliability: 0.6,
    sourceState: "enabled",
    lastCrawledAt: null,
    known: { locality: "Mulund", city: "Mumbai", pincode: "400078", hospitalType: "Private" },
  },
  {
    sourceId: "jaslok",
    hospitalId: null,
    name: "Jaslok Hospital & Research Centre",
    baseUrl: "https://www.jaslokhospital.net",
    sourceType: "hospital_site",
    adapter: "jaslok",
    allowedPaths: ["/", "/contact", "/about-jaslok", "/hospital-facilities", "/speciality"],
    enabled: true,
    crawlFrequencyMs: 6 * 60 * 60 * 1000,
    timeoutMs: 10000,
    rateLimit: { minIntervalMs: 3000, concurrency: 1 },
    maxPages: 8,
    maxDepth: 1,
    priority: 1,
    reliability: 0.6,
    sourceState: "enabled",
    lastCrawledAt: null,
    known: { locality: "Pedder Road", city: "Mumbai", pincode: "400026", hospitalType: "Trust" },
  },
];

export function getSource(sourceId) {
  return SOURCES.find((s) => s.sourceId === sourceId) || null;
}

export function enabledSources() {
  return SOURCES.filter((s) => s.enabled && s.sourceState === "enabled");
}

// A path is registry-allowed if it equals an allowed path or is a sub-path of one.
// "/" matches ONLY the root (not every path).
export function isPathAllowed(source, pathname) {
  if (!source) return false;
  return (source.allowedPaths || []).some((p) => {
    if (p === "/") return pathname === "/";
    return pathname === p || pathname.startsWith(p + "/");
  });
}
