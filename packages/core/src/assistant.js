// AI Assistant constants — framework-free, zero CSS classes (same rule as
// constants.js). Every variant renders these identically; only styling differs.

export const ASSISTANT_ENTRY_LABEL = "Ask MedReach AI Assistant";
export const ASSISTANT_ENTRY_SUBTITLE = "Get guidance, find hospitals, and understand what to do.";

export const ASSISTANT_CHAT_TITLE = "MedReach AI Assistant";
export const ASSISTANT_CHAT_SUBTITLE = "Emergency information assistant";

export const ASSISTANT_DISCLAIMER =
  "MedReach AI provides general information and hospital-discovery assistance. " +
  "It does not replace professional medical advice or emergency services.";

export const ASSISTANT_UNAVAILABLE_MESSAGE = "AI assistant is temporarily unavailable.";

// Suggested prompts shown as quick-action chips in the chat panel.
export const ASSISTANT_QUICK_ACTIONS = [
  "Find an emergency hospital",
  "Where is the nearest hospital?",
  "What should I do in an emergency?",
  "Find ICU hospitals",
  "Find cardiac emergency care",
  "Find trauma hospitals",
];

// Locality prompt shown when GPS is unavailable/denied — matches useLocation's
// manual-locality fallback so the assistant asks the same way the rest of the
// app does.
export const ASSISTANT_LOCALITY_PROMPT = "Which Mumbai area are you in?";
