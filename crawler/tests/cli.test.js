// CLI + orchestrator + record-validator tests — fully OFFLINE (mock fetchImpl).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { main } from "../src/cli.js";
import { crawlHospitalSource, CRAWL_STATUS } from "../src/orchestrator.js";
import { createMemoryRepo } from "../src/persistence/memoryRepo.js";
import { getSource } from "../src/registry/sources.js";
import { validateNormalizedRecord, isValidPhone, isValidUrl, isValidPincode } from "../src/validation/validateRecord.js";
import { _clearCache } from "../src/robots/robotsChecker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, "fixtures", "lilavati.html"), "utf8");

const okMock = async (url) => {
  if (url.endsWith("/robots.txt")) return { status: 200, text: async () => "User-agent: *\nAllow: /", headers: { get: () => "text/plain" } };
  return { status: 200, text: async () => FIXTURE, headers: { get: () => "text/html; charset=utf-8" } };
};

// ---- record validation ----
test("validators: phone / url / pincode", () => {
  assert.equal(isValidPhone("+912226751000"), true);
  assert.equal(isValidPhone("12"), false);
  assert.equal(isValidPhone(null), true); // absent allowed
  assert.equal(isValidUrl("https://x.example"), true);
  assert.equal(isValidUrl("file:///etc/passwd"), false);
  assert.equal(isValidPincode("400050"), true);
  assert.equal(isValidPincode("40005"), false);
});

test("validateNormalizedRecord: rejects missing name + live availability claim", () => {
  const base = {
    hospital: { name: "Test Hospital" },
    facilities: [{ facility: "ICU", capability: "yes", availability: "unknown" }],
    specialties: ["Cardiology"],
    emergency: { hasEmergencyDept: "yes" },
    provenance: { sourceId: "x", collectionMethod: "crawler", parserVersion: "x-v1" },
    retrievedAt: new Date().toISOString(),
  };
  assert.equal(validateNormalizedRecord(base).valid, true);

  const noName = { ...base, hospital: { name: "" } };
  assert.ok(validateNormalizedRecord(noName).errors.includes("invalid_hospital_name"));

  // A static crawl claiming live availability must be rejected.
  const claimsLive = { ...base, facilities: [{ facility: "ICU", capability: "yes", availability: "available" }] };
  assert.ok(validateNormalizedRecord(claimsLive).errors.some((e) => e.startsWith("availability_must_be_unknown")));

  // Fabricated bed counts must be rejected.
  const fabricated = { ...base, facilities: [{ facility: "ICU", capability: "yes", availability: "unknown", quantity: 12 }] };
  assert.ok(validateNormalizedRecord(fabricated).errors.some((e) => e.startsWith("unexpected_quantity")));

  // Missing provenance must be rejected.
  const noProv = { ...base, provenance: {} };
  const errs = validateNormalizedRecord(noProv).errors;
  assert.ok(errs.includes("missing_provenance_sourceId"));
});

// ---- orchestrator / CrawlJob ----
test("orchestrator: success job shape + CrawlJob fields", async () => {
  _clearCache();
  const repo = createMemoryRepo();
  const job = await crawlHospitalSource(getSource("lilavati"), { deps: { fetchImpl: okMock }, repo });
  assert.equal(job.status, CRAWL_STATUS.SUCCESS);
  assert.equal(job.sourceId, "lilavati");
  assert.ok(job.pagesVisited >= 1);
  assert.ok(job.recordsFound > 0);
  assert.equal(job.recordsCreated, 1);
  assert.ok(["HIGH", "MEDIUM", "LOW"].includes(job.confidence));
  assert.ok(job.durationMs >= 0);
  assert.ok(job.startedAt instanceof Date && job.completedAt instanceof Date);
  // observations recorded with availability unknown
  assert.ok(repo.store.observations.length > 0);
  assert.ok(repo.store.observations.every((o) => o.status === "unknown" && o.quantity === null));
});

