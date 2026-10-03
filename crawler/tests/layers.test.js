// Per-layer tests required by spec §32: fetcher edge cases, freshness, confidence,
// scheduler rate limiting/concurrency. All OFFLINE.
import test from "node:test";
import assert from "node:assert/strict";

import { httpFetch } from "../src/fetchers/httpFetcher.js";
import { BaseAdapter } from "../src/adapters/baseAdapter.js";
import { guardedFetch } from "../src/fetchers/guardedFetch.js";
import { freshnessLabel, THRESHOLDS_MS } from "../src/freshness/freshness.js";
import { confidenceLevel, SOURCE_RELIABILITY } from "../src/confidence/confidence.js";
import { runSchedule } from "../src/scheduler.js";
import { getSource } from "../src/registry/sources.js";
import { _clearCache, loadRobots } from "../src/robots/robotsChecker.js";

const res = (status, body = "", ct = "text/html") => ({
  status, text: async () => body, headers: { get: (h) => (h.toLowerCase() === "content-type" ? ct : null) },
});

// ---- FETCHER ----
test("fetcher: 404 is not retried (permanent)", async () => {
  let calls = 0;
  const mock = async () => { calls++; return res(404); };
  const out = await httpFetch("https://x.example/missing", { fetchImpl: mock, retries: 2, backoffMs: 1 });
  assert.equal(out.ok, false);
  assert.equal(out.status, 404);
  assert.equal(calls, 1, "404 must not be retried");
});

test("fetcher: 500 IS retried then reports server_error", async () => {
  let calls = 0;
  const mock = async () => { calls++; return res(500); };
  const out = await httpFetch("https://x.example/boom", { fetchImpl: mock, retries: 2, backoffMs: 1 });
  assert.equal(out.reason, "server_error");
  assert.equal(calls, 3, "1 initial + 2 retries");
});

test("fetcher: 429 retried then rate_limited", async () => {
  let calls = 0;
  const mock = async () => { calls++; return res(429); };
  const out = await httpFetch("https://x.example/slow", { fetchImpl: mock, retries: 1, backoffMs: 1 });
  assert.equal(out.reason, "rate_limited");
  assert.equal(calls, 2);
});

test("fetcher: timeout (abort) reported as timeout", async () => {
  const mock = async (_u, { signal }) => {
    const err = new Error("aborted"); err.name = "AbortError";
    if (signal) throw err;
    throw err;
  };
  const out = await httpFetch("https://x.example/hang", { fetchImpl: mock, retries: 0, timeoutMs: 5 });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "timeout");
});

test("fetcher: non-text content-type rejected (no binary parsing)", async () => {
  const mock = async () => res(200, "%PDF-1.7", "application/pdf");
  const out = await httpFetch("https://x.example/file", { fetchImpl: mock, retries: 0 });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "unsupported_content_type");
});

test("fetcher: oversized response rejected", async () => {
  const big = "x".repeat(1024);
  const mock = async () => res(200, big);
  const out = await httpFetch("https://x.example/big", { fetchImpl: mock, retries: 0, maxBytes: 100 });
  assert.equal(out.reason, "too_large");
});

test("fetcher: invalid URL rejected without network call", async () => {
  let called = false;
  const out = await httpFetch("not-a-url", { fetchImpl: async () => { called = true; return res(200); } });
  assert.equal(out.ok, false);
  assert.equal(called, false);
});

// ---- guardedFetch layering ----
test("guardedFetch: offsite host blocked", async () => {
  const out = await guardedFetch(getSource("lilavati"), "https://evil.example/x", { fetchImpl: async () => res(200) });
  assert.equal(out.reason, "offsite_blocked");
});

test("guardedFetch: path outside registry allowlist blocked", async () => {
  const out = await guardedFetch(getSource("lilavati"), "/admin/secret", { fetchImpl: async () => res(200) });
  assert.equal(out.reason, "path_not_allowed");
});

test("guardedFetch: redirect cannot leave the approved source", async () => {
  _clearCache();
  const visits = [];
  const mock = async (url) => {
    visits.push(url);
    if (url.endsWith("/robots.txt")) return res(200, "User-agent: *\nAllow: /", "text/plain");
    return {
      status: 302,
      headers: { get: (key) => key === "location" ? "https://example.org/unapproved" : null },
      text: async () => "",
    };
  };
  const out = await guardedFetch(getSource("lilavati"), "/", { fetchImpl: mock });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "offsite_blocked");
  assert.equal(visits.includes("https://example.org/unapproved"), false);
});

