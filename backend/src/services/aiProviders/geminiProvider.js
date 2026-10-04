// Optional external AI provider (Google Gemini).
// Grounded strictly in real data provided by assistantService.

import { Agent, fetch as undiciFetch } from "undici";
import { env } from "../../config/env.js";

const ipv4Agent = new Agent({ connect: { family: 4 } });

const SYSTEM_PROMPT =
  "You are the MedReach healthcare assistant for Mumbai. You help users find listed " +
  "hospitals, blood banks, urgent blood supplies, ambulances, diagnostic centers, hospital beds, " +
  "and healthcare careers using ONLY the factual data supplied to you in context. Never invent " +
  "facilities, doctors, contact numbers, beds, blood units, or real-time availability. If data " +
  "is unknown or missing, explicitly say so. State each listing's verification status accurately. " +
  "If searchScope is other_area, explain that results are outside the requested area. Never provide clinical diagnoses, medical dosages, " +
  "or claim to directly dispatch emergency ambulances. For acute life-threatening emergencies, " +
  "always lead with 'Call 112 or 108 immediately.' Keep answers calm, concise, and actionable.";

const DEFAULT_MODEL = "gemini-3.6-flash";
const REQUEST_TIMEOUT_MS = 10_000;

export async function generateReply(context) {
  if (!env.aiApiKey) {
    throw new Error("AI_API_KEY is not configured for the gemini provider");
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
            thinkingConfig: { thinkingLevel: "LOW" },
          },
        }),
      }
    );
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("AI provider request timed out");
    }
    throw new Error("AI provider request failed");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`AI provider request failed (${res.status})`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("AI provider returned an empty response");
  return { text, source: "ai" };
}