test("orchestrator: second identical run => NO_CHANGE, no new writes", async () => {
  _clearCache();
  const repo = createMemoryRepo();
  await crawlHospitalSource(getSource("lilavati"), { deps: { fetchImpl: okMock }, repo });
  const before = repo.store.observations.length;
  const job2 = await crawlHospitalSource(getSource("lilavati"), { deps: { fetchImpl: okMock }, repo });
  assert.equal(job2.classification, "NO_CHANGE");
  assert.equal(job2.recordsSkipped, 1);
  assert.equal(repo.store.observations.length, before);
});

test("orchestrator: dry-run writes nothing", async () => {
  _clearCache();
  const repo = createMemoryRepo();
  const job = await crawlHospitalSource(getSource("lilavati"), { deps: { fetchImpl: okMock }, repo, dryRun: true });
  assert.equal(job.dryRun, true);
  assert.equal(repo.store.observations.length, 0);
  assert.equal(repo.store.facilities.length, 0);
});

test("orchestrator: robots disallow => BLOCKED + sourceState robots_disallowed", async () => {
  _clearCache();
  const blockMock = async (url) => {
    if (url.endsWith("/robots.txt")) return { status: 200, text: async () => "User-agent: *\nDisallow: /", headers: { get: () => "text/plain" } };
    return { status: 200, text: async () => FIXTURE, headers: { get: () => "text/html" } };
  };
  const job = await crawlHospitalSource(getSource("lilavati"), { deps: { fetchImpl: blockMock }, repo: createMemoryRepo() });
  assert.equal(job.status, CRAWL_STATUS.BLOCKED);
  assert.equal(job.sourceState, "robots_disallowed");
});

test("orchestrator: disabled source => BLOCKED, never fetched", async () => {
  let fetched = false;
  const spy = async () => { fetched = true; return { status: 200, text: async () => "", headers: { get: () => "text/html" } }; };
  const disabled = { ...getSource("lilavati"), enabled: false };
  const job = await crawlHospitalSource(disabled, { deps: { fetchImpl: spy }, repo: createMemoryRepo() });
  assert.equal(job.status, CRAWL_STATUS.BLOCKED);
  assert.equal(fetched, false);
});

test("orchestrator: server error => FAILED (resilient, no throw)", async () => {
  _clearCache();
  const errMock = async (url) => {
    if (url.endsWith("/robots.txt")) return { status: 200, text: async () => "User-agent: *\nAllow: /", headers: { get: () => "text/plain" } };
    return { status: 500, text: async () => "", headers: { get: () => "text/html" } };
  };
  const job = await crawlHospitalSource(getSource("lilavati"), { deps: { fetchImpl: errMock }, repo: createMemoryRepo() });
  assert.equal(job.status, CRAWL_STATUS.FAILED);
  assert.ok(job.errorMessages.length > 0);
});

// ---- CLI ----
test("CLI: --list and --help exit 0", async () => {
  assert.equal(await main(["--list"]), 0);
  assert.equal(await main(["--help"]), 0);
});

test("CLI: unknown source exits 2", async () => {
  assert.equal(await main(["--source", "not-a-hospital"]), 2);
});

test("CLI: no args prints usage exit 1", async () => {
  assert.equal(await main([]), 1);
});

test("CLI: --source lilavati --dry-run succeeds without writes", async () => {
  _clearCache();
  const repo = createMemoryRepo();
  const code = await main(["--source", "lilavati", "--dry-run"], { deps: { fetchImpl: okMock }, repo });
  assert.equal(code, 0);
  assert.equal(repo.store.observations.length, 0);
});

test("CLI: --all crawls every enabled source (resilient)", async () => {
  _clearCache();
  const repo = createMemoryRepo();
  const code = await main(["--all", "--dry-run"], { deps: { fetchImpl: okMock }, repo });
  assert.equal(code, 0);
});
