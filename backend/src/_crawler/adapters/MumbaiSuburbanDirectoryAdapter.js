// MumbaiSuburbanDirectoryAdapter — Mumbai Suburban District government
// hospital directory (mumbaisuburban.gov.in). One page, many hospital
// listings; identity fields only (name/address/phone/pincode/coordinates),
// no facility/specialty data — directories don't publish that, so this
// adapter never invents any.

import { DirectoryAdapter } from "./directoryAdapter.js";
import { parseDirectoryListings, parseDirectoryListingsLoose } from "../parsers/directory.js";

export class MumbaiSuburbanDirectoryAdapter extends DirectoryAdapter {
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

export default MumbaiSuburbanDirectoryAdapter;
