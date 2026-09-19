// TataMemorialAdapter — Site adapter for Tata Memorial Centre (tmc.gov.in),
// Parel, Mumbai.
//
// India's national comprehensive cancer centre, under Department of Atomic Energy,
// Government of India.
//
// MedReach policy: extract CAPABILITY ONLY (e.g. oncology, radiation therapy,
// surgical oncology, ICU, emergency, blood bank), NEVER live availability quantities.
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

export class TataMemorialAdapter extends SiteAdapter {
  discoverPages() {
    return [
      "/",
      "/services",
      "/facilities",
      "/emergency",
      "/contact-us",
      "/patient-care",
    ];
  }

  parseHospital(html, jsonldNode = null) {
    const node = jsonldNode || findHospitalNode(extractJsonLd(html)) || {};
    const base = baseParseHospital(html, node);

    const titleTag = firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
    const h1Tag = firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i);
    const nameCandidate = base.name || h1Tag || titleTag || "Tata Memorial Centre";
    const decodedName = decodeHtmlEntities(nameCandidate).replace(/\s+/g, " ").trim();

    const rawPhone = base.phone || firstMatch(html, /(?:tel:|phone[:\s]*)([+0-9()\s-]{8,})/i);
    const phone = normalizePhone(rawPhone);

    return {
      name: decodedName || "Tata Memorial Centre (Tata Memorial Hospital)",
      description: base.description
        ? decodeHtmlEntities(base.description).trim()
        : "Tata Memorial Centre, Dr. Ernest Borges Marg, Parel, Mumbai - national cancer care and research centre.",
      website: base.website || "https://tmc.gov.in",
      address: base.address
        ? decodeHtmlEntities(base.address).trim()
        : "Dr. E Borges Marg, Parel, Mumbai, Maharashtra 400012",
      locality: base.locality || "Parel",
      city: base.city || "Mumbai",
      pincode: base.pincode || "400012",
      latitude: base.latitude ?? 19.0044,
      longitude: base.longitude ?? 72.8432,
      phone: phone || "02224177000",
      hospitalType: "Government",
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

export default TataMemorialAdapter;
