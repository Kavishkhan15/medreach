import { Agent, fetch as undiciFetch } from "undici";
import { env } from "../config/env.js";
import { Hospital } from "../models/Hospital.js";
import { HospitalFieldClaim } from "../models/HospitalFieldClaim.js";
import { FacilitySourceClaim } from "../models/FacilitySourceClaim.js";

const ipv4Agent = new Agent({ connect: { family: 4 } });
const DEFAULT_MODEL = "gemini-3.6-flash";
const REQUEST_TIMEOUT_MS = 8_000;

const ENRICHMENT_SYSTEM_PROMPT =
  "You are a strict data extraction assistant for medical directory information in Mumbai. " +
  "You extract structured factual data ONLY from the provided text excerpts. " +
  "CRITICAL RULES:\n" +
  "1. Never invent or hallucinate any data. If a field is not explicitly present in the source text, set it to null.\n" +
  "2. Return pure valid JSON with format: {\"address\": string|null, \"pincode\": string|null, \"phone\": string|null, \"specialties\": string[]|null}.\n" +
  "3. For pincode, only return a valid 6-digit Indian PIN code if explicitly stated.\n" +
  "4. For phone, only extract valid contact telephone numbers present in the excerpt.\n" +
  "5. Do not include markdown code fences or conversational text.";

export async function enrichHospitalData(hospitalIdOrSlug) {
  const query = hospitalIdOrSlug.match(/^[0-9a-fA-F]{24}$/)
    ? { _id: hospitalIdOrSlug }
    : { slug: hospitalIdOrSlug };

  const hospital = await Hospital.findOne(query).lean();
  if (!hospital) {
    return null;
  }

  // Gather existing source claims
  const [fieldClaims, facilityClaims] = await Promise.all([
    HospitalFieldClaim.find({ hospital: hospital._id }).populate("source", "name url").lean(),
    FacilitySourceClaim.find({ hospital: hospital._id }).populate("source", "name url").lean(),
  ]);

  const sourceExcerpts = [];
  let primarySourceName = hospital.locality ? `${hospital.name} Verified Profile` : "Official Directory";
  let primarySourceUrl = hospital.website || null;

  for (const claim of fieldClaims) {
    if (claim.evidenceText) {
      sourceExcerpts.push(`[${claim.field}]: ${claim.evidenceText}`);
    }
    if (claim.source?.name) primarySourceName = claim.source.name;
    if (claim.sourcePageUrl) primarySourceUrl = claim.sourcePageUrl;
  }

  for (const claim of facilityClaims) {
    if (claim.evidenceText) {
      sourceExcerpts.push(`[${claim.facility}]: ${claim.evidenceText}`);
    }
    if (claim.source?.name) primarySourceName = claim.source.name;
    if (claim.sourcePageUrl) primarySourceUrl = claim.sourcePageUrl;
  }

  let enrichedFields = {
    address: hospital.address || null,
    pincode: hospital.pincode || null,
    phone: hospital.phone || hospital.emergencyPhone || null,
    specialties: (hospital.specialties?.length ? hospital.specialties : hospital.departments) || [],
  };

  const missingAddress = !enrichedFields.address;
  const missingPincode = !enrichedFields.pincode;
  const missingPhone = !enrichedFields.phone;
  const missingSpecialties = !enrichedFields.specialties || enrichedFields.specialties.length === 0;

  let llmEnriched = false;

  // If missing key fields, use Gemini to extract supported facts from source text
  if ((missingAddress || missingPincode || missingPhone || missingSpecialties) &&
      sourceExcerpts.length > 0 &&
      env.aiApiKey &&
      env.aiProvider === "gemini") {
    try {
      const model = env.aiModel || DEFAULT_MODEL;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const promptPayload = {
        hospitalName: hospital.name,
        locality: hospital.locality,
        city: hospital.city,
        sourceExcerpts: sourceExcerpts.slice(0, 15),
      };

      const res = await undiciFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.aiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          dispatcher: ipv4Agent,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: ENRICHMENT_SYSTEM_PROMPT }] },
            contents: [{ parts: [{ text: JSON.stringify(promptPayload) }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 512,
              thinkingConfig: { thinkingLevel: "LOW" },
            },
          }),
        }
      );

      clearTimeout(timeout);

      if (res.ok) {
        const raw = await res.json();
        const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (missingAddress && parsed.address && typeof parsed.address === "string") {
            enrichedFields.address = parsed.address.trim();
            llmEnriched = true;
          }
          if (missingPincode && parsed.pincode && /^[1-9][0-9]{5}$/.test(String(parsed.pincode).trim())) {
            enrichedFields.pincode = String(parsed.pincode).trim();
            llmEnriched = true;
          }
          if (missingPhone && parsed.phone && typeof parsed.phone === "string") {
            enrichedFields.phone = parsed.phone.trim();
            llmEnriched = true;
          }
          if (missingSpecialties && Array.isArray(parsed.specialties) && parsed.specialties.length > 0) {
            enrichedFields.specialties = parsed.specialties.map((s) => String(s).trim()).filter(Boolean);
            llmEnriched = true;
          }
        }
      }
    } catch {
      // Deterministic fallback: graceful degradation if LLM is unavailable
      llmEnriched = false;
    }
  }

  // Format final result conforming strictly to:
  // "Do not hallucinate data. If unavailable, show “Not available.” Keep source information when possible."
  return {
    hospitalId: hospital._id,
    slug: hospital.slug,
    name: hospital.name,
    address: enrichedFields.address || (hospital.locality ? `${hospital.locality}, ${hospital.city || "Mumbai"}` : "Not available."),
    pincode: enrichedFields.pincode || "Not available.",
    phone: enrichedFields.phone || hospital.emergencyPhone || "Not available.",
    specialties: (enrichedFields.specialties && enrichedFields.specialties.length > 0)
      ? enrichedFields.specialties
      : ["Not available."],
    sourceName: primarySourceName,
    sourceUrl: primarySourceUrl,
    enriched: llmEnriched,
    location: hospital.location,
    emergencyPhone: hospital.emergencyPhone || "112",
  };
}
