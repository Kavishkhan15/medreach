// Central adapter index and registry for MedReach crawler.
// Registers all hospital site adapters, government directory adapters,
// and multi-center diagnostic directory adapters.

import { BaseAdapter } from "./baseAdapter.js";
import { SiteAdapter } from "./siteAdapter.js";
import { DirectoryAdapter } from "./directoryAdapter.js";
import { GenericHospitalAdapter } from "./genericHospitalAdapter.js";
import { EnvelopedJsonAdapter } from "./source-specific/envelopedJsonAdapter.js";

// Existing Hospital Site Adapters
import { LilavatiAdapter } from "./LilavatiAdapter.js";
import { KokilabenAdapter } from "./KokilabenAdapter.js";
import { FortisAdapter } from "./FortisAdapter.js";
import { JaslokAdapter } from "./JaslokAdapter.js";
import { CooperAdapter } from "./CooperAdapter.js";
import { BombayAdapter } from "./BombayAdapter.js";

// New Hospital Site Adapters
import { KemAdapter } from "./KemAdapter.js";
import { SionAdapter } from "./SionAdapter.js";
import { TataMemorialAdapter } from "./TataMemorialAdapter.js";
import { NanavatiAdapter } from "./NanavatiAdapter.js";

// Directory Adapters
import { MumbaiSuburbanDirectoryAdapter } from "./MumbaiSuburbanDirectoryAdapter.js";
import { MumbaiCityDirectoryAdapter } from "./MumbaiCityDirectoryAdapter.js";
import { DiagnosticDirectoryAdapter } from "./DiagnosticDirectoryAdapter.js";

export {
  BaseAdapter,
  SiteAdapter,
  DirectoryAdapter,
  GenericHospitalAdapter,
  EnvelopedJsonAdapter,
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
};

export const ADAPTERS = {
  // Existing hospital site adapters
  lilavati: LilavatiAdapter,
  kokilaben: KokilabenAdapter,
  fortis: FortisAdapter,
  jaslok: JaslokAdapter,
  cooper: CooperAdapter,
  bombay: BombayAdapter,

  // New Mumbai major medical colleges & hospitals
  kem: KemAdapter,
  kem_mumbai: KemAdapter,
  sion: SionAdapter,
  sion_hospital: SionAdapter,
  tata_memorial: TataMemorialAdapter,
  nanavati: NanavatiAdapter,
  nanavati_max: NanavatiAdapter,

  // Directory adapters
  mumbai_suburban_directory: MumbaiSuburbanDirectoryAdapter,
  mumbai_city_directory: MumbaiCityDirectoryAdapter,
  diagnostic_directory: DiagnosticDirectoryAdapter,
  suburban_diagnostics: DiagnosticDirectoryAdapter,
  metropolis: DiagnosticDirectoryAdapter,
  metropolis_labs: DiagnosticDirectoryAdapter,
  nm_medical: DiagnosticDirectoryAdapter,

  // Generic & legacy
  generic: GenericHospitalAdapter,
  enveloped_json: EnvelopedJsonAdapter,
};

export default ADAPTERS;
