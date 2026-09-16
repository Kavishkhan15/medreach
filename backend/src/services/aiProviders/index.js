// AI provider abstraction. Every provider implements the same contract so the
// UI, controller, and assistant service never know which one is active:
//
//   async function generateReply(context) -> { text: string, source: "ai" | "rule_based" }
//
// `context` (built by assistantService.buildContext, NEVER includes secrets):
//   {
//     message: string,               // sanitized user message
//     intent: "emergency"|"hospital_search"|"general",
//     hospitals: Array<HospitalSummary>,  // REAL data only, already fetched — provider must not invent more
//     locality: string|null,
//     history: Array<{ role, text }> // short recent turns, for context only
//   }
//
// A provider must NEVER:
//   - fabricate hospital data, bed counts, or availability
//   - diagnose, prescribe, or claim to dispatch an ambulance
//   - leak API keys, prompts, or internal config in its reply text
//
// Selection is env-driven (config/env.js `aiProvider`) so switching providers
// never requires a UI change or a different API contract.
import { generateReply as ruleBasedReply } from "./ruleBasedProvider.js";
import { generateReply as openAiReply } from "./openAiProvider.js";
import { generateReply as geminiReply } from "./geminiProvider.js";
import { env } from "../../config/env.js";

const PROVIDERS = {
  rule_based: { generateReply: ruleBasedReply },
  openai: { generateReply: openAiReply },
  gemini: { generateReply: geminiReply },
};

// Resolves the active provider each call so tests can override env cheaply,
// and falls back to rule_based for any unknown/misconfigured value.
export function getAiProvider() {
  const key = PROVIDERS[env.aiProvider] ? env.aiProvider : "rule_based";
  return PROVIDERS[key];
}
