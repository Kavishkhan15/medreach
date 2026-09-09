// Production crawler tests — robots, structured parsers, normalization, and the
// LilavatiAdapter end-to-end, all OFFLINE via a mock fetchImpl + fixture HTML.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { _evaluateForTest, isAllowedByRobots, _clearCache } from "../src/robots/robotsChecker.js";
import { extractJsonLd, findHospitalNode, parseFacilities, parseSpecialties, parseEmergency, parseContacts, parseHospital } from "../src/parsers/structured.js";
import { normalizeRecord, normalizePhone, normalizeFacilityName } from "../src/normalization/normalizeRecord.js";
import { getSource, isPathAllowed } from "../src/registry/sources.js";
import { LilavatiAdapter } from "../src/adapters/LilavatiAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, "fixtures", "lilavati.html"), "utf8");

// ---- robots longest-match ----
test("robots: longest-match, Allow wins ties, wildcard + $", () => {
  const rules = [
    { type: "disallow", path: "/admin/" },
    { type: "disallow", path: "/system/" },
    { type: "allow", path: "/assets/" },
    { type: "disallow", path: "/*?sort=" },
  ];
  assert.equal(_evaluateForTest(rules, "/about-us"), true);
  assert.equal(_evaluateForTest(rules, "/admin/login"), false);
  assert.equal(_evaluateForTest(rules, "/assets/app.css"), true);
  assert.equal(_evaluateForTest(rules, "/list?sort=asc"), false);
});

test("robots: missing robots.txt => allowed", async () => {
  _clearCache();
  const mock = async () => ({ status: 404, text: async () => "", headers: { get: () => "text/plain" } });
  const r = await isAllowedByRobots("https://x.example/page", { fetchImpl: mock });
  assert.equal(r.allowed, true);
});

test("robots: explicit disallow blocks", async () => {
  _clearCache();
  const robots = "User-agent: *\nDisallow: /admin/";
  const mock = async () => ({ status: 200, text: async () => robots, headers: { get: () => "text/plain" } });
  assert.equal((await isAllowedByRobots("https://x.example/admin/x", { fetchImpl: mock })).allowed, false);
  _clearCache();
  assert.equal((await isAllowedByRobots("https://x.example/ok", { fetchImpl: mock })).allowed, true);
});

// ---- JSON-LD + parsers ----
test("JSON-LD hospital node extraction", () => {
  const nodes = extractJsonLd(FIXTURE);
  const h = findHospitalNode(nodes);
  assert.ok(h);
  assert.equal(h.name, "Lilavati Hospital & Research Centre");
  const parsed = parseHospital(FIXTURE, h);
  assert.equal(parsed.pincode, "400050");
  assert.equal(parsed.locality, "Bandra");
});

// Regression: a real live site (jaslokhospital.net) was found to publish a
// malformed <meta property="og:url" content="Jaslok"/> tag — the site name,
// not a URL. Crawled markup is untrusted input; a non-URL value must be
// rejected (fall back to null) rather than stored as `website` (spec §36).
test("parseHospital: rejects malformed og:url (untrusted input)", () => {
  const html = `<meta property="og:url" content="Jaslok"/><title>Jaslok Hospital</title>`;
  const parsed = parseHospital(html, null);
  assert.equal(parsed.website, null);
});

test("parseHospital: accepts well-formed og:url", () => {
  const html = `<meta property="og:url" content="https://example-hospital.test/"/>`;
  const parsed = parseHospital(html, null);
  assert.equal(parsed.website, "https://example-hospital.test/");
});

// Regression: jaslokhospital.net publishes a terse <meta property="og:site_name"
// content="Jaslok"/> while <title> carries the real name. Prefer the more
// descriptive (multi-word) candidate over a short single-word tag.
test("parseHospital: prefers descriptive title over terse og:site_name", () => {
  const html = `<meta property="og:site_name" content="Jaslok"/><title>Best Super Speciality Hospital in Mumbai | Jaslok Hospital</title>`;
  const parsed = parseHospital(html, null);
  assert.match(parsed.name, /Jaslok Hospital/);
});

