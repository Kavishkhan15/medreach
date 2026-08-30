// Generic adapter driven entirely by the DataSource's `config` (format + field
// maps). Handles the common JSON-API and simple-HTML cases without bespoke code,
// so most sources need no custom adapter. Source-specific adapters (in
// ./source-specific/) subclass BaseAdapter when a source is unusual.

import { BaseAdapter } from "./baseAdapter.js";
import { parseHospital, parseAvailability } from "../parsers/index.js";
import { normalizeHospital, normalizeAvailability } from "../normalization/index.js";

export class GenericHospitalAdapter extends BaseAdapter {
  parse(raw) {
    const cfg = this.source.config || {};
    return {
      hospital: parseHospital(raw, cfg.hospital || { format: cfg.format || "json", map: {} }),
      availability: parseAvailability(raw, cfg.availability || { format: cfg.format || "json" }),
    };
  }

  normalize(parsed) {
    return {
      hospital: normalizeHospital(parsed.hospital || {}),
      availability: normalizeAvailability(parsed.availability || {}),
    };
  }
}
