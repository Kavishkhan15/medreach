// Optional external AI provider. Only reachable when AI_PROVIDER=openai AND
// AI_API_KEY is set (see config/env.js) — otherwise assistantService never
// selects this module. The API key never leaves the server process; this file
// is imported only by backend code and is never bundled into any frontend.
//
// The model still only sees REAL MedReach data assembled by assistantService
// (hospitals, facilities, freshness, confidence) — it is asked to phrase a
// short, calm answer around that data, not to invent additional facts. If the
// call fails or is unconfigured, callers must catch and fall back to the
// rule-based provider (assistantService does this).
import { env } from "../../config/env.js";

const SYSTEM_PROMPT =
  "You are the MedReach emergency-information assistant. You help users find " +
  "hospitals and understand emergency options in Mumbai using ONLY the hospital " +
  "data supplied to you. Never invent hospitals, beds, or availability. If " +
  "availability is not supplied or is 'unknown', say availability is unknown. " +
  "Never diagnose, prescribe, or claim to dispatch an ambulance. Keep answers " +
  "short, calm, and actionable. For life-threatening emergencies, always lead " +
  "with 'Call 112'.";

export async function generateReply(context) {
  if (!env.aiApiKey) {
    throw new Error("AI_API_KEY is not configured for the openai provider");
  }

  const { message, intent, hospitals = [] } = context;
  const userContent = JSON.stringify({ message, intent, hospitals });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.aiApiKey}`,
    },
    body: JSON.stringify({
      model: env.aiModel || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 300,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`AI provider request failed (${res.status})`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI provider returned an empty response");
  return { text, source: "ai" };
}
