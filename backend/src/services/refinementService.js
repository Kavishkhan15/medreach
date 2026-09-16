import { env } from "../config/env.js";
import { FACILITY_TYPES } from "../config/constants.js";
import { FacilitySourceClaim } from "../models/FacilitySourceClaim.js";
import { RefinementCandidate } from "../models/RefinementCandidate.js";

export function refinementStatus() {
  return { enabled: env.geminiRefinementEnabled,
    configured: Boolean(env.geminiRefinementEnabled && env.geminiRefinementApiKey),
    model: env.geminiRefinementModel, promptVersion: "facility-evidence-v1" };
}

export function validateRefinementSuggestion(suggestion, originalText) {
  if (!suggestion || !FACILITY_TYPES.includes(suggestion.facility) || !["yes", "no"].includes(suggestion.capability)) return null;
  const excerpt = String(suggestion.evidence || "").trim();
  if (excerpt.length < 8 || excerpt.length > 200 || !String(originalText).includes(excerpt)) return null;
  return { facility: suggestion.facility, candidateCapability: suggestion.capability, evidenceExcerpt: excerpt };
}

export async function refineFacilityClaim(claimId) {
  const claim = await FacilitySourceClaim.findById(claimId);
  if (!claim) return { error: "Claim not found", status: 404 };
  if (claim.evidenceKind !== "source_excerpt" || !claim.evidenceText || !claim.sourcePageUrl?.startsWith("https://")) {
    return { error: "A source excerpt and HTTPS source page are required", status: 422 };
  }
  if (!refinementStatus().configured) return { error: "Gemini refinement is not configured", status: 409 };
  const model = env.geminiRefinementModel;
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(model)) return { error: "Invalid Gemini model setting", status: 500 };
  const prompt = JSON.stringify({ task: "Suggest only facility capability claims supported by exact text.",
    allowedFacilities: FACILITY_TYPES, sourceExcerpt: claim.evidenceText,
    rules: "Return JSON {suggestions:[{facility,capability,evidence}]}. evidence must be an exact substring. No beds, availability, blood inventory, phone, diagnosis, or invented facts." });
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiRefinementApiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 600 } }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { return { error: "Gemini unavailable; deterministic crawler data remains unchanged", status: 503 }; }
  if (!response.ok) return { error: "Gemini unavailable; deterministic crawler data remains unchanged", status: 503 };
  let parsed;
  try { const raw = await response.json(); parsed = JSON.parse(raw.candidates?.[0]?.content?.parts?.[0]?.text || "{}"); }
  catch { return { error: "Gemini returned invalid structured output", status: 502 }; }
  const valid = (Array.isArray(parsed.suggestions) ? parsed.suggestions : []).slice(0, 8)
    .map((item) => validateRefinementSuggestion(item, claim.evidenceText)).filter(Boolean);
  const candidates = [];
  for (const item of valid) {
    const candidate = await RefinementCandidate.findOneAndUpdate({ claim: claim._id, facility: item.facility, candidateCapability: item.candidateCapability },
      { $setOnInsert: { hospital: claim.hospital, source: claim.source, sourcePageUrl: claim.sourcePageUrl,
        evidenceExcerpt: item.evidenceExcerpt, model, promptVersion: "facility-evidence-v1", confidence: "LOW", status: "pending" } },
      { upsert: true, new: true, runValidators: true });
    candidates.push(candidate);
  }
  return { candidates, rejectedCount: (parsed.suggestions?.length || 0) - candidates.length };
}

export async function enqueueRefinementAfterCrawl({ sourceId, since }) {
  if (!refinementStatus().configured) return { attempted: 0, disabled: true };
  const claims = await FacilitySourceClaim.find({ source: sourceId, evidenceKind: "source_excerpt",
    observedAt: { $gte: since } }).select("_id").limit(5).lean();
  const results = [];
  for (const claim of claims) results.push(await refineFacilityClaim(claim._id));
  return { attempted: claims.length, candidates: results.reduce((n, item) => n + (item.candidates?.length || 0), 0) };
}
