import { Router } from "express";
import mongoose from "mongoose";

const router = Router();

// Liveness + readiness. Reports DB connection state without leaking config.
router.get("/", (_req, res) => {
  const dbState = ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] || "unknown";
  res.json({ ok: true, service: "medreach-api", db: dbState, ts: new Date().toISOString() });
});

export default router;
