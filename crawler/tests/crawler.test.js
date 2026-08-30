// Crawler unit tests — no live network. A mock fetchImpl returns fixture bodies.
import test from "node:test";
import assert from "node:assert/strict";

import { assertSafeUrl, isSafeUrl } from "../src/ssrf.js";
import { httpFetch } from "../src/fetchers/httpFetcher.js";
import { parseFacilities, parseHospital, parseAvailability } from "../src/parsers/index.js";
import { normalizeStatus, normalizeFacilityName, normalizeFacilities } from "../src/normalization/index.js";
import { validateResult } from "../src/validation/validateResult.js";
import { freshnessLabel } from "../src/freshness/freshness.js";
import { confidenceLevel } from "../src/confidence/confidence.js";
import { crawlSource } from "../src/runner.js";
import { runSchedule } from "../src/scheduler.js";

// ---- SSRF ----
test("SSRF: blocks localhost, private, link-local, non-http, creds", () => {
  assert.equal(isSafeUrl("http://localhost/x"), false);
  assert.equal(isSafeUrl("http://127.0.0.1/x"), false);
  assert.equal(isSafeUrl("http://10.0.0.5/x"), false);
  assert.equal(isSafeUrl("http://192.168.1.1/x"), false);
  assert.equal(isSafeUrl("http://172.16.0.1/x"), false);
  assert.equal(isSafeUrl("http://169.254.169.254/latest/meta-data"), false); // cloud metadata
  assert.equal(isSafeUrl("file:///etc/passwd"), false);
  assert.equal(isSafeUrl("ftp://example.com/x"), false);
  assert.equal(isSafeUrl("http://user:pass@example.com/x"), false);
  assert.equal(isSafeUrl("https://data.hospital.example/api"), true);
  assert.equal(assertSafeUrl("http://[::1]/x").ok, false);
});

// ---- httpFetch with mock ----
test("httpFetch: refuses unsafe URL without calling network", async () => {
  let called = false;
  const res = await httpFetch("http://127.0.0.1/x", { fetchImpl: async () => { called = true; } });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "private_or_local_host");
  assert.equal(called, false);
});

test("httpFetch: returns body on 200 via mock", async () => {
  const mock = async () => ({ status: 200, text: async () => '{"ok":1}', headers: { get: () => "application/json" } });
  const res = await httpFetch("https://data.hospital.example/api", { fetchImpl: mock });
  assert.equal(res.ok, true);
  assert.equal(res.body, '{"ok":1}');
});

test("httpFetch: unsafe redirect is blocked", async () => {
  const mock = async () => ({ status: 302, text: async () => "", headers: { get: (h) => (h === "location" ? "http://169.254.169.254/" : null) } });
  const res = await httpFetch("https://data.hospital.example/api", { fetchImpl: mock });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "unsafe_redirect");
});

// ---- parsers ----
test("parseFacilities: JSON + HTML", () => {
  const json = JSON.stringify({ facilities: [{ name: "ICU", status: "available" }, { name: "ER", status: "full" }] });
  assert.deepEqual(parseFacilities(json, { format: "json" }), [{ facility: "ICU", status: "available" }, { facility: "ER", status: "full" }]);
  const html = `<li data-facility="ICU" data-status="limited"></li><li data-facility="Trauma" data-status="available"></li>`;
  assert.deepEqual(parseFacilities(html, { format: "html" }), [{ facility: "ICU", status: "limited" }, { facility: "Trauma", status: "available" }]);
});

test("parseHospital + parseAvailability JSON", () => {
  const raw = JSON.stringify({ n: "KEM", tel: "102", facilities: [{ name: "ICU", status: "available" }], observedAt: "2026-08-30T10:00:00Z" });
  const h = parseHospital(raw, { format: "json", map: { name: "n", emergencyPhone: "tel" } });
  assert.equal(h.name, "KEM");
  const a = parseAvailability(raw, { format: "json" });
  assert.equal(a.observedAt, "2026-08-30T10:00:00Z");
  assert.equal(a.facilities.length, 1);
});

// ---- normalization ----
test("normalizeStatus + facility aliasing", () => {
  assert.equal(normalizeStatus("OPEN"), "available");
  assert.equal(normalizeStatus("full"), "unavailable");
  assert.equal(normalizeStatus("weird"), "unknown");
  assert.equal(normalizeFacilityName("er"), "Emergency Department");
  assert.equal(normalizeFacilityName("nonsense-xyz"), null);
  assert.equal(normalizeFacilities([{ facility: "icu", status: "yes" }, { facility: "icu", status: "no" }]).length, 1); // dedup
});

// ---- validation ----
test("validateResult flags empty + structure change", () => {
  assert.equal(validateResult({ hospital: {}, availability: { facilities: [] } }).valid, false);
  const allUnknown = { hospital: { name: "X" }, availability: { facilities: [{ facility: "ICU", status: "unknown" }, { facility: "ER", status: "unknown" }, { facility: "CT", status: "unknown" }] } };
  assert.ok(validateResult(allUnknown).errors.includes("all_unknown_possible_structure_change"));
  const good = { hospital: { name: "X" }, availability: { facilities: [{ facility: "ICU", status: "available" }] } };
  assert.equal(validateResult(good).valid, true);
});

// ---- freshness + confidence ----
test("freshness + confidence deterministic", () => {
  const now = Date.now();
  assert.equal(freshnessLabel(new Date(now - 5 * 60000), now), "RECENT");
  assert.equal(freshnessLabel(new Date(now - 3 * 3600000), now), "STALE");
  assert.equal(freshnessLabel(null), "UNKNOWN");
  assert.equal(confidenceLevel({ sourceType: "official_api", timestamp: new Date(now - 60000), verified: true, parseQuality: 1, now }), "HIGH");
  assert.equal(confidenceLevel({ sourceType: "other", timestamp: null }), "UNKNOWN");
});

// ---- runner + scheduler (end-to-end with mock fetch) ----
const jsonBody = JSON.stringify({
  name: "Test Hospital", facilities: [{ name: "ICU", status: "available" }, { name: "ER", status: "limited" }],
  observedAt: new Date().toISOString(),
});
const mockFetch = async () => ({ status: 200, text: async () => jsonBody, headers: { get: () => "application/json" } });

test("crawlSource: success path scores confidence", async () => {
  const source = { _id: "s1", url: "https://data.hospital.example/api", type: "official_api", adapter: "generic", config: { format: "json" } };
  const job = await crawlSource(source, { fetchImpl: mockFetch });
  assert.equal(job.status, "success");
  assert.equal(job.recordsFound, 2);
  assert.ok(["HIGH", "MEDIUM", "LOW"].includes(job.result.facilities[0].confidence));
});

test("crawlSource: blocks unsafe source", async () => {
  const source = { _id: "s2", url: "http://127.0.0.1/api", type: "other" };
  const job = await crawlSource(source, { fetchImpl: mockFetch });
  assert.equal(job.status, "blocked");
});

test("runSchedule: runs multiple sources, skips disabled", async () => {
  const sources = [
    { _id: "a", url: "https://a.example/api", type: "official_api", config: { format: "json" } },
    { _id: "b", url: "https://b.example/api", type: "hospital_site", enabled: false, config: { format: "json" } },
  ];
  const results = await runSchedule(sources, { deps: { fetchImpl: mockFetch }, concurrency: 2 });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "success");
});