test("facility CAPABILITY detection (not availability)", () => {
  const facs = parseFacilities(FIXTURE).map((f) => f.facility);
  assert.ok(facs.includes("ICU"));
  assert.ok(facs.includes("Emergency Department"));
  assert.ok(facs.includes("Blood Bank"));
  assert.ok(facs.includes("CT") && facs.includes("MRI"));
});

test("specialty + emergency + contacts parse", () => {
  const specs = parseSpecialties(FIXTURE);
  assert.ok(specs.includes("Cardiology") && specs.includes("Oncology"));
  assert.equal(parseEmergency(FIXTURE).hasEmergencyDept, "yes");
  const c = parseContacts(FIXTURE);
  assert.ok(c.phones.length >= 1);
  assert.ok(c.emails.includes("appointments@lilavatihospital.com"));
});

// ---- normalization ----
test("normalizePhone + facility aliasing", () => {
  assert.equal(normalizePhone("+91-22-2675 1000"), "+912226751000");
  assert.equal(normalizePhone("12"), null);
  assert.equal(normalizeFacilityName("Critical Care Unit"), "ICU");
  assert.equal(normalizeFacilityName("Accident and Emergency"), "Emergency Department");
  assert.equal(normalizeFacilityName("Teleporter"), null);
});

test("normalizeRecord enforces availability=unknown (capability only)", () => {
  const rec = normalizeRecord({
    hospital: { name: "X", pincode: "400050" },
    facilities: [{ facility: "ICU", capability: "yes" }],
    specialties: ["Cardiology"],
    emergency: { hasEmergencyDept: "yes" },
    contacts: { phones: ["+912226751000"], emails: [] },
    source: getSource("lilavati"),
    sourceUrl: "https://www.lilavatihospital.com/",
  });
  assert.equal(rec.facilities[0].availability, "unknown"); // NEVER inferred
  assert.equal(rec.facilities[0].capability, "yes");
  assert.equal(rec.provenance.collectionMethod, "crawler");
  assert.equal(rec.provenance.parserVersion, "lilavati-v1");
});

// ---- registry ----
test("registry path allow-list", () => {
  const s = getSource("lilavati");
  assert.ok(isPathAllowed(s, "/facilities"));
  assert.equal(isPathAllowed(s, "/admin/secret"), false);
});

// ---- LilavatiAdapter end-to-end (offline) ----
test("LilavatiAdapter.run() end-to-end via mock fetch", async () => {
  _clearCache();
  const mock = async (url) => {
    if (url.endsWith("/robots.txt")) {
      return { status: 200, text: async () => "User-agent: *\nAllow: /", headers: { get: () => "text/plain" } };
    }
    return { status: 200, text: async () => FIXTURE, headers: { get: () => "text/html; charset=utf-8" } };
  };
  const adapter = new LilavatiAdapter(getSource("lilavati"), { fetchImpl: mock });
  const out = await adapter.run();
  assert.equal(out.ok, true);
  assert.ok(out.pagesVisited >= 1);
  assert.equal(out.record.hospital.name, "Lilavati Hospital & Research Centre");
  assert.equal(out.record.hospital.pincode, "400050");
  // capability present, availability unknown
  const icu = out.record.facilities.find((f) => f.facility === "ICU");
  assert.ok(icu && icu.capability === "yes" && icu.availability === "unknown");
  assert.equal(out.record.emergency.hasEmergencyDept, "yes");
  assert.ok(out.record.specialties.includes("Cardiology"));
  assert.equal(out.record.provenance.sourceId, "lilavati");
});

test("guarded fetch blocks disallowed path (robots)", async () => {
  _clearCache();
  const mock = async (url) => {
    if (url.endsWith("/robots.txt")) return { status: 200, text: async () => "User-agent: *\nDisallow: /", headers: { get: () => "text/plain" } };
    return { status: 200, text: async () => FIXTURE, headers: { get: () => "text/html" } };
  };
  const adapter = new LilavatiAdapter(getSource("lilavati"), { fetchImpl: mock });
  const out = await adapter.run();
  assert.equal(out.ok, false);
  assert.equal(out.reason, "robots_disallowed");
});
