// DiagnosticDirectoryAdapter — Directory adapter for parsing multi-center lab
// locator listings across major Mumbai diagnostic networks (Suburban Diagnostics,
// Metropolis Healthcare, NM Medical, etc.).
//
// Inherits from DirectoryAdapter (one page -> many diagnostic center listings).
//
// MedReach crawler policy:
//   - Extract CAPABILITY ONLY (e.g. Pathology, Blood Test, CT Scan, MRI,
//     Ultrasound, Digital X-Ray, ECG, Mammography).
//   - NEVER live availability quantities or capacity numbers.
//   - Availability remains 'unknown'.
//   - Decode HTML entities, normalize phone numbers.

import { DirectoryAdapter } from "./directoryAdapter.js";
import {
  extractJsonLd,
  findHospitalNode,
  parseHospital as baseParseHospital,
  parseFacilities as baseParseFacilities,
  decodeHtmlEntities,
  stripTags,
  firstMatch,
} from "../parsers/structured.js";
import { normalizePhone } from "../normalization/normalizeRecord.js";

// Diagnostic capabilities vocabulary
const DIAGNOSTIC_FACILITY_PATTERNS = {
  "Pathology": [/pathology/i, /blood test/i, /clinical pathology/i, /biochemistry/i, /hematology/i, /haematology/i],
  "CT": [/\bct scan\b/i, /\bcomputed tomography\b/i, /\bhrct\b/i],
  "MRI": [/\bmri\b/i, /magnetic resonance/i, /3t mri/i],
  "Ultrasound": [/ultrasound/i, /sonography/i, /\busg\b/i, /color doppler/i, /colour doppler/i],
  "Digital X-Ray": [/digital x-?ray/i, /\bx-?ray\b/i, /radiography/i],
  "ECG": [/\becg\b/i, /electrocardiogram/i, /tmt/i, /treadmill test/i, /stress test/i],
  "2D Echo": [/2d echo/i, /echocardiography/i],
  "Mammography": [/mammograph(?:y|ic)/i, /breast imaging/i],
  "Dialysis": [/dialysis/i, /hemodialysis/i],
  "Blood Bank": [/blood bank/i, /blood collection/i, /phlebotomy/i],
  "Health Checkup": [/health check-?up/i, /preventive check/i, /wellness package/i],
};

function cleanText(s) {
  return typeof s === "string" ? decodeHtmlEntities(s).replace(/\s+/g, " ").trim() : "";
}

