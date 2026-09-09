import { asyncHandler } from "../utils/asyncHandler.js";
import { sanitizeMessage } from "../utils/sanitize.js";
import { getAssistantReply } from "../services/assistantService.js";

// POST /api/assistant/message — public, rate-limited (see routes/assistantRoutes.js).
// Never echoes provider config, system prompts, or internal error detail back
// to the client; provider/network failures always resolve to a safe reply via
// assistantService's built-in fallback, so this handler cannot leak internals
// even on error.
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
      hospitals: reply.hospitals,
      source: reply.source,
    });
  } catch {
    // getAssistantReply already falls back internally; this only catches truly
    // unexpected failures (e.g. DB unreachable) so the client always gets a
    // clean, safe response instead of a 500 that would break the chat UI.
    res.json({
      reply: "AI assistant is temporarily unavailable.",
      intent: "unavailable",
      hospitals: [],
      source: "fallback",
      unavailable: true,
    });
  }
});
