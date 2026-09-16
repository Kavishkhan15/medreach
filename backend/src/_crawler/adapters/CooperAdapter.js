// CooperAdapter — Dr. R. N. Cooper Municipal General Hospital / HBT Medical
// College (Juhu, Mumbai). Plain HTML site, no JSON-LD observed on the real
// /emergency page (inspected live before writing this adapter). The emergency
// page states capacity text like "ICU: 42 beds (MICU, SICU, AICU, PICU, NICU
// and Cardiac ICU)" and "Casualty: 15 beds" — these are CAPABILITY/CAPACITY
// statements, never live availability; normalizeRecord() enforces that
// distinction generically, so this adapter does no special-casing for it.

import { SiteAdapter } from "./siteAdapter.js";

export class CooperAdapter extends SiteAdapter {
  discoverPages() {
    // Only registry-allowed, robots-allowed paths. /emergency carries the
    // most useful capability data; /contact-us and / round out identity.
    return ["/", "/emergency", "/contact-us"];
  }
}

export default CooperAdapter;
