// robots.txt compliance — dependency-free parser + checker with per-host cache.
// Implements the standard longest-match rule: the most specific (longest) matching
// Allow/Disallow rule wins; ties go to Allow. We honor the "*" user-agent group
// (our bot does not seek a more permissive named group). On fetch failure we
// FAIL CLOSED for disallowed-looking hosts only where robots explicitly blocks;
// a missing/unreadable robots.txt (404/empty) is treated as "allow" per convention.

import { httpFetch } from "../fetchers/httpFetcher.js";

const cache = new Map(); // host -> { rules: [{type, path}], fetchedAt }
const TTL_MS = 60 * 60 * 1000; // re-fetch robots at most hourly

function parseRobots(txt) {
  const lines = String(txt).split(/\r?\n/);
  const groups = [];
  let current = null;
  let applies = false;
  const rules = [];
  for (let raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      // Start/extend a group. We only collect rules for the "*" group.
      applies = value === "*";
    } else if ((field === "disallow" || field === "allow") && applies) {
      rules.push({ type: field, path: value });
    }
  }
  return rules;
}

// Longest-match evaluation. Empty Disallow means "allow all".
function evaluate(rules, pathname) {
  let best = null; // { type, len }
  for (const r of rules) {
    if (r.path === "") continue; // "Disallow:" (empty) = allow everything
    // Convert robots pattern to a simple prefix/wildcard match.
    if (matchesRobots(r.path, pathname)) {
      const len = r.path.length;
      if (!best || len > best.len || (len === best.len && r.type === "allow")) {
        best = { type: r.type, len };
      }
    }
  }
  if (!best) return true; // nothing matched → allowed
  return best.type === "allow";
}

// Supports "*" wildcard and "$" end-anchor (common robots extensions).
function matchesRobots(pattern, pathname) {
  const hasEnd = pattern.endsWith("$");
  const pat = hasEnd ? pattern.slice(0, -1) : pattern;
  if (!pat.includes("*")) {
    return hasEnd ? pathname === pat : pathname.startsWith(pat);
  }
  const parts = pat.split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp("^" + parts.join(".*") + (hasEnd ? "$" : ""));
  return re.test(pathname);
}

export async function loadRobots(baseUrl, deps = {}) {
  const host = new URL(baseUrl).host;
  const cached = cache.get(host);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  const robotsUrl = new URL("/robots.txt", baseUrl).href;
  const approvedOrigin = new URL(baseUrl).origin;
  const res = await httpFetch(robotsUrl, {
    fetchImpl: deps.fetchImpl,
    timeoutMs: 8000,
    retries: 1,
    validateRedirect: (next) => {
      const target = new URL(next);
      return target.origin === approvedOrigin && target.pathname === "/robots.txt"
        ? { ok: true }
        : { ok: false, reason: "robots_redirect_not_allowed" };
    },
  });
  // A robots 401/403 is an explicit access refusal, not a missing file.
  const rules = res.ok && res.body ? parseRobots(res.body) : [];
  const entry = { rules, fetchedAt: Date.now(), missing: !res.ok,
    denied: res.status === 401 || res.status === 403 || res.reason === "robots_redirect_not_allowed" };
  cache.set(host, entry);
  return entry;
}

// Returns { allowed:boolean, reason }.
export async function isAllowedByRobots(url, deps = {}) {
  let u;
  try { u = new URL(url); } catch { return { allowed: false, reason: "invalid_url" }; }
  const entry = await loadRobots(`${u.protocol}//${u.host}`, deps);
  if (entry.denied) return { allowed: false, reason: "robots_disallow" };
  if (entry.missing) return { allowed: true, reason: "no_robots" };
  const allowed = evaluate(entry.rules, u.pathname + (u.search || ""));
  return { allowed, reason: allowed ? "robots_allow" : "robots_disallow" };
}

// Test seam: allow injecting parsed rules without network.
export function _evaluateForTest(rules, pathname) {
  return evaluate(rules, pathname);
}
export function _clearCache() {
  cache.clear();
}
