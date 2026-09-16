// Optional external AI provider (Google Gemini). Only reachable when
// AI_PROVIDER=gemini AND AI_API_KEY is set (see config/env.js) — otherwise
// assistantService never selects this module. The API key never leaves the
// server process; this file is imported only by backend code and is never
// bundled into any frontend.
//
// The model still only sees REAL MedReach data assembled by assistantService
// (hospitals, facilities, freshness, confidence) — it is asked to phrase a
// short, calm answer around that data, not to invent additional facts. If the
// call fails, times out, or is unconfigured, callers must catch and fall back
// to the rule-based provider (assistantService.getAssistantReply does this).
import { Agent, fetch as undiciFetch } from "undici";
import { env } from "../../config/env.js";

// Node's global fetch (undici) tries IPv6 addresses first by default; in
// environments without outbound IPv6 routing this causes every request to
// exhaust a 10s connect timeout against unreachable addresses before ever
// trying a working IPv4 one (a well-known Node/undici issue, not specific to
// the Gemini API — dns.setDefaultResultOrder does NOT fix it, since undici
// resolves connections independently of Node's dns module). Using undici's
// own fetch + a dedicated Agent with connect.family=4 fixes this without any
// process-level flag, scoped to just this provider's outbound requests.
const ipv4Agent = new Agent({ connect: { family: 4 } });

const SYSTEM_PROMPT =
  "You are the MedReach emergency-information assistant. You help users find " +
  "hospitals and understand emergency options in Mumbai using ONLY the hospital " +
  "data supplied to you. Never invent hospitals, beds, or availability. If " +
  "availability is not supplied or is 'unknown', say availability is unknown. " +
  "Never diagnose, prescribe, or claim to dispatch an ambulance. Keep answers " +
  "short, calm, and actionable. For life-threatening emergencies, always lead " +
  "with 'Call 112 immediately.'";

const DEFAULT_MODEL = "gemini-3.6-flash";
const REQUEST_TIMEOUT_MS = 10_000;

export async function generateReply(context) {
  if (!env.aiApiKey) {
    throw new Error("AI_API_KEY is not configured for the gemini provider");
  }

  const { message, intent, hospitals = [] } = context;
  const userContent = JSON.stringify({ message, intent, hospitals });
  const model = env.aiModel || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await undiciFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.aiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        dispatcher: ipv4Agent,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userContent }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.2,
            // gemini-3.x models spend output tokens on internal "thinking"
            // by default, which was silently truncating replies before the
            // visible answer even started (finishReason: MAX_TOKENS).
            // thinkingBudget:0 is rejected by this model family (400
            // INVALID_ARGUMENT); thinkingLevel:"LOW" is the supported way to
            // minimize it for a short, direct assistant reply.
            thinkingConfig: { thinkingLevel: "LOW" },
          },
        }),
      }
    );
  } catch (err) {
    // AbortError (timeout) and network failures both surface here; never leak
    // the underlying error (which could reference the request URL/key) to
    // the caller — assistantService only needs to know this provider failed.
    if (err?.name === "AbortError") {
      throw new Error("AI provider request timed out");
    }
    throw new Error("AI provider request failed");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Deliberately generic — never forward res.status details, headers, or
    // body (which could echo back the API key or quota/billing info).
    throw new Error(`AI provider request failed (${res.status})`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("AI provider returned an empty response");
  return { text, source: "ai" };
}
