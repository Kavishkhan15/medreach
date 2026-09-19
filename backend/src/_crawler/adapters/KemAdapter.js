// KemAdapter — Site adapter for King Edward Memorial Hospital & Seth G.S.
// Medical College (kem.edu), Parel, Mumbai.
//
// Premier municipal teaching hospital governed by the Municipal Corporation of
// Greater Mumbai (BMC/MCGM).
//
// MedReach policy: extract CAPABILITY ONLY (e.g. ICU, trauma care, casualty,
// dialysis, blood bank, specialties), NEVER live availability quantities or bed counts.
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

function extractPincode(text) {
  if (!text) return null;
  const m = String(text).match(/\b(400\d{3})\b/) || String(text).match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

export class KemAdapter extends SiteAdapter {
  discoverPages() {
    return [
      "/",
      "/patient-care",
      "/emergency-services",
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
    const nameCandidate = base.name || h1Tag || titleTag || "King Edward Memorial Hospital";
    const decodedName = decodeHtmlEntities(nameCandidate).replace(/\s+/g, " ").trim();

    const rawPhone = base.phone || firstMatch(html, /href=["']tel:([+0-9()\s-]{6,})["']/i) || firstMatch(html, /(?:tel:|phone[:\s]*)([+0-9()\s-]{8,})/i);
    const phone = normalizePhone(rawPhone);

    let address = base.address ? decodeHtmlEntities(base.address).trim() : null;
    if (!address) {
      const addrMatch = firstMatch(html, /<address[^>]*>([\s\S]*?)<\/address>/i);
      if (addrMatch) address = decodeHtmlEntities(stripTags(addrMatch)).trim();
    }

    const pincode = base.pincode || extractPincode(address) || extractPincode(html) || "400012";

    return {
      name: decodedName || "King Edward Memorial Hospital & Seth G.S. Medical College",
      description: base.description
        ? decodeHtmlEntities(base.description).trim()
        : "King Edward Memorial Hospital and Seth Gordhandas Sunderdas Medical College, Parel, Mumbai.",
      website: base.website || "https://www.kem.edu",
      address: address || "Acharya Donde Marg, Parel, Mumbai, Maharashtra 400012",
      locality: base.locality || "Parel",
      city: base.city || "Mumbai",
      pincode,
      latitude: base.latitude ?? 19.0024,
      longitude: base.longitude ?? 72.8427,
      phone: phone || "02224107000",
      hospitalType: "Municipal",
    };
  }

  parseFacilities(html) {
    // Extract CAPABILITY ONLY. Never live availability quantities.
    const facilities = baseParseFacilities(html);
    const result = facilities.map((f) => ({
      facility: f.facility,
      capability: "yes",
      evidenceText: f.evidenceText || null,
    }));
    const text = stripTags(html).toLowerCase();
    if (/\b(emergency|casualty|trauma)\b/i.test(text) && !result.some((f) => f.facility === "Emergency Department")) {
      result.push({
        facility: "Emergency Department",
        capability: "yes",
        evidenceText: null,
      });
    }
    return result;
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

export default KemAdapter;