function pincodeFromAddress(text) {
  if (!text) return null;
  const m = String(text).match(/\b(400\d{3})\b/) || String(text).match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

function isValidHttpUrl(v) {
  if (typeof v !== "string" || !v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export class DiagnosticDirectoryAdapter extends DirectoryAdapter {
  discoverPages() {
    return [
      "/centres",
      "/locations",
      "/lab-locator",
      "/find-a-centre",
      "/our-network",
      "/diagnostic-centres",
    ];
  }

  // Parses a single center/lab representation into a normalized hospital/center record
  parseHospital(html, jsonldNode = null) {
    const node = jsonldNode || findHospitalNode(extractJsonLd(html)) || {};
    const base = baseParseHospital(html, node);

    const titleTag = firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
    const h1Tag = firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i);
    const nameCandidate = base.name || h1Tag || titleTag || "Diagnostic Centre";
    const name = decodeHtmlEntities(nameCandidate).replace(/\s+/g, " ").trim();

    const rawPhone = base.phone || firstMatch(html, /href=["']tel:([+0-9()\s-]{6,})["']/i) || firstMatch(html, /(?:tel:|phone[:\s]*)([+0-9()\s-]{8,})/i);
    const phone = normalizePhone(rawPhone);

    let address = base.address ? decodeHtmlEntities(base.address).trim() : null;
    if (!address) {
      const addrMatch = firstMatch(html, /<address[^>]*>([\s\S]*?)<\/address>/i);
      if (addrMatch) address = decodeHtmlEntities(stripTags(addrMatch)).trim();
    }
    const pincode = base.pincode || pincodeFromAddress(address) || pincodeFromAddress(html);

    return {
      name: name || "Diagnostic Laboratory & Imaging Centre",
      description: base.description ? decodeHtmlEntities(base.description).trim() : null,
      website: base.website || null,
      address,
      locality: base.locality || null,
      city: base.city || "Mumbai",
      pincode,
      latitude: base.latitude ?? null,
      longitude: base.longitude ?? null,
      phone,
      hospitalType: "Diagnostic Center",
    };
  }

  // Parses diagnostic capabilities from HTML or text.
  // MedReach policy: extract CAPABILITY ONLY, never live availability quantities.
  parseFacilities(html) {
    if (typeof html !== "string" || !html) return [];
    const plainText = stripTags(html);
    const found = [];

    // Check standard facilities first (e.g. CT, MRI, Dialysis, Blood Bank)
    const baseFacs = baseParseFacilities(html);
    const seen = new Set();
    for (const bf of baseFacs) {
      if (!seen.has(bf.facility)) {
        seen.add(bf.facility);
        found.push({
          facility: bf.facility,
          capability: "yes",
          evidenceText: bf.evidenceText || null,
        });
      }
    }

    // Check diagnostic-specific capabilities
    for (const [facilityName, patterns] of Object.entries(DIAGNOSTIC_FACILITY_PATTERNS)) {
      if (seen.has(facilityName)) continue;
      const matched = patterns.some((re) => re.test(plainText));
      if (matched) {
        seen.add(facilityName);
        found.push({
          facility: facilityName,
          capability: "yes",
          evidenceText: null,
        });
      }
    }

    return found;
  }

  // Extracts multi-center listings from HTML or embedded structured JSON-LD
  parseListings(html) {
    if (typeof html !== "string" || !html) return [];

    const listings = [];
    const seenKeys = new Set();

    // 1. JSON-LD structured data extraction (MedicalBusiness / DiagnosticLab / ItemList)
    const jsonldItems = extractJsonLd(html);
    for (const node of jsonldItems) {
      if (!node) continue;
      const nodesToProcess = Array.isArray(node.itemListElement)
        ? node.itemListElement.map((item) => item.item || item)
        : [node];

      for (const n of nodesToProcess) {
        if (!n || typeof n !== "object") continue;
        const type = String(n["@type"] || "");
        if (/DiagnosticLab|MedicalBusiness|MedicalClinic|LocalBusiness|Hospital/i.test(type) && n.name) {
          const rawName = decodeHtmlEntities(String(n.name).trim());
          const addr = n.address || {};
          const streetAddr = typeof addr === "string" ? addr : addr.streetAddress || null;
          const address = streetAddr ? decodeHtmlEntities(streetAddr).trim() : null;
          const pincode = addr.postalCode || pincodeFromAddress(address);
          const phone = normalizePhone(n.telephone);

          const key = `${rawName}|${pincode || address}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            listings.push({
              name: rawName,
              address: address || null,
              locality: addr.addressLocality || null,
              city: addr.addressRegion || "Mumbai",
              pincode: pincode || null,
              phone: phone || null,
              email: n.email || null,
              latitude: n.geo?.latitude ? Number(n.geo.latitude) : null,
              longitude: n.geo?.longitude ? Number(n.geo.longitude) : null,
              mapUrl: n.hasMap || null,
              officialWebsite: isValidHttpUrl(n.url) ? n.url : null,
              facilities: this.parseFacilities(JSON.stringify(n)),
            });
          }
        }
      }
    }

    if (listings.length > 0) return listings;

    // 2. Heading-based chunking (robust against nested <div> tags)
    const headingMatches = [...html.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)];
    for (let i = 0; i < headingMatches.length; i++) {
      const hm = headingMatches[i];
      const rawName = cleanText(stripTags(hm[1]));
      if (!rawName || rawName.length < 3) continue;

      const chunkStart = hm.index + hm[0].length;
      const chunkEnd = i + 1 < headingMatches.length ? headingMatches[i + 1].index : html.length;
      const chunk = html.slice(chunkStart, Math.min(chunkEnd, chunkStart + 3000));
      const plainChunk = stripTags(chunk);

      // Phone: tel link, strong phone, or regex
      const telMatch = firstMatch(chunk, /href=["']tel:([+0-9()\s-]{6,})["']/i);
      const phoneLabelMatch = firstMatch(chunk, /(?:phone|tel|call|contact)[:\s]*<strong>([^<]*)<\/strong>/i)
        || firstMatch(chunk, /(?:phone|tel|call|contact)[:\s]*([+0-9()\s-]{8,})/i)
        || firstMatch(plainChunk, /(?:phone|tel|call|contact)[:\s]*([+0-9()\s-]{8,})/i);
      const phone = normalizePhone(telMatch || phoneLabelMatch);

      // Map URL / coordinates
      const mapMatch = firstMatch(chunk, /href=["']([^"']*(?:maps\.google|goo\.gl|maps\/dir)[^"']*)["']/i);
      const dirMatch = chunk.match(/maps\/dir\/\/(-?\d+\.\d+),(-?\d+\.\d+)/i)
        || chunk.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/i);
      const latitude = dirMatch ? Number(dirMatch[1]) : null;
      const longitude = dirMatch ? Number(dirMatch[2]) : null;

      // Website
      const siteMatch = firstMatch(chunk, /<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>(?:visit|website|view|link)/i);
      const officialWebsite = siteMatch && isValidHttpUrl(siteMatch) ? siteMatch : null;

      // Pincode & Address
      const pincode = pincodeFromAddress(plainChunk);
      let address = null;
      const addrTagMatch = chunk.match(/<(?:p|span|address|div)[^>]*class=["'][^"']*(?:address|addr|location)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|address|div)>/i)
        || chunk.match(/<address[^>]*>([\s\S]*?)<\/address>/i);
      if (addrTagMatch) {
        address = cleanText(stripTags(addrTagMatch[1]));
      } else {
        const addrCandidate = firstMatch(plainChunk, /(?:address[:\s]*|location[:\s]*)([^,\n]+(?:,[^,\n]+){1,4})/i);
        if (addrCandidate) address = cleanText(addrCandidate);
        else address = plainChunk.slice(0, 150).trim();
      }

      const email = firstMatch(chunk, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);

      const key = `${rawName}|${pincode || address}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        listings.push({
          name: rawName,
          address: address || null,
          locality: null,
          city: "Mumbai",
          pincode: pincode || null,
          phone: phone || null,
          email: email || null,
          latitude,
          longitude,
          mapUrl: mapMatch || null,
          officialWebsite,
          facilities: this.parseFacilities(chunk),
        });
      }
    }

    return listings;
  }

  // Looser fallback: detects diagnostic centers by heading keywords if standard classes shift
  parseListingsLoose(html) {
    if (typeof html !== "string" || !html) return [];
    const looseHeadingRe = /<h[2-4][^>]*>([^<]{3,100})<\/h[2-4]>/gi;
    const listings = [];
    const seen = new Set();

    let m;
    while ((m = looseHeadingRe.exec(html))) {
      const name = cleanText(m[1]);
      if (!name) continue;
      if (
        /diagnostics|pathology|laboratory|lab\b|imaging|scan centre|metropolis|suburban|nm medical/i.test(name)
        && !seen.has(name)
      ) {
        seen.add(name);
        const chunk = html.slice(m.index, m.index + 800);
        const pincode = pincodeFromAddress(chunk);
        const phoneMatch = chunk.match(/(?:tel:|phone[:\s]*)([+0-9()\s-]{8,})/i);
        const phone = phoneMatch ? normalizePhone(phoneMatch[1]) : null;

        listings.push({
          name,
          address: null,
          locality: null,
          city: "Mumbai",
          pincode: pincode || null,
          phone,
          email: null,
          latitude: null,
          longitude: null,
          mapUrl: null,
          officialWebsite: null,
          facilities: this.parseFacilities(chunk),
        });
      }
    }

    return listings;
  }
}

export default DiagnosticDirectoryAdapter;
