// Adapter registry — maps a source's `adapter` key to its adapter class, and
// exposes the SSRF/enabled gate.
//
// Two families coexist:
//   - hospital-site adapters (registry/sources.js): lilavati/kokilaben/fortis/jaslok
//   - legacy config-driven adapters (generic/enveloped_json) used by the original
//     runner.js pipeline + its tests.

import {
  LilavatiAdapter,
  KokilabenAdapter,
  FortisAdapter,
  JaslokAdapter,
  CooperAdapter,
  BombayAdapter,
  KemAdapter,
  SionAdapter,
  TataMemorialAdapter,
  NanavatiAdapter,
  MumbaiSuburbanDirectoryAdapter,
  MumbaiCityDirectoryAdapter,
  DiagnosticDirectoryAdapter,
  GenericHospitalAdapter,
  EnvelopedJsonAdapter,
} from "./adapters/index.js";
import { assertSafeUrl } from "./ssrf.js";

export const ADAPTERS = {
  lilavati: LilavatiAdapter,
  kokilaben: KokilabenAdapter,
  fortis: FortisAdapter,
  jaslok: JaslokAdapter,
  cooper: CooperAdapter,
  bombay: BombayAdapter,
  kem: KemAdapter,
  kem_mumbai: KemAdapter,
  sion: SionAdapter,
  sion_hospital: SionAdapter,
  tata_memorial: TataMemorialAdapter,
  nanavati: NanavatiAdapter,
  nanavati_max: NanavatiAdapter,
  mumbai_suburban_directory: MumbaiSuburbanDirectoryAdapter,
  mumbai_city_directory: MumbaiCityDirectoryAdapter,
  diagnostic_directory: DiagnosticDirectoryAdapter,
  suburban_diagnostics: DiagnosticDirectoryAdapter,
  metropolis: DiagnosticDirectoryAdapter,
  metropolis_labs: DiagnosticDirectoryAdapter,
  nm_medical: DiagnosticDirectoryAdapter,
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