test("guardedFetch: redirect cannot reach an unapproved path on the same source", async () => {
  _clearCache();
  const visits = [];
  const mock = async (url) => {
    visits.push(url);
    if (url.endsWith("/robots.txt")) return res(200, "User-agent: *\nAllow: /", "text/plain");
    return {
      status: 302,
      headers: { get: (key) => key === "location" ? "/admin/secret" : null },
      text: async () => "",
    };
  };
  const out = await guardedFetch(getSource("lilavati"), "/", { fetchImpl: mock });
  assert.equal(out.reason, "path_not_allowed");
  assert.equal(visits.includes("https://www.lilavatihospital.com/admin/secret"), false);
});

for (const destination of ["http://localhost/private", "http://127.0.0.1/private", "http://169.254.169.254/private"]) {
  test(`guardedFetch: redirect to ${destination} is blocked before fetch`, async () => {
    _clearCache();
    const visits = [];
    const mock = async (url) => {
      visits.push(url);
      if (url.endsWith("/robots.txt")) return res(200, "User-agent: *\nAllow: /", "text/plain");
      return {
        status: 302,
        headers: { get: (key) => key === "location" ? destination : null },
        text: async () => "",
      };
    };
    const out = await guardedFetch(getSource("lilavati"), "/", { fetchImpl: mock });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "unsafe_redirect");
    assert.equal(visits.includes(destination), false);
  });
}

test("guardedFetch: approved same-origin, allowlisted redirect succeeds", async () => {
  _clearCache();
  const visits = [];
  const mock = async (url) => {
    visits.push(url);
    if (url.endsWith("/robots.txt")) return res(200, "User-agent: *\nAllow: /", "text/plain");
    if (url.endsWith("/contact-us")) return res(200, "<h1>Contact</h1>");
    return {
      status: 302,
      headers: { get: (key) => key === "location" ? "/contact-us" : null },
      text: async () => "",
    };
  };
  const out = await guardedFetch(getSource("lilavati"), "/", { fetchImpl: mock });
  assert.equal(out.ok, true);
  assert.equal(out.body, "<h1>Contact</h1>");
  assert.equal(out.finalUrl, "https://www.lilavatihospital.com/contact-us");
  assert.deepEqual(visits, [
    "https://www.lilavatihospital.com/robots.txt",
    "https://www.lilavatihospital.com/",
    "https://www.lilavatihospital.com/contact-us",
  ]);
});

test("legacy adapter blocks redirect to another host before requesting it", async () => {
  _clearCache();
  const visits = [];
  const adapter = new BaseAdapter({ url: "https://approved.example/feed" }, {
    fetchImpl: async (url) => {
      visits.push(url);
      if (url.endsWith("/robots.txt")) return res(200, "User-agent: *\nAllow: /", "text/plain");
      return { status: 302, headers: { get: (key) => key === "location" ? "https://other.example/feed" : null } };
    },
  });
  const result = await adapter.fetchRaw();
  assert.equal(result.reason, "offsite_blocked");
  assert.deepEqual(visits.filter((url) => !url.endsWith("/robots.txt")), ["https://approved.example/feed"]);
});

test("legacy adapter blocks unapproved same-host path before requesting it", async () => {
  _clearCache();
  const visits = [];
  const adapter = new BaseAdapter({ url: "https://approved.example/feed" }, {
    fetchImpl: async (url) => {
      visits.push(url);
      if (url.endsWith("/robots.txt")) return res(200, "User-agent: *\nAllow: /", "text/plain");
      return { status: 302, headers: { get: (key) => key === "location" ? "/private" : null } };
    },
  });
  const result = await adapter.fetchRaw();
  assert.equal(result.reason, "path_not_allowed");
  assert.deepEqual(visits.filter((url) => !url.endsWith("/robots.txt")), ["https://approved.example/feed"]);
});

test("legacy adapter follows a registered same-host path", async () => {
  _clearCache();
  const visits = [];
  const adapter = new BaseAdapter({
    url: "https://approved.example/", allowedPaths: ["/", "/contact-us"],
  }, {
    fetchImpl: async (url) => {
      visits.push(url);
      if (url.endsWith("/robots.txt")) return res(200, "User-agent: *\nAllow: /", "text/plain");
      return url.endsWith("/contact-us") ? res(200, "Contact")
        : { status: 302, headers: { get: (key) => key === "location" ? "/contact-us" : null } };
    },
  });
  const result = await adapter.fetchRaw();
  assert.equal(result.ok, true);
  assert.equal(result.finalUrl, "https://approved.example/contact-us");
  assert.deepEqual(visits.filter((url) => !url.endsWith("/robots.txt")), ["https://approved.example/", "https://approved.example/contact-us"]);
});

