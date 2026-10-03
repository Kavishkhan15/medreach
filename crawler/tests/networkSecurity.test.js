import test from "node:test";
import assert from "node:assert/strict";
import { isSafeUrl } from "../src/ssrf.js";
import { httpFetch, resolvePublicAddresses, pinnedLookup } from "../src/fetchers/httpFetcher.js";
import { _clearCache, _evaluateForTest, isAllowedByRobots } from "../src/robots/robotsChecker.js";
import { guardedFetch } from "../src/fetchers/guardedFetch.js";
import { getSource } from "../src/registry/sources.js";

for (const address of ["::", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "fe90::1", "ff02::1", "2002:7f00:1::", "2001:db8::1"]) {
  test(`SSRF refuses reserved IPv6 ${address}`, () => assert.equal(isSafeUrl(`http://[${address}]/`), false));
}
for (const host of ["localhost.", "x.localhost.", "x.internal.", "198.18.0.1", "192.0.0.1"]) {
  test(`SSRF refuses local/reserved host ${host}`, () => assert.equal(isSafeUrl(`http://${host}/`), false));
}

test("DNS rejects mixed public/private answers before calling transport", async () => {
  let calls = 0;
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::ffff:7f00:1"]) {
    const out = await httpFetch("https://approved.example/", {
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }, { address, family: address.includes(":") ? 6 : 4 }],
      fetchImpl: async () => { calls++; return new Response("unsafe"); },
    });
    assert.equal(out.reason, "unsafe_dns_destination");
  }
  assert.equal(calls, 0);
});

test("connection lookup uses only validated DNS addresses and refuses unexpected host", async () => {
  let resolutions = 0;
  const addresses = await resolvePublicAddresses("approved.example", { lookupImpl: async () => {
    resolutions++;
    return [{ address: "93.184.216.34", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }];
  } });
  const lookup = pinnedLookup("approved.example", addresses);
  const result = await new Promise((resolve, reject) => lookup("approved.example", { all: true }, (err, data) => err ? reject(err) : resolve(data)));
  assert.deepEqual(result, addresses);
  assert.equal(resolutions, 1);
  const ipv4 = await new Promise((resolve, reject) => lookup("approved.example", { family: 4 }, (err, address) => err ? reject(err) : resolve(address)));
  assert.equal(ipv4, "93.184.216.34");
  await assert.rejects(new Promise((resolve, reject) => lookup("other.example", {}, (err) => err ? reject(err) : resolve())), /Unexpected/);
});

test("every redirect destination is resolved and rejected before private transport", async () => {
  const visited = [];
  const out = await httpFetch("https://approved.example/", {
    lookupImpl: async (host) => [{ address: host === "approved.example" ? "93.184.216.34" : "127.0.0.1", family: 4 }],
    fetchImpl: async (url) => { visited.push(url); return new Response(null, { status: 302, headers: { location: "https://rebound.example/" } }); },
  });
  assert.equal(out.reason, "unsafe_dns_destination");
  assert.deepEqual(visited, ["https://approved.example/"]);
});

test("DNS resolution is included in the timeout", async () => {
  const out = await httpFetch("https://approved.example/", {
    lookupImpl: () => new Promise(() => {}), fetchImpl: async () => { throw new Error("must not connect"); }, timeoutMs: 10, retries: 0,
  });
  assert.equal(out.reason, "timeout");
});

test("stream cap counts UTF-8 bytes and cancels before consuming entire body", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode("🙂🙂"));
  }, cancel() { cancelled = true; } });
  const out = await httpFetch("https://approved.example/", { fetchImpl: async () => new Response(stream), maxBytes: 7, retries: 0 });
  assert.equal(out.reason, "too_large");
  assert.equal(cancelled, true);
});

test("body reads remain timed out after headers arrive", async () => {
  let cancelled = false;
  const out = await httpFetch("https://approved.example/", {
    fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })), timeoutMs: 10, retries: 0,
  });
  assert.equal(out.reason, "timeout");
  assert.equal(cancelled, true);
});

