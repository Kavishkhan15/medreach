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

  const checkSourceBoundary = async (candidate) => {
    const target = new URL(candidate);
    // Restrict both the first URL and every redirect to the registered origin.
    if (target.origin !== new URL(source.baseUrl).origin) return { ok: false, reason: "offsite_blocked" };
    if (!isPathAllowed(source, target.pathname)) return { ok: false, reason: "path_not_allowed" };
    const robots = await isAllowedByRobots(target.href, deps);
    return robots.allowed ? { ok: true } : { ok: false, reason: "robots_disallowed" };
  };
  const initial = await checkSourceBoundary(u.href);
  if (!initial.ok) return { ok: false, status: 0, reason: initial.reason, body: null };
  // 4. SSRF-safe fetch with the source's own timeout.
  return httpFetch(u.href, {
    fetchImpl: deps.fetchImpl,
    timeoutMs: source.timeoutMs || 10000,
    validateRedirect: checkSourceBoundary,
  });
}
