// SSRF guard — the security spine of the crawler. Every outbound URL passes
// through here. We only ever crawl URLs that resolve from an approved DataSource;
// this module additionally enforces protocol + host safety so a compromised or
// misconfigured source entry cannot reach internal infrastructure.

// Reject non-http(s) protocols outright (no file:, ftp:, gopher:, data:, etc.).
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Private / loopback / link-local / reserved ranges that must never be fetched.
function isPrivateIPv4(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (m.slice(1).some((o) => Number(o) > 255)) return true; // malformed → treat unsafe
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isUnsafeHost(host) {
  const h = host.toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "[::1]" || h === "::1") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (isPrivateIPv4(h)) return true;
  // Bracketed IPv6 loopback/unique-local/link-local.
  if (h.startsWith("[")) {
    const inner = h.replace(/^\[|\]$/g, "");
    if (inner === "::1" || inner.startsWith("fc") || inner.startsWith("fd") || inner.startsWith("fe80")) return true;
  }
  return false;
}

// Returns { ok:true, url } or { ok:false, reason }. Never throws.
export function assertSafeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { ok: false, reason: "protocol_not_allowed" };
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };
  if (isUnsafeHost(url.hostname)) return { ok: false, reason: "private_or_local_host" };
  return { ok: true, url };
}

export function isSafeUrl(raw) {
  return assertSafeUrl(raw).ok;
}
