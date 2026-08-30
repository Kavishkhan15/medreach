// Approved-source registry. The crawler will ONLY act on sources present and
// enabled here (or in the DB DataSource collection) — never arbitrary URLs. Maps
// an adapter key to an adapter class, and provides the SSRF gate for a source.

import { GenericHospitalAdapter } from "./adapters/genericHospitalAdapter.js";
import { EnvelopedJsonAdapter } from "./adapters/source-specific/envelopedJsonAdapter.js";
import { assertSafeUrl } from "./ssrf.js";

export const ADAPTERS = {
  generic: GenericHospitalAdapter,
  enveloped_json: EnvelopedJsonAdapter,
};

export function adapterFor(source, deps = {}) {
  const Klass = ADAPTERS[source.adapter || "generic"] || GenericHospitalAdapter;
  return new Klass(source, deps);
}

// A source is crawlable only if enabled AND its URL passes the SSRF guard.
export function isCrawlable(source) {
  if (!source || source.enabled === false) return { ok: false, reason: "disabled" };
  const safe = assertSafeUrl(source.url);
  if (!safe.ok) return { ok: false, reason: safe.reason };
  return { ok: true };
}
