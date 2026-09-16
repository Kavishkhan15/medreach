// HTTP fetcher — SSRF-checked, timed out, retried with backoff. Only fetches
// URLs that pass assertSafeUrl. Injectable `fetchImpl` so tests never touch the
// network. Redirects are NOT auto-followed to an unsafe host (each hop rechecked).

import { assertSafeUrl } from "../ssrf.js";

const DEFAULTS = {
  timeoutMs: 8000,
  retries: 2,
  backoffMs: 500,
  maxBytes: 2 * 1024 * 1024, // 2 MB cap
  maxRedirects: 5,
  userAgent: "MedReachBot/0.1 (+https://medreach.example/bot)",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function httpFetch(rawUrl, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const fetchImpl = opts.fetchImpl || globalThis.fetch;

  const safe = assertSafeUrl(rawUrl);
  if (!safe.ok) return { ok: false, status: 0, reason: safe.reason, body: null };

  let lastErr = null;
  for (let attempt = 0; attempt <= cfg.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetchImpl(safe.url.href, {
        redirect: "manual", // we re-check any redirect target ourselves
        signal: controller.signal,
        headers: { "User-Agent": cfg.userAgent, Accept: "text/html,application/json;q=0.9,*/*;q=0.1" },
      });
      clearTimeout(timer);

      // Handle redirects safely (re-run SSRF check on the Location).
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get?.("location");
        if (!loc) return { ok: false, status: res.status, reason: "redirect_no_location", body: null };
        let next;
        try { next = new URL(loc, safe.url).href; }
        catch { return { ok: false, status: res.status, reason: "invalid_redirect", body: null }; }
        if (!assertSafeUrl(next).ok) return { ok: false, status: res.status, reason: "unsafe_redirect", body: null };
        if ((opts.redirectCount || 0) >= cfg.maxRedirects) {
          return { ok: false, status: res.status, reason: "too_many_redirects", body: null };
        }
        // A caller with a source registry can enforce its own host/path/robots
        // policy on every hop before any network request is made.
        if (opts.validateRedirect) {
          const decision = await opts.validateRedirect(next);
          if (!decision.ok) {
            return { ok: false, status: res.status, reason: decision.reason || "redirect_not_allowed", body: null };
          }
        }
        return httpFetch(next, { ...opts, retries: 0, redirectCount: (opts.redirectCount || 0) + 1 });
      }

      // Retryable server/rate-limit statuses: 429 + 5xx. 4xx (401/403/404) are
      // NOT retried (permanent). Backoff is exponential with jitter.
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        lastErr = new Error(`retryable_${res.status}`);
        if (attempt < cfg.retries) {
          const jitter = Math.floor(Math.random() * cfg.backoffMs);
          await sleep(cfg.backoffMs * 2 ** attempt + jitter);
          continue;
        }
        return { ok: false, status: res.status, reason: res.status === 429 ? "rate_limited" : "server_error", body: null };
      }

      const contentType = (res.headers.get?.("content-type") || "").toLowerCase();
      // Only accept textual/structured content — reject binaries (pdf, images…).
      if (contentType && !/(text\/|application\/(json|ld\+json|xml|xhtml))/i.test(contentType)) {
        return { ok: false, status: res.status, reason: "unsupported_content_type", body: null, contentType };
      }

      const body = await res.text();
      if (body.length > cfg.maxBytes) return { ok: false, status: res.status, reason: "too_large", body: null };
      const ok = res.status >= 200 && res.status < 300;
      return { ok, status: res.status, reason: ok ? null : "http_error", body, contentType,
        finalUrl: safe.url.href };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < cfg.retries) { await sleep(cfg.backoffMs * 2 ** attempt); continue; }
    }
  }
  const aborted = lastErr?.name === "AbortError";
  return { ok: false, status: 0, reason: aborted ? "timeout" : "network_error", body: null };
}
