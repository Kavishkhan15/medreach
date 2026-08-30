// Source-specific adapters live here. They subclass BaseAdapter only when a
// source's shape can't be handled by GenericHospitalAdapter's config-driven
// parsing. Example skeleton below (kept minimal + safe).

import { GenericHospitalAdapter } from "../genericHospitalAdapter.js";

// Example: a source that nests its payload under a "data" envelope. It reuses the
// generic pipeline but unwraps first. Registered by name in ../../registry.js.
export class EnvelopedJsonAdapter extends GenericHospitalAdapter {
  parse(raw) {
    try {
      const outer = JSON.parse(raw);
      const inner = JSON.stringify(outer.data ?? outer);
      return super.parse(inner);
    } catch {
      return super.parse(raw);
    }
  }
}
