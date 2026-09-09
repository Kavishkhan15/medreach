// LilavatiAdapter — Lilavati Hospital & Research Centre (Bandra, Mumbai).
// CodeIgniter site; robots allows content pages. We fetch a small set of allowed
// pages (home, about, facilities, specialities, contact), then use the shared
// structured->semantic->fallback parse pipeline. Source-specific knowledge lives
// here (which pages to visit); generic parsing is inherited from SiteAdapter.

import { SiteAdapter } from "./siteAdapter.js";

export class LilavatiAdapter extends SiteAdapter {
  discoverPages() {
    // Only registry-allowed, robots-allowed paths. Kept minimal + polite.
    return ["/", "/about-us", "/facilities", "/specialities", "/contact-us"];
  }
}

export default LilavatiAdapter;
