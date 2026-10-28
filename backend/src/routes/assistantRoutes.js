import { Router } from "express";
import { sharedLimiter } from "../middleware/sharedLimiter.js";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { sendMessage } from "../controllers/assistantController.js";
import { MAX_MESSAGE_LENGTH } from "../utils/sanitize.js";

const router = Router();

// Own limiter, separate from authLimiter (security.js) — a chat surface gets
// more requests per session than login, but must still cap potential LLM-cost
// abuse and basic flooding. Public endpoint, same trust tier as hospital search.
const assistantLimiter = sharedLimiter("assistant", 20, 5 * 60 * 1000);

router.post(
  "/message",
  assistantLimiter,
  body("message").isString().trim().isLength({ min: 1, max: MAX_MESSAGE_LENGTH }),
  body("locality").optional().isString().trim().isLength({ max: 100 }),
  body("origin.lat").optional().isFloat({ min: -90, max: 90 }),
  body("origin.lng").optional().isFloat({ min: -180, max: 180 }),
  validate,
  sendMessage
);

export default router;
