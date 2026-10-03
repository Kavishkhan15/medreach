// robots.txt policy is cached per origin. Unreadable policies fail closed.
import { httpFetch } from "../fetchers/httpFetcher.js";

const cache = new Map(); // host -> { rules: [{type, path}], fetchedAt }
const TTL_MS = 60 * 60 * 1000; // re-fetch robots at most hourly

function parseRobots(txt) {
  const groups = [];
  let group = { agents: [], rules: [] };
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && group.agents.length) {
      group.rules.push({ type: field, path: value });
    }
  }
  groups.push(group);
  // Apply general restrictions as well as our named group; never seek a bypass group.
  return groups.filter(({ agents }) => agents.some((agent) => agent === "*" ||
    (agent && "medreachbot".startsWith(agent)))).map(({ rules }) => rules);
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
  // Iterative glob matching avoids exponential RegExp backtracking on hostile robots files.
  let input = 0, token = 0, star = -1, restart = 0;
  while (input < pathname.length) {
    if (token === pat.length && !hasEnd) return true;
    if (pat[token] === "*") {
      star = token++;
      restart = input;
    } else if (pat[token] === pathname[input]) {
      token++;
      input++;
    } else if (star >= 0) {
      token = star + 1;
      input = ++restart;
    } else return false;
  }
  while (pat[token] === "*") token++;
  return token === pat.length;
}

export async function loadRobots(baseUrl, deps = {}) {
  const host = new URL(baseUrl).origin;
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
  const ruleGroups = res.ok && res.body ? parseRobots(res.body) : [];
  const rules = ruleGroups.flat();
  const entry = { rules, ruleGroups, fetchedAt: Date.now(), missing: !res.ok,
    denied: !res.ok && !(res.reason === "http_error" && [404, 410].includes(res.status)) };
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
  const allowed = entry.ruleGroups.every((rules) => evaluate(rules, u.pathname + (u.search || "")));
  return { allowed, reason: allowed ? "robots_allow" : "robots_disallow" };
}

// Test seam: allow injecting parsed rules without network.
export function _evaluateForTest(rules, pathname) {
  return evaluate(rules, pathname);
}
export function _clearCache() {
  cache.clear();
}
