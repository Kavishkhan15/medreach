// HTTP fetcher — SSRF-checked, timed out, retried with backoff. Only fetches
// URLs that pass assertSafeUrl. Injectable `fetchImpl` so tests never touch the
// network. Redirects are NOT auto-followed to an unsafe host (each hop rechecked).

import { assertSafeUrl } from "../ssrf.js";

const DEFAULTS = {
  timeoutMs: 8000,
  retries: 2,
  backoffMs: 500,
  maxBytes: 2 * 1024 * 1024, // 2 MB cap
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
        const next = new URL(loc, safe.url).href;
        if (!assertSafeUrl(next).ok) return { ok: false, status: res.status, reason: "unsafe_redirect", body: null };
        return httpFetch(next, { ...opts, retries: 0 });
      }

      if (res.status === 429 || res.status === 503) {
        lastErr = new Error(`rate_limited_${res.status}`);
        if (attempt < cfg.retries) { await sleep(cfg.backoffMs * 2 ** attempt); continue; }
        return { ok: false, status: res.status, reason: "rate_limited", body: null };
      }

      const body = await res.text();
      if (body.length > cfg.maxBytes) return { ok: false, status: res.status, reason: "too_large", body: null };
      const ok = res.status >= 200 && res.status < 300;
      return { ok, status: res.status, reason: ok ? null : "http_error", body,
        contentType: res.headers.get?.("content-type") || "" };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < cfg.retries) { await sleep(cfg.backoffMs * 2 ** attempt); continue; }
    }
  }
  const aborted = lastErr?.name === "AbortError";
  return { ok: false, status: 0, reason: aborted ? "timeout" : "network_error", body: null };
}
