// Approved source registry — the ONLY hospitals/paths the crawler may fetch.
// Derived from real robots.txt + observed site structure (see docs/crawler.md).
// No arbitrary/user-supplied URLs are ever crawled: the runner resolves a source
// by id from this list and the fetcher additionally re-checks robots + SSRF.

// Source category — determines which orchestration path a source runs through.
// hospital_site/official_api/authorized_feed/manual_verification produce ONE
// normalized hospital record per crawl (existing 1:1 pipeline). government_directory
// produces MANY lightweight hospital listings per crawl (separate pipeline —
// see crawlDirectorySource() in orchestrator.js) since a directory page describes
// N hospitals, not one.
export const SOURCE_TYPES = [
  "hospital_site",
  "government_directory",
  "official_api",
  "authorized_feed",
  "manual_verification",
];

// Lifecycle/health state of a source. Distinct from CrawlJob status (which
// describes one run) — this is the source's current standing.
export const SOURCE_STATES = [
  "enabled",
  "disabled",
  "robots_disallowed",
  "blocked",
  "rate_limited",
  "temporarily_unavailable",
  "parsing_error",
];

// robots.txt evaluation result, cached alongside the source (see
// robots/robotsChecker.js isAllowedByRobots() return shape).
export const ROBOTS_STATUSES = ["unknown", "no_robots", "robots_allow", "robots_disallow"];

