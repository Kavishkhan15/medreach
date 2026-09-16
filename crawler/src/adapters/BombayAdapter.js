// BombayAdapter — Bombay Hospital & Medical Research Centre (Marine Lines,
// Mumbai). Plain HTML, no JSON-LD observed on the real /emergency page
// (inspected live before writing this adapter). States "Casualty/Emergency
// Room on the ground floor of the B.H Bldg" with a board number — this is
// capability/contact information, never live availability.

import { SiteAdapter } from "./siteAdapter.js";

export class BombayAdapter extends SiteAdapter {
  discoverPages() {
    return ["/", "/emergency", "/contact"];
  }
}

export default BombayAdapter;
