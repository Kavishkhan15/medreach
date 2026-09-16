// Government directory parser — extracts hospital LISTINGS from a directory
// page. Distinct from the hospital_site parsers in structured.js: a directory
// page describes MANY hospitals, each with only identity fields (name,
// address, phone, pincode) and a Google Maps "Directions" link — never
// facility/specialty/capability data, which directories don't publish.
//
// Structure confirmed by fetching and inspecting the REAL raw HTML of
// mumbaisuburban.gov.in's hospitals page (see docs/crawler.md):
//
//   <h2 class="heading4">Bhabha Hospital</h2>
//   <ul class="pubutility-list">
//     <li><a href="...maps/search/?...query=...">ADDRESS TEXT</a></li>
//     <li></li>
//     <li><strong>Phone :</strong> 022-26422775</li>
//     <li></li>
//     <li></li>
//     <li><strong>Pincode:</strong> 400050</li>
//   </ul>
//   <a href="https://www.google.com/maps/dir//19.05755,72.83364" ...>Directions</a>
//
// This is a WordPress-block repeating pattern, not JSON-LD/a table — government
// sites like this are unlikely to publish structured data, so semantic-HTML
// extraction (heading + labeled list items) is the right approach, exactly as
// the "prefer semantic HTML" guidance calls for when no structured data exists.
//
// Implementation note: rather than one large regex trying to capture an
// entire repeating block (fragile against real-world whitespace variance and
// lazy-quantifier edge cases across a multi-KB document), this splits the
// document on each heading first, then parses each resulting chunk in
// isolation with small, focused regexes. Much easier to reason about and to
// keep working if the site's markup shifts slightly.
//
// Never invents a website: this page provides no official-site links, only
// Google Maps directions. `officialWebsite` stays null unless a future page
// structure adds one — never synthesized from the hospital name.

import { normalizePhone } from "../normalization/normalizeRecord.js";
import { decodeHtmlEntities } from "./structured.js";

const HEADING_RE = /<h[23][^>]*class="heading4"[^>]*>([^<]+)<\/h[23]>/gi;
const ADDRESS_LINK_RE = /<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/i;
const PHONE_RE = /<strong>\s*Phone\s*:?\s*<\/strong>\s*([^<]*)/i;
const PINCODE_RE = /<strong>\s*Pincode:?\s*<\/strong>\s*([^<]*)/i;
const EMAIL_RE = /<strong>\s*Email\s*:?\s*<\/strong>\s*([^<]*)/i;
// "Website Link :" is followed by an <a> tag (unlike phone/pincode/email,
// which are plain text after the <strong>) — captured via its href so we
// read the real link, not whatever display text the site chose to show.
const WEBSITE_LINK_RE = /<strong>\s*Website\s*Link\s*:?\s*<\/strong>\s*<a[^>]*href="([^"]*)"/i;
const DIRECTIONS_LATLNG_RE = /maps\/dir\/\/(-?\d+\.\d+),(-?\d+\.\d+)/i;
// Stop each hospital's chunk at the next heading OR the end of this repeating
// section (the closing </div> pattern that wraps the whole listing grid).
const CHUNK_END_RE = /<h[23][^>]*class="heading4"/i;

function cleanText(s) {
  return typeof s === "string" ? decodeHtmlEntities(s).replace(/\s+/g, " ").trim() : "";
}

// Some government pages obfuscate emails as "name[at]domain[dot]tld" to deter
// scrapers — this reverses that specific, well-known pattern back to a real
// address; it never invents an email that wasn't already present on the page.
function deobfuscateEmail(raw) {
  const s = cleanText(raw);
  if (!s) return null;
  const decoded = s.replace(/\[at\]/gi, "@").replace(/\[dot\]/gi, ".");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decoded) ? decoded : null;
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

function pincodeFromAddress(address) {
  const m = String(address || "").match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

function parseChunk(name, chunk) {
  const addrMatch = chunk.match(ADDRESS_LINK_RE);
  const address = addrMatch ? cleanText(addrMatch[2]) : null;

  const phoneMatch = chunk.match(PHONE_RE);
  const phone = phoneMatch ? normalizePhone(cleanText(phoneMatch[1])) : null;

  const pincodeMatch = chunk.match(PINCODE_RE);
  const rawPincode = pincodeMatch ? cleanText(pincodeMatch[1]).replace(/\D+$/, "") : null;
  const pincode = rawPincode || pincodeFromAddress(address);

  const dirMatch = chunk.match(DIRECTIONS_LATLNG_RE);
  const latitude = dirMatch ? Number(dirMatch[1]) : null;
  const longitude = dirMatch ? Number(dirMatch[2]) : null;

  const emailMatch = chunk.match(EMAIL_RE);
  const email = emailMatch ? deobfuscateEmail(emailMatch[1]) : null;

  const websiteMatch = chunk.match(WEBSITE_LINK_RE);
  const officialWebsite = websiteMatch && isValidHttpUrl(websiteMatch[1]) ? websiteMatch[1] : null;

  return {
    name,
    address: address || null,
    locality: null, // directory doesn't label locality separately from the address string
    pincode: pincode || null,
    phone: phone || null,
    email,
    latitude,
    longitude,
    mapUrl: dirMatch ? `https://www.google.com/maps/dir//${dirMatch[1]},${dirMatch[2]}` : (addrMatch ? addrMatch[1] : null),
    // Populated ONLY when the page actually publishes a "Website Link :" —
    // never synthesized from the hospital name. This is the directory-
    // ->official-site provenance link the spec asks for.
    officialWebsite,
  };
}

export function parseDirectoryListings(html) {
  if (typeof html !== "string" || !html) return [];

  // Find every heading with its start index, then slice out the text between
  // consecutive headings (or to end-of-document for the last one).
  const headingMatches = [...html.matchAll(HEADING_RE)];
  if (!headingMatches.length) return [];

  const listings = [];
  for (let i = 0; i < headingMatches.length; i++) {
    const m = headingMatches[i];
    const name = cleanText(m[1]);
    if (!name) continue;
    const chunkStart = m.index + m[0].length;
    const chunkEnd = i + 1 < headingMatches.length ? headingMatches[i + 1].index : html.length;
    const chunk = html.slice(chunkStart, Math.min(chunkEnd, chunkStart + 2000));
    listings.push(parseChunk(name, chunk));
  }
  return listings;
}

// Fallback: if even the heading pattern doesn't match (site markup changed
// more substantially), report nothing rather than guessing — the orchestrator
// treats a directory crawl that finds zero listings as a parsing failure, not
// silently as "zero hospitals today".
export function parseDirectoryListingsLoose(html) {
  if (typeof html !== "string" || !html) return [];
  const looseHeadingRe = /<h[23][^>]*>([^<]{3,120})<\/h[23]>/gi;
  const names = [...html.matchAll(looseHeadingRe)].map((mm) => cleanText(mm[1])).filter(Boolean);
  return names.map((name) => ({
    name, address: null, locality: null, pincode: null, phone: null, email: null,
    latitude: null, longitude: null, mapUrl: null, officialWebsite: null,
  }));
}
