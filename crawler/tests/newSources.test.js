// Offline tests for the NEW sources (cooper, bombay hospital_site adapters +
// government directory parser) and edge cases: missing fields, empty page,
// malformed HTML, changed structure. No network — mock fetch + fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getSource } from "../src/registry/sources.js";
import { adapterFor, ADAPTERS, isCrawlable } from "../src/registry.js";
import { _clearCache } from "../src/robots/robotsChecker.js";
import { parseDirectoryListings, parseDirectoryListingsLoose } from "../src/parsers/directory.js";
import { validateDirectoryListing } from "../src/validation/validateRecord.js";
import { parseHospital, parseFacilities } from "../src/parsers/structured.js";
import { SiteAdapter } from "../src/adapters/siteAdapter.js";
import { crawlHospitalSource } from "../src/orchestrator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => readFileSync(join(__dirname, "fixtures", `${n}.html`), "utf8");
const mockFor = (html) => async (url) => {
  if (url.endsWith("/robots.txt")) return { status: 200, text: async () => "User-agent: *\nAllow: /", headers: { get: () => "text/plain" } };
  return { status: 200, text: async () => html, headers: { get: () => "text/html; charset=utf-8" } };
};

test("a registered blocked hospital makes no network request", async () => {
  let calls = 0;
  const outcome = await crawlHospitalSource(getSource("fortis"), {
    deps: { fetchImpl: async () => { calls++; throw new Error("network must not be reached"); } },
  });
  assert.equal(outcome.status, "blocked");
  assert.equal(calls, 0);
});

test("HTTP 403 stops a source crawl before the next page", async () => {
  _clearCache();
  const visits = [];
  const adapter = new SiteAdapter(getSource("cooper"), { fetchImpl: async (url) => {
    visits.push(url);
    if (url.endsWith("/robots.txt")) return { status: 200, text: async () => "User-agent: *\nAllow: /", headers: { get: () => "text/plain" } };
    return { status: 403, text: async () => "Forbidden", headers: { get: () => "text/html" } };
  } });
  adapter.discoverPages = () => ["/", "/contact-us"];
  const outcome = await adapter.run();
  assert.equal(outcome.reason, "access_blocked");
  assert.equal(visits.filter((url) => !url.endsWith("/robots.txt")).length, 1);
});

test("robots.txt HTTP 403 denies page fetching", async () => {
  _clearCache();
  const visits = [];
  const adapter = new SiteAdapter(getSource("cooper"), { fetchImpl: async (url) => {
    visits.push(url);
    return { status: 403, text: async () => "Forbidden", headers: { get: () => "text/plain" } };
  } });
  adapter.discoverPages = () => ["/"];
  const outcome = await adapter.run();
  assert.equal(outcome.reason, "robots_disallowed");
  assert.equal(visits.length, 1);
  assert.ok(visits[0].endsWith("/robots.txt"));
});

test("robots.txt cross-host redirect denies page fetching and never visits destination", async () => {
  _clearCache();
  const visits = [];
  const adapter = new SiteAdapter(getSource("cooper"), { fetchImpl: async (url) => {
    visits.push(url);
    return { status: 302, text: async () => "",
      headers: { get: (name) => name.toLowerCase() === "location" ? "https://other.example/robots.txt" : null } };
  } });
  adapter.discoverPages = () => ["/"];
  const outcome = await adapter.run();
  assert.equal(outcome.reason, "robots_disallowed");
  assert.equal(visits.length, 1);
  assert.ok(visits[0].endsWith("/robots.txt"));
});

test("field provenance points to the page that supplied a contact value", async () => {
  _clearCache();
  const adapter = new SiteAdapter(getSource("cooper"), { fetchImpl: async (url) => {
    if (url.endsWith("/robots.txt")) return { status: 200, text: async () => "User-agent: *\nAllow: /", headers: { get: () => "text/plain" } };
    const html = url.endsWith("/contact-us")
      ? '<a href="tel:02212345678">Call us</a>'
      : '<html><head><title>Example Hospital</title></head><body><h1>Example Hospital</h1></body></html>';
    return { status: 200, text: async () => html, headers: { get: () => "text/html" } };
  } });
  adapter.discoverPages = () => ["/", "/contact-us"];
  const result = await adapter.run();
  assert.equal(result.ok, true);
  assert.equal(result.record.hospital.phone, "02212345678");
  assert.equal(result.record.fieldEvidence.phone.sourcePageUrl, "https://hbtmc.edu.in/contact-us");
  assert.equal(result.record.fieldEvidence.phone.evidenceText, null, "a tel link without visible digits has no text excerpt");
});

