// NanavatiAdapter — Site adapter for Nanavati Max Super Speciality Hospital
// (nanavatimaxhospital.org), Vile Parle West, Mumbai.
//
// 350-bed quaternary care hospital in Mumbai western suburbs.
//
// MedReach policy: extract CAPABILITY ONLY (e.g. ICU, CCU, emergency,
// cath lab, oncology, robotic surgery, dialysis), NEVER live availability quantities.
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

export class NanavatiAdapter extends SiteAdapter {
  discoverPages() {
    return [
      "/",
      "/specialities",
      "/facilities",
      "/emergency",
      "/contact-us",
      "/about-us",
    ];
  }

  parseHospital(html, jsonldNode = null) {
    const node = jsonldNode || findHospitalNode(extractJsonLd(html)) || {};
    const base = baseParseHospital(html, node);

    const titleTag = firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
    const h1Tag = firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i);
    const nameCandidate = base.name || h1Tag || titleTag || "Nanavati Max Super Speciality Hospital";
    const decodedName = decodeHtmlEntities(nameCandidate).replace(/\s+/g, " ").trim();

    const rawPhone = base.phone || firstMatch(html, /href=["']tel:([+0-9()\s-]{6,})["']/i) || firstMatch(html, /(?:tel:|phone[:\s]*)([+0-9()\s-]{8,})/i);
    const phone = normalizePhone(rawPhone);

    let address = base.address ? decodeHtmlEntities(base.address).trim() : null;
    if (!address) {
      const addrMatch = firstMatch(html, /<address[^>]*>([\s\S]*?)<\/address>/i);
      if (addrMatch) address = decodeHtmlEntities(stripTags(addrMatch)).trim();
    }

    const pincode = base.pincode || extractPincode(address) || extractPincode(html) || "400056";

    return {
      name: decodedName || "Nanavati Max Super Speciality Hospital",
      description: base.description
        ? decodeHtmlEntities(base.description).trim()
        : "Nanavati Max Super Speciality Hospital, SV Road, Vile Parle West, Mumbai.",
      website: base.website || "https://www.nanavatimaxhospital.org",
      address: address || "Swami Vivekanand Rd, LIC Colony, Suresh Colony, Vile Parle West, Mumbai, Maharashtra 400056",
      locality: base.locality || "Vile Parle West",
      city: base.city || "Mumbai",
      pincode,
      latitude: base.latitude ?? 19.0968,
      longitude: base.longitude ?? 72.8410,
      phone: phone || "02226267500",
      hospitalType: "Trust",
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

export default NanavatiAdapter;
