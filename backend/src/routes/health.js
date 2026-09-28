import { Router } from "express";
import mongoose from "mongoose";

const router = Router();
const dbState = () =>
  ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] || "unknown";

// Compatibility liveness endpoint. Reports state but does not claim dependency readiness.
router.get("/", (_req, res) => {
  res.json({ ok: true, service: "medreach-api", check: "liveness", db: dbState(), ts: new Date().toISOString() });
});

router.get("/live", (_req, res) => {
  res.json({ ok: true, service: "medreach-api", check: "liveness", ts: new Date().toISOString() });
});

router.get("/ready", (_req, res) => {
  const mongodb = dbState();
  const ready = mongodb === "connected";
  res.status(ready ? 200 : 503).json({
    ok: ready,
    service: "medreach-api",
    check: "readiness",
    dependencies: { mongodb },
    ts: new Date().toISOString(),
  });
});

export default router;