// crawlFrequency/rateLimit are conservative on purpose (do not overload sites).
// NOTE ON FREQUENCY: static hospital capability pages do not change minute to
// minute — 6h is already generous for a hospital_site. A government directory
// changes even less often (new hospitals are not added weekly) so it gets a
// longer interval. Frequency is NEVER shortened as a workaround for a source
// blocking the crawler — see isCrawlable()/orchestrator.js, which report a
// block honestly instead of retrying faster.
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
    robotsStatus: "robots_allow", // confirmed: CodeIgniter site, /admin /system /search disallowed only
    lastCrawledAt: null,
    lastSuccessfulCrawl: null,
    lastFailure: null,
    status: "healthy",
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
    robotsStatus: "robots_allow", // staging/admin + *.pdf disallowed only
    lastCrawledAt: null,
    lastSuccessfulCrawl: null,
    lastFailure: null,
    status: "healthy",
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
    robotsStatus: "robots_allow",
    lastCrawledAt: null,
    lastSuccessfulCrawl: null,
    // Confirmed via live testing: the site's own WAF returns 403 to the
    // crawler's requests. Recorded honestly — never bypassed (no stealth UA,
    // no proxy/IP rotation, no CAPTCHA evasion). See docs/crawler.md.
    lastFailure: { reason: "http_error:403", at: null },
    status: "blocked",
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
    robotsStatus: "robots_allow",
    lastCrawledAt: null,
    lastSuccessfulCrawl: null,
    lastFailure: null,
    status: "healthy",
    known: { locality: "Pedder Road", city: "Mumbai", pincode: "400026", hospitalType: "Trust" },
  },
  {
    sourceId: "cooper",
    hospitalId: null,
    name: "Dr. R. N. Cooper Municipal General Hospital (HBT Medical College)",
    baseUrl: "https://hbtmc.edu.in",
    sourceType: "hospital_site",
    adapter: "cooper",
    // Real site inspected live: plain HTML, no JSON-LD. Emergency page carries
    // capacity text ("Casualty: 15 beds", "ICU: 42 beds ...") — CAPABILITY only.
    allowedPaths: ["/", "/emergency", "/contact-us", "/blood-bank", "/college", "/hospital"],
    enabled: true,
    crawlFrequencyMs: 6 * 60 * 60 * 1000,
    timeoutMs: 10000,
    rateLimit: { minIntervalMs: 3000, concurrency: 1 },
    maxPages: 6,
    maxDepth: 1,
    priority: 1,
    reliability: 0.6,
    sourceState: "enabled",
    // Confirmed live: robots.txt disallows only "/test"; /emergency is allowed.
    robotsStatus: "robots_allow",
    lastCrawledAt: null,
    lastSuccessfulCrawl: null,
    lastFailure: null,
    status: "healthy",
    known: { locality: "Juhu", city: "Mumbai", pincode: "400056", hospitalType: "Municipal" },
  },
  {
    sourceId: "mumbai_suburban_directory",
    hospitalId: null, // N/A — a directory source maps to MANY hospitals, not one
    name: "Mumbai Suburban District Government Hospital Directory",
    baseUrl: "https://mumbaisuburban.gov.in",
    sourceType: "government_directory",
    adapter: "mumbai_suburban_directory",
    allowedPaths: ["/en/public-utility-category/hospitals/"],
    enabled: true,
    // Government directory listings change far less often than hospital pages
    // (new municipal hospitals are not added weekly) — a longer interval is
    // both accurate and polite. Configurable by admins (see admin dashboard),
    // never shortened to "get around" anything.
    crawlFrequencyMs: 24 * 60 * 60 * 1000, // every 24h
    timeoutMs: 10000,
    rateLimit: { minIntervalMs: 3000, concurrency: 1 },
    maxPages: 1, // single directory listing page
    maxDepth: 0,
    priority: 3,
    reliability: 0.85, // government_directory (see confidence engine + SOURCE_RELIABILITY)
    sourceState: "enabled",
    // Confirmed live: no robots.txt present on this host → allowed by convention.
    robotsStatus: "no_robots",
    lastCrawledAt: null,
    lastSuccessfulCrawl: null,
    lastFailure: null,
    status: "healthy",
    known: { city: "Mumbai" },
  },
  {
    sourceId: "bombay",
    hospitalId: null,
    name: "Bombay Hospital & Medical Research Centre",
    baseUrl: "https://www.bombayhospital.com",
    sourceType: "hospital_site",
    adapter: "bombay",
    // Real site inspected live: plain HTML, no JSON-LD. /emergency states
    // "Casualty/Emergency Room" location + board number — CAPABILITY/contact
    // info only, never live availability.
    allowedPaths: ["/", "/emergency", "/contact"],
    enabled: true,
    crawlFrequencyMs: 6 * 60 * 60 * 1000,
    timeoutMs: 10000,
    rateLimit: { minIntervalMs: 3000, concurrency: 1 },
    maxPages: 6,
    maxDepth: 1,
    priority: 1,
    reliability: 0.6,
    sourceState: "enabled",
    // Confirmed live: no robots.txt present on this host → allowed by convention.
    robotsStatus: "no_robots",
    lastCrawledAt: null,
    lastSuccessfulCrawl: null,
    lastFailure: null,
    status: "healthy",
    known: { locality: "Marine Lines", city: "Mumbai", pincode: "400020", hospitalType: "Private" },
  },
  {
    sourceId: "mumbai_city_directory",
    hospitalId: null, // N/A — a directory source maps to MANY hospitals, not one
    name: "Mumbai City District Government Hospital Directory",
    baseUrl: "https://mumbaicity.gov.in",
    sourceType: "government_directory",
    adapter: "mumbai_city_directory",
    allowedPaths: ["/en/public-utility-category/hospitals/"],
    enabled: true,
    crawlFrequencyMs: 24 * 60 * 60 * 1000, // every 24h — same rationale as mumbai_suburban_directory
    timeoutMs: 10000,
    rateLimit: { minIntervalMs: 3000, concurrency: 1 },
    maxPages: 1,
    maxDepth: 0,
    priority: 3,
    reliability: 0.85,
    sourceState: "enabled",
    // Confirmed live: no robots.txt present on this host → allowed by convention.
    robotsStatus: "no_robots",
    lastCrawledAt: null,
    lastSuccessfulCrawl: null,
    lastFailure: null,
    status: "healthy",
    known: { city: "Mumbai" },
  },
  {
    sourceId: "apollo_mumbai",
    hospitalId: null,
    name: "Apollo Hospitals Mumbai",
    baseUrl: "https://www.apollohospitals.com",
    sourceType: "hospital_site",
    adapter: "generic", // no working adapter — this source is registered as
    // known-blocked (never actually crawled) so it is honestly visible in the
    // admin dashboard, per spec §14/§24: "A 403/blocked response should be
    // recorded honestly." Confirmed live: the site's WAF returns 403 Forbidden
    // even to a plain robots.txt request — never bypassed (no stealth UA, no
    // proxy/IP rotation, no CAPTCHA evasion).
    allowedPaths: ["/mumbai/clinical-excellence/emergency"],
    enabled: false, // disabled: crawling would only ever produce a 403
    crawlFrequencyMs: 6 * 60 * 60 * 1000,
    timeoutMs: 10000,
    rateLimit: { minIntervalMs: 4000, concurrency: 1 },
    maxPages: 4,
    maxDepth: 1,
    priority: 4,
    reliability: 0.6,
    sourceState: "blocked",
    robotsStatus: "unknown", // robots.txt itself returned 403
    lastCrawledAt: null,
    lastSuccessfulCrawl: null,
    lastFailure: { reason: "http_error:403", at: new Date().toISOString() },
    status: "blocked",
    known: { city: "Mumbai", hospitalType: "Private" },
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
