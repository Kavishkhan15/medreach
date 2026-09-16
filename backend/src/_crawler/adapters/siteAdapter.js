// SiteAdapter — base contract for source-specific hospital-site adapters.
// Pipeline per spec §10/§11:
//   discoverPages() -> guardedFetch each -> parse (JSON-LD -> semantic -> selectors
//   -> fallback text) -> normalizeRecord() -> validate().
// Subclasses override discoverPages() and MAY override parse hooks for known
// source-specific structure. All fetching goes through guardedFetch (robots+SSRF+
// registry). Never executes page scripts. Deterministic; NO AI/ML.

import { guardedFetch } from "../fetchers/guardedFetch.js";
import {
  extractJsonLd, findHospitalNode, parseHospital, parseFacilities,
  parseSpecialties, parseEmergency, parseContacts, stripTags, decodeHtmlEntities,
} from "../parsers/structured.js";
import { normalizeRecord } from "../normalization/normalizeRecord.js";

function excerptFor(html, value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ");
  const needle = value.trim().replace(/\s+/g, " ");
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return null;
  return text.slice(Math.max(0, index - 60), Math.min(text.length, index + needle.length + 60));
}

export class SiteAdapter {
  constructor(source, deps = {}) {
    this.source = source;
    this.deps = deps; // { fetchImpl } for tests
    this.parserVersion = `${source.adapter}-v1`;
  }

  // Subclasses override: return array of absolute/relative page URLs to fetch.
  discoverPages() {
    return ["/"];
  }

  // Per-page parse. Subclasses may override for source-specific selectors.
  parsePage(html) {
    const jsonld = extractJsonLd(html);
    const node = findHospitalNode(jsonld);
    return {
      hospital: parseHospital(html, node),
      facilities: parseFacilities(html),
      specialties: parseSpecialties(html),
      emergency: parseEmergency(html),
      contacts: parseContacts(html),
    };
  }

  // Merge parsed parts across pages (union facilities/specialties, first non-null identity).
  mergeParsed(parts) {
    const merged = { hospital: {}, facilities: [], specialties: [], emergency: { hasEmergencyDept: "unknown", emergencyPhone: null }, contacts: { phones: [], emails: [] }, fieldEvidence: {} };
    const facSeen = new Set();
    const specSeen = new Set();
    for (const p of parts) {
      for (const [k, v] of Object.entries(p.hospital || {})) {
        if (merged.hospital[k] == null && v != null && v !== "") {
          merged.hospital[k] = v;
          if (p.fieldEvidence?.[k]) merged.fieldEvidence[k] = p.fieldEvidence[k];
        }
      }
      for (const f of p.facilities || []) if (!facSeen.has(f.facility)) { facSeen.add(f.facility); merged.facilities.push(f); }
      for (const s of p.specialties || []) if (!specSeen.has(s)) {
        specSeen.add(s); merged.specialties.push(s);
        const pages = merged.fieldEvidence.specialties?.sourcePageUrls || [];
        if (p.sourcePageUrl && !pages.includes(p.sourcePageUrl)) pages.push(p.sourcePageUrl);
        merged.fieldEvidence.specialties = { sourcePageUrl: pages[0], sourcePageUrls: pages };
      }
      if (p.emergency?.hasEmergencyDept === "yes") {
        merged.emergency.hasEmergencyDept = "yes";
        if (!merged.emergency.evidenceText && p.emergency.evidenceText) {
          merged.emergency.evidenceText = p.emergency.evidenceText;
          merged.emergency.sourcePageUrl = p.emergency.sourcePageUrl;
        }
      }
      if (!merged.emergency.emergencyPhone && p.emergency?.emergencyPhone) {
        merged.emergency.emergencyPhone = p.emergency.emergencyPhone;
        merged.fieldEvidence.emergencyPhone = p.fieldEvidence?.emergencyPhone || { sourcePageUrl: p.sourcePageUrl };
      }
      merged.contacts.phones.push(...(p.contacts?.phones || []));
      if (!merged.fieldEvidence.phone && p.contacts?.phones?.length) {
        merged.fieldEvidence.phone = { sourcePageUrl: p.sourcePageUrl,
          evidenceText: excerptFor(p.html, p.contacts.phones[0]) };
      }
      merged.contacts.emails.push(...(p.contacts?.emails || []));
    }
    merged.contacts.phones = [...new Set(merged.contacts.phones)];
    merged.contacts.emails = [...new Set(merged.contacts.emails)];
    return merged;
  }

  // Full run: fetch allowed pages, parse, normalize. Returns
  // { ok, record?, pagesVisited, pageResults, reason? }. Never throws.
  async run() {
    const pages = this.discoverPages().slice(0, this.source.maxPages || 8);
    const parts = [];
    const pageResults = [];
    let firstPageUrl = null;
    for (const page of pages) {
      const res = await guardedFetch(this.source, page, this.deps);
      pageResults.push({ page, ok: res.ok, status: res.status, reason: res.reason });
      if (res.status === 403 || res.status === 429) return {
        ok: false, pagesVisited: pageResults.filter((p) => p.ok).length, pageResults,
        reason: res.status === 403 ? "access_blocked" : "rate_limited",
      };
      if (!res.ok) continue;
      if (!firstPageUrl) firstPageUrl = res.finalUrl || new URL(page, this.source.baseUrl).href;
      try {
        const parsed = this.parsePage(res.body);
        const pageUrl = res.finalUrl || new URL(page, this.source.baseUrl).href;
        const fieldEvidence = Object.fromEntries(Object.entries(parsed.hospital || {})
          .filter(([, value]) => typeof value === "string" && value.trim())
          .map(([field, value]) => [field, { sourcePageUrl: pageUrl, evidenceText: excerptFor(res.body, value) }]));
        if (parsed.emergency?.emergencyPhone) fieldEvidence.emergencyPhone = {
          sourcePageUrl: pageUrl, evidenceText: excerptFor(res.body, parsed.emergency.emergencyPhone),
        };
        parts.push({
          ...parsed,
          sourcePageUrl: pageUrl,
          html: res.body,
          fieldEvidence,
          facilities: (parsed.facilities || []).map((facility) => ({ ...facility, sourcePageUrl: pageUrl })),
          emergency: { ...parsed.emergency, sourcePageUrl: pageUrl },
        });
      } catch (e) {
        pageResults.push({ page, ok: false, reason: `parse_error:${e.message}` });
      }
    }

    if (parts.length === 0) {
      // Distinguish robots/blocked from generic failure for source state.
      const blocked = pageResults.find((p) => p.reason === "robots_disallowed");
      return { ok: false, pagesVisited: pageResults.filter((p) => p.ok).length, pageResults,
        reason: blocked ? "robots_disallowed" : "no_pages_fetched" };
    }

    const merged = this.mergeParsed(parts);
    const record = normalizeRecord({
      ...merged,
      source: this.source,
      sourceUrl: firstPageUrl,
      parserVersion: this.parserVersion,
      retrievedAt: new Date().toISOString(),
    });
    return { ok: true, record, pagesVisited: pageResults.filter((p) => p.ok).length, pageResults };
  }
}