test("content-length rejects oversized bodies before reading", async () => {
  const out = await httpFetch("https://approved.example/", { fetchImpl: async () => new Response("tiny", { headers: { "content-length": "99999" } }), maxBytes: 10 });
  assert.equal(out.reason, "too_large");
});

for (const status of [401, 403, 429, 500, 503]) {
  test(`unreadable robots ${status} blocks page access`, async () => {
    _clearCache();
    let calls = 0;
    const out = await guardedFetch(getSource("lilavati"), "/", { fetchImpl: async (url) => {
      assert.ok(url.endsWith("/robots.txt")); calls++;
      return new Response("unavailable", { status, headers: { "content-type": "text/plain" } });
    } });
    assert.equal(out.reason, "robots_disallowed");
    assert.ok(calls > 0);
  });
}

test("robots network failure blocks while genuine missing policy permits pages", async () => {
  _clearCache();
  assert.equal((await isAllowedByRobots("https://approved.example/", { fetchImpl: async () => { throw new Error("offline"); } })).allowed, false);
  for (const status of [404, 410]) {
    _clearCache();
    assert.equal((await isAllowedByRobots("https://approved.example/", { fetchImpl: async () => new Response("", { status }) })).allowed, true);
  }
});

test("named bot and shared user-agent groups retain restrictions", async () => {
  for (const body of ["User-agent: *\nUser-agent: OtherBot\nDisallow: /private", "User-agent: *\nAllow: /\nUser-agent: MedReachBot\nDisallow: /private", "User-agent: *\nAllow: /\nUser-agent: MedReachBot\nDisallow: /"]) {
    _clearCache();
    assert.equal((await isAllowedByRobots("https://approved.example/private", { fetchImpl: async () => new Response(body) })).allowed, false);
  }
});

test("robots policies are cached per origin, not shared across HTTP and HTTPS", async () => {
  _clearCache();
  const fetchImpl = async (url) => new Response(url.startsWith("https:") ? "User-agent: *\nDisallow: /" : "User-agent: *\nAllow: /");
  assert.equal((await isAllowedByRobots("http://approved.example/", { fetchImpl })).allowed, true);
  assert.equal((await isAllowedByRobots("https://approved.example/", { fetchImpl })).allowed, false);
});

test("legacy feed crawler obeys robots policy and reports blocked without fetching its feed", async () => {
  const { crawlSource } = await import("../src/runner.js");
  const visits = [];
  _clearCache();
  const job = await crawlSource({ _id: "legacy-security", url: "https://approved.example/feed", type: "official_api", config: { format: "json" } }, {
    fetchImpl: async (url) => { visits.push(url); return new Response("User-agent: *\nDisallow: /feed"); },
  });
  assert.equal(job.status, "blocked");
  assert.deepEqual(visits, ["https://approved.example/robots.txt"]);
});

test("standalone and backend crawler guards remain identical", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of ["ssrf.js", "fetchers/httpFetcher.js", "robots/robotsChecker.js", "adapters/baseAdapter.js", "runner.js", "orchestrator.js"]) {
    assert.equal(await readFile(new URL(`../src/${file}`, import.meta.url), "utf8"),
      await readFile(new URL(`../../backend/src/_crawler/${file}`, import.meta.url), "utf8"));
  }
  const { httpFetch: embeddedFetch } = await import("../../backend/src/_crawler/fetchers/httpFetcher.js");
  const out = await embeddedFetch("https://approved.example/", {
    lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
    fetchImpl: async () => { throw new Error("must not connect"); },
  });
  assert.equal(out.reason, "unsafe_dns_destination");
});

test("hostile wildcard robots patterns cannot trigger regex backtracking", () => {
  assert.equal(_evaluateForTest([{ type: "disallow", path: "/" + "*".repeat(100) + "never$" }], "/" + "a".repeat(1000)), true);
  assert.equal(_evaluateForTest([{ type: "disallow", path: "/files/*.pdf$" }], "/files/cv.pdf"), false);
  assert.equal(_evaluateForTest([{ type: "disallow", path: "/files/*.pdf$" }], "/files/cv.pdf/other"), true);
});
