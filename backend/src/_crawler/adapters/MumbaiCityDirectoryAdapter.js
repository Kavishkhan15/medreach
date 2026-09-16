// MumbaiCityDirectoryAdapter — Mumbai City District government hospital
// directory (mumbaicity.gov.in). Same repeating markup pattern as the
// Mumbai Suburban directory (confirmed live before writing this adapter),
// but this page ALSO publishes "Email :" and "Website Link :" for several
// hospitals (K E M Hospital, G. T. Hospital, Saifee Hospital, St George
// Hospital) — real directory->official-site provenance links, captured by
// parseDirectoryListings()'s officialWebsite field, never invented for the
// hospitals that don't have one (J J Hospital, Municipal Hospital).

import { DirectoryAdapter } from "./directoryAdapter.js";
import { parseDirectoryListings, parseDirectoryListingsLoose } from "../parsers/directory.js";

export class MumbaiCityDirectoryAdapter extends DirectoryAdapter {
  discoverPages() {
    return ["/en/public-utility-category/hospitals/"];
  }

  parseListings(html) {
    return parseDirectoryListings(html);
  }

  parseListingsLoose(html) {
    return parseDirectoryListingsLoose(html);
  }
}

export default MumbaiCityDirectoryAdapter;
