// Structured-first extraction helpers. Priority per spec §10:
//   JSON-LD / structured data -> semantic HTML -> known selectors -> fallback text.
// All functions are pure (html string in, plain data out) and dependency-free.
// Treat all input as UNTRUSTED: we only read text, never execute it.

// ---- JSON-LD ---------------------------------------------------------------
// Extracts <script type="application/ld+json"> blocks and returns parsed objects.
export function extractJsonLd(html) {
  const out = [];
  if (typeof html !== "string") return out;
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      /* ignore malformed JSON-LD block */
    }
  }
  return out;
}

// Finds the first JSON-LD node whose @type includes "Hospital"/"MedicalOrganization".
export function findHospitalNode(jsonld) {
  const isHospital = (t) => {
    const types = Array.isArray(t) ? t : [t];
    return types.some((x) => /hospital|medicalorganization|medicalclinic/i.test(String(x)));
  };
  for (const node of jsonld) {
    if (node && isHospital(node["@type"])) return node;
    // @graph containers
    if (node && Array.isArray(node["@graph"])) {
      const hit = node["@graph"].find((n) => n && isHospital(n["@type"]));
      if (hit) return hit;
    }
  }
  return null;
}

// ---- generic HTML helpers --------------------------------------------------
export function stripTags(html) {
  return typeof html === "string"
    ? html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

export function metaContent(html, nameOrProp) {
  if (typeof html !== "string") return null;
  const re = new RegExp(`<meta[^>]*(?:name|property)=["']${nameOrProp}["'][^>]*content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

export function firstMatch(html, re) {
  const m = typeof html === "string" ? html.match(re) : null;
  return m ? m[1].trim() : null;
}

// Minimal, safe decoder for the handful of named entities real hospital pages
// actually use in titles/descriptions (&amp; &nbsp; &quot; etc.) plus numeric
// entities. NOT a full HTML parser — deliberately narrow so it can't be used
// to smuggle markup; output is always plain text.
const NAMED_ENTITIES = {
  amp: "&", nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">", "#39": "'",
};
export function decodeHtmlEntities(s) {
  if (typeof s !== "string") return s;
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    const key = code.toLowerCase();
    if (NAMED_ENTITIES[key] !== undefined) return NAMED_ENTITIES[key];
    if (key[0] === "#") {
      const codePoint = key[1] === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      if (Number.isFinite(codePoint)) { try { return String.fromCodePoint(codePoint); } catch { return whole; } }
    }
    return whole; // unknown entity — leave as-is rather than guess
  });
}

// ---- contact parser (phones/email/address) --------------------------------
// Phones: capture tel: links first (most reliable), else Indian phone patterns.
export function parseContacts(html) {
  const text = String(html || "");
  const telLinks = [...text.matchAll(/href=["']tel:([+0-9()\s-]{6,})["']/gi)].map((m) => m[1].trim());
  const emails = [...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((m) => m[0]);
  return {
    phones: [...new Set(telLinks)],
    emails: [...new Set(emails)].filter((e) => !/\.png|\.jpg|sentry|example\.com/i.test(e)),
  };
}

// ---- emergency parser ------------------------------------------------------
// CAPABILITY only. Detects mention of emergency/casualty/24-hour ER. Never infers
// live availability. Returns { hasEmergencyDept: 'yes'|'unknown', emergencyPhone }.
export function parseEmergency(html) {
  const plainText = stripTags(html);
  const text = plainText.toLowerCase();
  const mentionsER =
    /\b(emergency|casualty|accident\s*(?:and|&)?\s*emergency|24[-\s]?hour(?:s)?\s+(?:emergency|care)|trauma)\b/.test(text);
  // An "emergency number" near the word emergency, from tel: links.
  const emNear = firstMatch(html, /emergency[^<]{0,40}?tel:([+0-9()\s-]{6,})/i);
  return {
    hasEmergencyDept: mentionsER ? "yes" : "unknown",
    emergencyPhone: emNear ? emNear.trim() : null,
    evidenceText: mentionsER ? evidenceAround(plainText, /\b(emergency|casualty|trauma)\b/i) : null,
  };
}

// ---- facility parser -------------------------------------------------------
// Detects CAPABILITY (facility exists) by keyword presence in page text.
// Returns list of { facility(raw), capability:'yes' }. Availability stays unknown.
const FACILITY_KEYWORDS = {
  ICU: [/\bicu\b/, /intensive care/, /critical care unit/, /\bmicu\b/, /\bsicu\b/, /\baicu\b/],
  NICU: [/\bnicu\b/, /neonatal (?:icu|intensive care)/],
  PICU: [/\bpicu\b/, /pa?ediatric (?:icu|intensive care)/],
  CCU: [/\bccu\b/, /\biccu\b/, /cardiac icu/, /coronary care/],
  "Trauma ICU": [/trauma icu/, /trauma intensive care/],
  "Emergency Department": [/emergency department/, /accident (?:and|&) emergency/, /casualty/],
  "Trauma Center": [/trauma (?:center|centre|care)/],
  Cardiology: [/cardiac (?:care|sciences)/, /cardiology/, /\bcath ?lab\b/],
  Neurology: [/neurology|neurosciences|neurosurgery/],
  Pediatrics: [/paediatric|pediatric|children'?s (?:hospital|heart)/],
  Maternity: [/maternity|obstetric|gynaec|mother\s*(?:and|&)?\s*child/],
  "Burns Unit": [/burns? (?:unit|ward|care)/],
  "Blood Bank": [/blood bank/],
  Dialysis: [/dialysis|haemodialysis|hemodialysis/],
  CT: [/\bct scan\b|\bct\b|computed tomography/],
  MRI: [/\bmri\b|magnetic resonance/],
  Ventilator: [/ventilator/],
  "Operating Theatre": [/operation theatre|operating theatre|\bot\b|modular ot/],
  Pharmacy: [/pharmacy/],
  Ambulance: [/ambulance/],
};

export function parseFacilities(html) {
  const text = stripTags(html);
  const lower = text.toLowerCase();
  const found = [];
  for (const [facility, patterns] of Object.entries(FACILITY_KEYWORDS)) {
    const matchingPattern = patterns.find((re) => re.test(lower));
    if (matchingPattern) found.push({
      facility,
      capability: "yes",
      evidenceText: evidenceAround(text, new RegExp(matchingPattern.source, "i")),
    });
  }
  return found;
}

// A bounded excerpt of the actual fetched page, retained for human review.
// This is evidence of a keyword match, not independent proof of capability.
function evidenceAround(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return null;
  const start = Math.max(0, match.index - 75);
  const end = Math.min(text.length, match.index + match[0].length + 75);
  return text.slice(start, end).trim().slice(0, 200);
}

// ---- specialty parser ------------------------------------------------------
// Collect publicly listed specialties from links/headings; do NOT invent.
const SPECIALTY_VOCAB = [
  "Cardiology", "Neurology", "Oncology", "Pediatrics", "Paediatrics", "Orthopedics", "Orthopaedics",
  "Nephrology", "Gastroenterology", "Pulmonology", "Respiratory Medicine", "Urology", "Dermatology",
  "Endocrinology", "General Medicine", "General Surgery", "Neurosurgery", "Cardiovascular",
  "Critical Care", "Emergency", "Gynaecology", "Obstetrics", "Ophthalmology", "ENT", "Psychiatry",
  "Rheumatology", "Hematology", "Haematology", "Plastic Surgery", "Bariatric Surgery",
];

export function parseSpecialties(html) {
  const text = stripTags(html);
  const found = new Set();
  for (const s of SPECIALTY_VOCAB) {
    const re = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) found.add(s);
  }
  return [...found];
}

// ---- hospital identity parser ----------------------------------------------
// Prefers JSON-LD, falls back to <title>/meta/og.
export function parseHospital(html, jsonldNode = null) {
  const node = jsonldNode || {};
  const ogSiteName = metaContent(html, "og:site_name");
  const ogTitle = metaContent(html, "og:title");
  const titleTag = firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
  // Real sites sometimes publish a terse og:site_name (e.g. "Jaslok") while the
  // <title>/og:title carries the actual hospital name. Prefer whichever
  // candidate looks more like a full hospital name (longer, contains a space)
  // over a short single-word tag — untrusted markup, don't trust blindly.
  const nameCandidates = [node.name, ogTitle, titleTag, ogSiteName].filter(Boolean);
  const name = nameCandidates.find((c) => c.trim().split(/\s+/).length >= 2) || nameCandidates[0] || null;
  const description = node.description || metaContent(html, "description") || metaContent(html, "og:description");

  const addr = node.address || {};
  // Crawled markup is untrusted input (spec §36): a site's own og:url/JSON-LD
  // `url` field can be malformed (e.g. containing the site name instead of a
  // URL). Never trust it blindly — validate shape, else fall back to null so
  // the normalizer's known-good source.baseUrl is used instead of guessing.
  const rawWebsite = node.url || metaContent(html, "og:url");
  const website = looksLikeUrl(rawWebsite) ? rawWebsite : null;

  return {
    name: name ? decodeHtmlEntities(name.trim()) : null,
    description: description ? decodeHtmlEntities(description.trim()) : null,
    website,
    address: typeof addr === "string" ? addr : addr.streetAddress || null,
    locality: addr.addressLocality || null,
    city: addr.addressLocality || null,
    pincode: addr.postalCode || null,
    latitude: node.geo?.latitude ?? null,
    longitude: node.geo?.longitude ?? null,
    phone: node.telephone || null,
  };
}

function looksLikeUrl(v) {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
