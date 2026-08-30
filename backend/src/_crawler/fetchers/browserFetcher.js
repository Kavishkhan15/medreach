// Browser fetcher — for sources that require JS rendering. Kept behind the SAME
// contract as httpFetcher so adapters don't care which is used. A headless
// browser (Playwright/Puppeteer) can be wired in here later; until then it is
// explicitly unavailable rather than silently fabricating a result.

import { assertSafeUrl } from "../ssrf.js";

export async function browserFetch(rawUrl) {
  const safe = assertSafeUrl(rawUrl);
  if (!safe.ok) return { ok: false, status: 0, reason: safe.reason, body: null };
  // No headless browser is bundled (avoids a heavy dependency). Sources needing
  // JS rendering should be marked accordingly and handled when a browser is added.
  return { ok: false, status: 0, reason: "browser_fetch_not_configured", body: null };
}
