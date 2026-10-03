// Bound DNS, headers and body reads; pin sockets to DNS addresses checked here.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch } from "undici";
import { assertSafeUrl, isPublicAddress } from "../ssrf.js";

const DEFAULTS = {
  timeoutMs: 8000, retries: 2, backoffMs: 500, maxBytes: 2 * 1024 * 1024, maxRedirects: 5,
  userAgent: "MedReachBot/0.1 (+https://medreach.example/bot)",
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bounded(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error("Fetch timed out"), { name: "AbortError" }));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function resolvePublicAddresses(hostname, { lookupImpl = lookup, signal } = {}) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }]
    : await (signal ? bounded(lookupImpl(host, { all: true }), signal) : lookupImpl(host, { all: true }));
  if (!Array.isArray(addresses) || !addresses.length || addresses.some(({ address, family }) =>
    !isPublicAddress(address) || isIP(address) !== family)) {
    throw Object.assign(new Error("Non-public DNS destination"), { code: "unsafe_dns_destination" });
  }
  return addresses;
}

// No DNS lookup occurs inside connect: the validated result is the connection result.
export function pinnedLookup(hostname, addresses) {
  return (host, options, callback) => {
    if (host !== hostname) { callback(new Error("Unexpected connection hostname")); return; }
    const candidates = addresses.filter((entry) => !options.family || entry.family === options.family);
    if (!candidates.length) { callback(new Error("No approved address for family")); return; }
    if (options.all) callback(null, candidates);
    else callback(null, candidates[0].address, candidates[0].family);
  };
}

async function readBody(res, cfg, signal, injected) {
  const declared = Number(res.headers.get?.("content-length"));
  if (Number.isFinite(declared) && declared > cfg.maxBytes) throw Object.assign(new Error("Body limit"), { code: "too_large" });
  if (!res.body?.getReader) {
    // Legacy offline fixtures are plain objects. Actual network responses must stream.
    if (!injected) return "";
    const text = await bounded(res.text(), signal);
    if (Buffer.byteLength(text, "utf8") > cfg.maxBytes) throw Object.assign(new Error("Body limit"), { code: "too_large" });
    return text;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await bounded(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > cfg.maxBytes) throw Object.assign(new Error("Body limit"), { code: "too_large" });
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size).toString("utf8");
  } catch (err) {
    void reader.cancel().catch(() => {});
    throw err;
  } finally { reader.releaseLock(); }
}

export async function httpFetch(rawUrl, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const safe = assertSafeUrl(rawUrl);
  if (!safe.ok) return { ok: false, status: 0, reason: safe.reason, body: null };
  const fetchImpl = opts.fetchImpl || fetch;
  let lastErr;
  for (let attempt = 0; attempt <= cfg.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    let dispatcher;
    let res;
    let retryDelay;
    try {
      // Injected offline transports never connect. Tests may supply lookupImpl to exercise DNS checks.
      if (!opts.fetchImpl || opts.lookupImpl) {
        const addresses = await resolvePublicAddresses(safe.url.hostname, { lookupImpl: opts.lookupImpl, signal: controller.signal });
        dispatcher = new Agent({ connect: { lookup: pinnedLookup(safe.url.hostname, addresses) } });
      }
      res = await bounded(fetchImpl(safe.url.href, {
        redirect: "manual", signal: controller.signal, ...(dispatcher ? { dispatcher } : {}),
        headers: { "User-Agent": cfg.userAgent, Accept: "text/html,application/json;q=0.9,*/*;q=0.1" },
      }), controller.signal);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get?.("location");
        if (!loc) return { ok: false, status: res.status, reason: "redirect_no_location", body: null };
        let next;
        try { next = new URL(loc, safe.url).href; }
        catch { return { ok: false, status: res.status, reason: "invalid_redirect", body: null }; }
        if (!assertSafeUrl(next).ok) return { ok: false, status: res.status, reason: "unsafe_redirect", body: null };
        if ((opts.redirectCount || 0) >= cfg.maxRedirects) return { ok: false, status: res.status, reason: "too_many_redirects", body: null };
        if (opts.validateRedirect) {
          const decision = await bounded(opts.validateRedirect(next), controller.signal);
          if (!decision.ok) return { ok: false, status: res.status, reason: decision.reason || "redirect_not_allowed", body: null };
        }
        return httpFetch(next, { ...opts, retries: 0, redirectCount: (opts.redirectCount || 0) + 1 });
      }
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt === cfg.retries) return { ok: false, status: res.status, reason: res.status === 429 ? "rate_limited" : "server_error", body: null };
        retryDelay = cfg.backoffMs * 2 ** attempt + Math.floor(Math.random() * cfg.backoffMs);
      } else {
        const contentType = (res.headers.get?.("content-type") || "").toLowerCase();
        if (contentType && !/(text\/|application\/(json|ld\+json|xml|xhtml))/i.test(contentType)) {
          return { ok: false, status: res.status, reason: "unsupported_content_type", body: null, contentType };
        }
        const body = await readBody(res, cfg, controller.signal, !!opts.fetchImpl);
        const ok = res.status >= 200 && res.status < 300;
        return { ok, status: res.status, reason: ok ? null : "http_error", body, contentType, finalUrl: safe.url.href };
      }
    } catch (err) {
      lastErr = err;
      if (["unsafe_dns_destination", "too_large"].includes(err.code)) return { ok: false, status: res?.status || 0, reason: err.code, body: null };
      if (attempt < cfg.retries) retryDelay = cfg.backoffMs * 2 ** attempt;
    } finally {
      clearTimeout(timer);
      if (res?.body && !res.body.locked) void res.body.cancel().catch(() => {});
      if (dispatcher) await dispatcher.destroy();
    }
    if (retryDelay !== undefined) await sleep(retryDelay);
  }
  return { ok: false, status: 0, reason: lastErr?.name === "AbortError" ? "timeout" : "network_error", body: null };
}
