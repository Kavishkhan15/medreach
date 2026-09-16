// Adapter registry — maps a source's `adapter` key to its adapter class, and
// exposes the SSRF/enabled gate.
//
// Two families coexist:
//   - hospital-site adapters (registry/sources.js): lilavati/kokilaben/fortis/jaslok
//   - legacy config-driven adapters (generic/enveloped_json) used by the original
//     runner.js pipeline + its tests.

import { LilavatiAdapter } from "./adapters/LilavatiAdapter.js";
import { KokilabenAdapter } from "./adapters/KokilabenAdapter.js";
import { FortisAdapter } from "./adapters/FortisAdapter.js";
import { JaslokAdapter } from "./adapters/JaslokAdapter.js";
import { CooperAdapter } from "./adapters/CooperAdapter.js";
import { BombayAdapter } from "./adapters/BombayAdapter.js";
import { MumbaiSuburbanDirectoryAdapter } from "./adapters/MumbaiSuburbanDirectoryAdapter.js";
import { MumbaiCityDirectoryAdapter } from "./adapters/MumbaiCityDirectoryAdapter.js";
import { GenericHospitalAdapter } from "./adapters/genericHospitalAdapter.js";
import { EnvelopedJsonAdapter } from "./adapters/source-specific/envelopedJsonAdapter.js";
import { assertSafeUrl } from "./ssrf.js";

export const ADAPTERS = {
  lilavati: LilavatiAdapter,
  kokilaben: KokilabenAdapter,
  fortis: FortisAdapter,
  jaslok: JaslokAdapter,
  cooper: CooperAdapter,
  bombay: BombayAdapter,
  mumbai_suburban_directory: MumbaiSuburbanDirectoryAdapter,
  mumbai_city_directory: MumbaiCityDirectoryAdapter,
  generic: GenericHospitalAdapter,
  enveloped_json: EnvelopedJsonAdapter,
};

export function adapterFor(source, deps = {}) {
  const Klass = ADAPTERS[source.adapter || "generic"] || GenericHospitalAdapter;
  return new Klass(source, deps);
}

// A source is crawlable only if enabled AND its URL passes the SSRF guard.
// Supports both hospital-site sources (baseUrl) and legacy sources (url).
export function isCrawlable(source) {
  if (!source) return { ok: false, reason: "disabled" };
  if (source.status === "blocked") return { ok: false, reason: "blocked" };
  if (source.enabled === false) return { ok: false, reason: "disabled" };
  if (source.sourceState && source.sourceState !== "enabled") return { ok: false, reason: source.sourceState };
  const target = source.baseUrl || source.url;
  const safe = assertSafeUrl(target);
  if (!safe.ok) return { ok: false, reason: safe.reason };
  return { ok: true };
}
