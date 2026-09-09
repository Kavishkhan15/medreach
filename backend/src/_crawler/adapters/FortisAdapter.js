// FortisAdapter — Fortis Hospital, Mumbai (Drupal site).
// robots disallows /core /profiles /admin /search /user; content pages allowed.
import { SiteAdapter } from "./siteAdapter.js";

export class FortisAdapter extends SiteAdapter {
  discoverPages() {
    return ["/", "/hospitals/mumbai", "/specialities", "/facilities", "/contact-us"];
  }
}

export default FortisAdapter;
