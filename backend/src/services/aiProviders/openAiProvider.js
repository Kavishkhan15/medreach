// Optional external AI provider (OpenAI).
// Uses LLM for natural language phrasing, intent clarification, and conversation,
// grounded strictly in REAL data fetched by assistantService.

import { env } from "../../config/env.js";

const SYSTEM_PROMPT =
  "You are the MedReach healthcare assistant for Mumbai. You help users find listed " +
  "hospitals, blood banks, urgent blood supplies, ambulances, diagnostic centers, hospital beds, " +
  "and healthcare careers using ONLY the factual data supplied to you in context. Never invent " +
  "facilities, doctors, contact numbers, beds, blood units, or real-time availability. If data " +
  "is unknown or missing, explicitly say so. State each listing's verification status accurately. " +
  "If searchScope is other_area, explain that results are outside the requested area. Never provide clinical diagnoses, medical dosages, " +
  "or claim to directly dispatch emergency ambulances. For acute life-threatening emergencies, " +
  "always lead with 'Call 112 or 108 immediately.' Keep answers calm, concise, and actionable.";

export async function generateReply(context) {
  if (!env.aiApiKey) {
    throw new Error("AI_API_KEY is not configured for the openai provider");
  }

  const {
    message,
    intent,
    locality,
    searchScope,
    hospitals = [],
    bloodBanks = [],
    ambulances = [],
    diagnostics = [],
    jobs = [],
    suggestedActions = [],
  } = context;

  const userContent = JSON.stringify({
    message,
    intent,
    locality,
    searchScope,
    hospitals: hospitals.slice(0, 3),
    bloodBanks: bloodBanks.slice(0, 3),
    ambulances: ambulances.slice(0, 3),
    diagnostics: diagnostics.slice(0, 3),
    jobs: jobs.slice(0, 3),
    suggestedActions,
  });

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
      max_tokens: 450,
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
