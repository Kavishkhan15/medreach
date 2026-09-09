// JaslokAdapter — Jaslok Hospital & Research Centre (Pedder Road, Mumbai).
// Observed: emergency no on most pages, specialties under /speciality/*,
// /hospital-facilities and /contact carry identity + facility info.
import { SiteAdapter } from "./siteAdapter.js";

export class JaslokAdapter extends SiteAdapter {
  discoverPages() {
    return ["/", "/about-jaslok", "/hospital-facilities", "/speciality", "/contact"];
  }
}

export default JaslokAdapter;