test("httpFetch: caps redirect chains", async () => {
  let calls = 0;
  const mock = async () => {
    calls++;
    return {
      status: 302,
      headers: { get: (key) => key === "location" ? "/again" : null },
      text: async () => "",
    };
  };
  const out = await httpFetch("https://example.org/again", { fetchImpl: mock, maxRedirects: 2 });
  assert.equal(out.reason, "too_many_redirects");
  assert.equal(calls, 3, "the destination after the second redirect must not be requested");
});

test("robots loader: redirect cannot fetch another host", async () => {
  _clearCache();
  const visits = [];
  const mock = async (url) => {
    visits.push(url);
    return {
      status: 302,
      headers: { get: (key) => key === "location" ? "https://example.org/robots.txt" : null },
      text: async () => "",
    };
  };
  const result = await loadRobots("https://www.lilavatihospital.com", { fetchImpl: mock });
  assert.equal(result.missing, true);
  assert.deepEqual(visits, ["https://www.lilavatihospital.com/robots.txt"]);
});

// ---- FRESHNESS ----
test("freshness: recent / updated / stale / outdated / unknown", () => {
  const now = Date.now();
  assert.equal(freshnessLabel(new Date(now - 60_000), now), "RECENT");
  assert.equal(freshnessLabel(new Date(now - 30 * 60_000), now), "UPDATED_RECENTLY");
  assert.equal(freshnessLabel(new Date(now - 3 * 3600_000), now), "STALE");
  assert.equal(freshnessLabel(new Date(now - 24 * 3600_000), now), "OUTDATED");
  assert.equal(freshnessLabel(null, now), "UNKNOWN");
  assert.equal(freshnessLabel("not-a-date", now), "UNKNOWN");
});

test("freshness: thresholds are configurable constants", () => {
  assert.equal(THRESHOLDS_MS.RECENT, 10 * 60 * 1000);
  assert.equal(THRESHOLDS_MS.UPDATED_RECENTLY, 60 * 60 * 1000);
  assert.equal(THRESHOLDS_MS.STALE, 6 * 60 * 60 * 1000);
});

// ---- CONFIDENCE ----
test("confidence: HIGH requires reliable+recent+verified", () => {
  const now = Date.now();
  const high = confidenceLevel({ sourceType: "official_api", timestamp: new Date(now - 60_000), verified: true, parseQuality: 1, now });
  assert.equal(high, "HIGH");
});

test("confidence: hospital_site recent+unverified => MEDIUM, old => LOW/UNKNOWN", () => {
  const now = Date.now();
  const med = confidenceLevel({ sourceType: "hospital_site", timestamp: new Date(now - 5 * 60_000), verified: false, parseQuality: 1, now });
  assert.equal(med, "MEDIUM");
  const stale = confidenceLevel({ sourceType: "hospital_site", timestamp: new Date(now - 3 * 3600_000), verified: false, parseQuality: 0.5, now });
  assert.ok(["LOW", "MEDIUM"].includes(stale));
  assert.equal(confidenceLevel({ sourceType: "hospital_site", timestamp: null }), "UNKNOWN");
  // Honesty cap: information older than the STALE window is never above LOW,
  // even from the most reliable source type.
  assert.equal(confidenceLevel({ sourceType: "official_api", timestamp: new Date(now - 48 * 3600_000), verified: true, now }), "LOW");
});

test("confidence: source reliability ordering is deterministic", () => {
  assert.ok(SOURCE_RELIABILITY.official_api > SOURCE_RELIABILITY.government);
  assert.ok(SOURCE_RELIABILITY.government > SOURCE_RELIABILITY.hospital_site);
  assert.ok(SOURCE_RELIABILITY.hospital_site > SOURCE_RELIABILITY.other);
});

// ---- SCHEDULER (rate limiting / politeness) ----
test("scheduler: respects per-host min interval and skips disabled", async () => {
  const waits = [];
  const sources = [
    { _id: "a", url: "https://same.example/a", type: "official_api", config: { format: "json" } },
    { _id: "b", url: "https://same.example/b", type: "official_api", config: { format: "json" } },
    { _id: "c", url: "https://same.example/c", type: "official_api", enabled: false, config: { format: "json" } },
  ];
  const body = JSON.stringify({ name: "H", facilities: [{ name: "ICU", status: "available" }], observedAt: new Date().toISOString() });
  const results = await runSchedule(sources, {
    concurrency: 1,
    minHostIntervalMs: 1000,
    deps: { fetchImpl: async () => res(200, body, "application/json") },
    now: () => 0, // frozen clock → second same-host job must wait
    sleep: async (ms) => { waits.push(ms); },
  });
  assert.equal(results.length, 2, "disabled source skipped");
  assert.ok(waits.some((w) => w > 0), "same-host request was throttled");
});
