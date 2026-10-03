// Base adapter — the predictable contract every source adapter implements:
//   fetch() → parse() → normalize() → validate()
// Subclasses override the hooks; the pipeline order is fixed here so behavior is
// uniform and testable. Adapters receive their DataSource config (url, format,
// field maps) so no selectors are hardcoded across the app.

import { assertSafeUrl } from "../ssrf.js";
import { isAllowedByRobots } from "../robots/robotsChecker.js";
import { httpFetch } from "../fetchers/httpFetcher.js";
import { validateResult } from "../validation/validateResult.js";
import { isPathAllowed } from "../registry/sources.js";

export class BaseAdapter {
  constructor(source, deps = {}) {
    this.source = source;            // DataSource record { url, type, accessMethod, config }
    this.fetchImpl = deps.fetchImpl; // injectable for tests
  }

  // Override in subclasses.
  async fetchRaw() {
    let initial;
    try { initial = new URL(this.source.url); }
    catch { return { ok: false, status: 0, reason: "invalid_url", body: null }; }
    const safe = assertSafeUrl(initial.href);
    if (!safe.ok) return { ok: false, status: 0, reason: safe.reason, body: null };
    const checkRobots = async (url) => {
      const result = await isAllowedByRobots(url, { fetchImpl: this.fetchImpl });
      return result.allowed ? { ok: true } : { ok: false, reason: "robots_disallowed" };
    };
    const policy = await checkRobots(initial.href);
    if (!policy.ok) return { ok: false, status: 0, reason: policy.reason, body: null };
    return httpFetch(initial.href, {
      fetchImpl: this.fetchImpl,
      validateRedirect: async (next) => {
        const target = new URL(next);
        if (target.origin !== initial.origin) return { ok: false, reason: "offsite_blocked" };
        // Config-driven feeds have one explicitly approved URL. Registry-backed
        // sources may permit more paths, but never arbitrary same-host paths.
        const pathAllowed = this.source.allowedPaths?.length
          ? isPathAllowed(this.source, target.pathname)
          : target.pathname === initial.pathname && target.search === initial.search;
        return pathAllowed ? checkRobots(next) : { ok: false, reason: "path_not_allowed" };
      },
    });
  }
  parse(/* raw */) { throw new Error("parse() not implemented"); }
  normalize(/* parsed */) { throw new Error("normalize() not implemented"); }
  validate(normalized) { return validateResult(normalized); }

  // Fixed pipeline. Returns a structured outcome — never throws.
  async run() {
    const started = Date.now();
    const res = await this.fetchRaw();
    if (!res.ok) {
      return { ok: false, stage: "fetch", reason: res.reason, status: res.status, durationMs: Date.now() - started };
    }
    let parsed, normalized, validation;
    try {
      parsed = this.parse(res.body);
      normalized = this.normalize(parsed);
    } catch (e) {
      return { ok: false, stage: "parse", reason: e.message, durationMs: Date.now() - started };
    }
    validation = this.validate(normalized);
    return {
      ok: validation.valid,
      stage: validation.valid ? "done" : "validate",
      reason: validation.valid ? null : validation.errors.join(","),
      result: normalized,
      parseQuality: validation.parseQuality,
      errors: validation.errors,
      durationMs: Date.now() - started,
    };
  }
}
