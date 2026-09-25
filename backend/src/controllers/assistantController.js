import { asyncHandler } from "../utils/asyncHandler.js";
import { sanitizeMessage } from "../utils/sanitize.js";
import { getAssistantReply } from "../services/assistantService.js";

// POST /api/assistant/message — public, rate-limited (see routes/assistantRoutes.js).
// Delivers factual MedReach healthcare guidance, provider entities, and suggested actions.
export const sendMessage = asyncHandler(async (req, res) => {
  const message = sanitizeMessage(req.body.message);
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const { locality, origin } = req.body;
  const safeOrigin =
    origin && typeof origin.lat === "number" && typeof origin.lng === "number" ? origin : undefined;

  try {
    const reply = await getAssistantReply(message, { locality, origin: safeOrigin });
    res.json({
      reply: reply.text,
      intent: reply.intent,
      source: reply.source,
      hospitals: reply.hospitals || [],
      bloodBanks: reply.bloodBanks || [],
      diagnostics: reply.diagnostics || [],
      ambulances: reply.ambulances || [],
      jobs: reply.jobs || [],
      suggestedActions: reply.suggestedActions || [],
      suggestedPrompts: reply.suggestedPrompts || [],
      locality: reply.locality || null,
      category: reply.category || null,
      bloodGroup: reply.bloodGroup || null,
    });
  } catch (err) {
    // Unexpected error fallback
    res.json({
      reply: "AI assistant is temporarily unavailable. For emergency medical help, please dial 112 or 108 immediately.",
      intent: "unavailable",
      hospitals: [],
      bloodBanks: [],
      diagnostics: [],
      ambulances: [],
      jobs: [],
      suggestedActions: [
        { type: "call", label: "Call 112", phone: "112", primary: true },
        { type: "call", label: "Call 108", phone: "108" },
      ],
      suggestedPrompts: [],
      source: "fallback",
      unavailable: true,
    });
  }
});
