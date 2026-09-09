// guardedFetch — the ONLY way adapters fetch pages. Enforces, in order:
//   1. URL is same-host as the approved source baseUrl
//   2. path is in the source's registry allowedPaths
//   3. robots.txt allows it
//   4. SSRF-safe + size/type/timeout limits (httpFetch)
// Returns { ok, status, reason, body, contentType }.

import { httpFetch } from "./httpFetcher.js";
import { isPathAllowed } from "../registry/sources.js";
import { isAllowedByRobots } from "../robots/robotsChecker.js";

export async function guardedFetch(source, url, deps = {}) {
  let u;
  try { u = new URL(url, source.baseUrl); } catch { return { ok: false, status: 0, reason: "invalid_url", body: null }; }

  // 1. Same host as the approved source only.
  if (u.host !== new URL(source.baseUrl).host) {
    return { ok: false, status: 0, reason: "offsite_blocked", body: null };
  }
  // 2. Registry path allow-list.
  if (!isPathAllowed(source, u.pathname)) {
    return { ok: false, status: 0, reason: "path_not_allowed", body: null };
  }
  // 3. robots.txt.
  const robots = await isAllowedByRobots(u.href, deps);
  if (!robots.allowed) {
    return { ok: false, status: 0, reason: "robots_disallowed", body: null };
  }
  // 4. SSRF-safe fetch with the source's own timeout.
  return httpFetch(u.href, { fetchImpl: deps.fetchImpl, timeoutMs: source.timeoutMs || 10000 });
}
