import express from "express";
import { env } from "../config/env.js";
import { acceptResendWebhook } from "../services/resendWebhook.js";
export const resendWebhookRouter = express.Router();
resendWebhookRouter.post("/", express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
  if (!env.resendWebhookSecret) return res.status(503).json({ error: "Email webhook is not configured" });
  try {
    const result = await acceptResendWebhook(req.body, req.headers, env.resendWebhookSecret);
    return res.status(result.status || 200).json(result);
  } catch (error) {
    if (/^Invalid webhook/.test(error.message)) return res.status(400).json({ error: "Invalid webhook signature or payload" });
    return res.status(503).json({ error: "Webhook persistence is temporarily unavailable; retry later" });
  }
});