// ---- Cooper + Bombay hospital_site adapters ----
for (const c of [
  { id: "cooper", name: /Cooper/, mustHave: ["ICU", "NICU", "PICU", "CCU", "Emergency Department"] },
  { id: "bombay", name: /Bombay Hospital/, mustHave: ["ICU", "CCU", "Dialysis", "Emergency Department"] },
]) {
  test(`${c.id}: registered + crawlable`, () => {
    assert.ok(ADAPTERS[c.id]);
    assert.equal(isCrawlable(getSource(c.id)).ok, true);
  });

  test(`${c.id}: offline run -> capability facilities, availability unknown, no fabricated quantity`, async () => {
    _clearCache();
    const out = await adapterFor(getSource(c.id), { fetchImpl: mockFor(fixture(c.id)) }).run();
    assert.equal(out.ok, true);
    assert.match(out.record.hospital.name, c.name);
    const facs = out.record.facilities.map((f) => f.facility);
    for (const m of c.mustHave) assert.ok(facs.includes(m), `${c.id} has ${m}`);
    // capability yes, availability ALWAYS unknown, NEVER a bed-count quantity
    assert.ok(out.record.facilities.every((f) => f.availability === "unknown"));
    assert.ok(out.record.facilities.every((f) => f.quantity == null));
    assert.equal(out.record.provenance.sourceId, c.id);
    assert.equal(out.record.provenance.collectionMethod, "crawler");
    assert.ok(out.record.fieldEvidence.name.sourcePageUrl.startsWith(getSource(c.id).baseUrl));
    assert.match(out.record.fieldEvidence.name.evidenceText, c.name);
  });
}

// Cooper's real title has "&amp;" — entity decode must produce a clean "&".
test("cooper: HTML entity in title decoded (no raw &amp;)", () => {
  const parsed = parseHospital(fixture("cooper"), null);
  assert.ok(!/&amp;/.test(parsed.name), "no raw entity in name");
});

// "42 beds" is CAPACITY, never current availability — must yield no quantity.
test("cooper: '42 beds' ICU text produces capability only, no quantity", async () => {
  _clearCache();
  const out = await adapterFor(getSource("cooper"), { fetchImpl: mockFor(fixture("cooper")) }).run();
  const icu = out.record.facilities.find((f) => f.facility === "ICU");
  assert.ok(icu && icu.capability === "yes" && icu.quantity == null);
  assert.match(icu.evidenceText, /ICU/i);
  assert.equal(icu.sourcePageUrl, "https://hbtmc.edu.in/");
});

test("facility evidence is an actual bounded page excerpt", () => {
  const [icu] = parseFacilities("<p>The ICU has 42 total beds. Current availability is not stated.</p>");
  assert.equal(icu.facility, "ICU");
  assert.match(icu.evidenceText, /42 total beds/);
  assert.ok(icu.evidenceText.length <= 200);
});

// ---- Government directory parser ----
test("directory: parses multiple listings with website + deobfuscated email", () => {
  const listings = parseDirectoryListings(fixture("directory"));
  assert.equal(listings.length, 3);
  const kem = listings.find((l) => /K E M/.test(l.name));
  assert.equal(kem.pincode, "400012");
  assert.equal(kem.officialWebsite, "http://www.kem.edu");
  assert.equal(kem.email, "kemwebsite@kem.edu"); // [at]/[dot] decoded
  const gt = listings.find((l) => /G\.T\./.test(l.name));
  assert.equal(gt.officialWebsite, "http://gthospital.in/");
});

// A listing WITHOUT a "Website Link :" must have officialWebsite === null (never invented).
test("directory: missing website link => officialWebsite null (not invented)", () => {
  const listings = parseDirectoryListings(fixture("directory"));
  const stg = listings.find((l) => /St George/.test(l.name));
  assert.equal(stg.officialWebsite, null);
  assert.equal(stg.email ?? null, null);
});

test("directory: phone normalized, valid listings pass validation", () => {
  const listings = parseDirectoryListings(fixture("directory"));
  for (const l of listings) {
    const v = validateDirectoryListing(l);
    assert.equal(v.valid, true, `${l.name} valid: ${JSON.stringify(v.errors)}`);
  }
});

// ---- EDGE CASES ----
test("edge: empty page yields no listings (and no crash)", () => {
  assert.deepEqual(parseDirectoryListings(""), []);
  assert.deepEqual(parseDirectoryListings("<html><body></body></html>"), []);
});

test("edge: malformed HTML does not throw", () => {
  const junk = "<html><h2>Only A Name<p>addr no closing tags <a href=";
  assert.doesNotThrow(() => parseDirectoryListings(junk));
  assert.doesNotThrow(() => parseDirectoryListingsLoose(junk));
});

test("edge: listing missing name is dropped by validation", () => {
  const v = validateDirectoryListing({ name: "", pincode: "400001" });
  assert.equal(v.valid, false);
});

test("edge: hospital page with no facilities still returns a record (empty facilities)", async () => {
  _clearCache();
  const bare = "<html><head><title>Some Clinic</title></head><body><h1>Some Clinic</h1></body></html>";
  const out = await adapterFor(getSource("cooper"), { fetchImpl: mockFor(bare) }).run();
  assert.equal(out.ok, true);
  assert.ok(Array.isArray(out.record.facilities));
  // no facilities fabricated when the page has none
  assert.equal(out.record.facilities.length, 0);
});

test("edge: parseFacilities on empty string returns []", () => {
  assert.deepEqual(parseFacilities(""), []);
});

// ---- Apollo is blocked and NEVER crawlable ----
test("apollo_mumbai: disabled/blocked -> not crawlable (zero network)", () => {
  const s = getSource("apollo_mumbai");
  assert.ok(s);
  assert.equal(isCrawlable(s).ok, false);
});
