// SionAdapter — Site adapter for Lokmanya Tilak Municipal Medical College &
// General Hospital (ltmmc.edu.in), Sion, Mumbai.
//
// Premier public municipal hospital and major trauma center on Eastern Express Highway.
// MedReach policy: extract CAPABILITY ONLY (e.g. 24x7 trauma care, casualty,
// burns unit, ICU, NICU, blood bank), NEVER live availability quantities or bed numbers.
// Availability is strictly 'unknown' for crawled public sites.

import { SiteAdapter } from "./siteAdapter.js";
import {
  extractJsonLd,
  findHospitalNode,
  parseHospital as baseParseHospital,
  parseFacilities as baseParseFacilities,
  parseSpecialties,
  parseEmergency,
  parseContacts,
  decodeHtmlEntities,
  stripTags,
  firstMatch,
} from "../parsers/structured.js";
import { normalizePhone } from "../normalization/normalizeRecord.js";

export class SionAdapter extends SiteAdapter {
  discoverPages() {
    return [
      "/",
      "/emergency",
      "/trauma-centre",
      "/departments",
      "/facilities",
      "/contact-us",
    ];
  }

  parseHospital(html, jsonldNode = null) {
    const node = jsonldNode || findHospitalNode(extractJsonLd(html)) || {};
    const base = baseParseHospital(html, node);

    const titleTag = firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
    const h1Tag = firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i);
    const nameCandidate = base.name || h1Tag || titleTag || "Lokmanya Tilak Municipal General Hospital";
    const decodedName = decodeHtmlEntities(nameCandidate).replace(/\s+/g, " ").trim();

    const rawPhone = base.phone || firstMatch(html, /(?:tel:|phone[:\s]*)([+0-9()\s-]{8,})/i);
    const phone = normalizePhone(rawPhone);

    return {
      name: decodedName || "Lokmanya Tilak Municipal Medical College & General Hospital (Sion Hospital)",
      description: base.description
        ? decodeHtmlEntities(base.description).trim()
        : "Lokmanya Tilak Municipal Medical College and General Hospital (LTMGH / Sion Hospital), Sion, Mumbai.",
      website: base.website || "https://ltmmc.edu.in",
      address: base.address
        ? decodeHtmlEntities(base.address).trim()
        : "Sion West, Mumbai, Maharashtra 400022",
      locality: base.locality || "Sion",
      city: base.city || "Mumbai",
      pincode: base.pincode || "400022",
      latitude: base.latitude ?? 19.0373,
      longitude: base.longitude ?? 72.8596,
      phone: phone || "02224076381",
      hospitalType: "Municipal",
    };
  }

  parseFacilities(html) {
    // Extract CAPABILITY ONLY. Never live availability quantities.
    const facilities = baseParseFacilities(html);
    return facilities.map((f) => ({
      facility: f.facility,
      capability: "yes",
      evidenceText: f.evidenceText || null,
    }));
  }

  parsePage(html) {
    const jsonld = extractJsonLd(html);
    const node = findHospitalNode(jsonld);
    return {
      hospital: this.parseHospital(html, node),
      facilities: this.parseFacilities(html),
      specialties: parseSpecialties(html),
      emergency: parseEmergency(html),
      contacts: parseContacts(html),
    };
  }
}

export default SionAdapter;
