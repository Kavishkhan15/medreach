// KokilabenAdapter — Kokilaben Dhirubhai Ambani Hospital (Andheri West, Mumbai).
// robots allows /departments/centresofexcellence, /patients, /aboutus, /contactus.
import { SiteAdapter } from "./siteAdapter.js";

export class KokilabenAdapter extends SiteAdapter {
  discoverPages() {
    return ["/", "/aboutus", "/departments/centresofexcellence", "/patients", "/contactus"];
  }
}

export default KokilabenAdapter;
