import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import {
  getOverview,
  listSourcesDetailed,
  listJobs,
  getJob,
  listResults,
  getDataQuality,
  getVerificationQueue,
  runCrawl,
  runAll,
  updateSource,
  resetSource,
  retryJob,
  setScheduler,
} from "../controllers/crawlerController.js";

const router = Router();
// Crawler operations affect every hospital and every approved external source.
// Hospital-scoped staff must not operate the global ingestion pipeline.
const admin = [requireAuth, requireRole("admin", "system_admin")];

// --- read: dashboard data ---
router.get("/overview", ...admin, getOverview);
router.get("/sources", ...admin, listSourcesDetailed);
router.get("/jobs", ...admin, listJobs);
router.get("/jobs/:id", ...admin, getJob);
router.get("/results", ...admin, listResults);
router.get("/data-quality", ...admin, getDataQuality);
router.get("/verification-queue", ...admin, getVerificationQueue);

// --- write: controls (registry-approved sources only; no arbitrary URLs) ---
router.post("/run", ...admin, runCrawl); // ?sourceId= [&dryRun=true]
router.post("/run-all", ...admin, runAll); // [?dryRun=true]
router.patch("/sources/:sourceKey", ...admin, updateSource); // enable/freq/rate/reliability/notes
router.post("/sources/:sourceKey/reset", ...admin, resetSource);
router.post("/jobs/:id/retry", ...admin, retryJob);
router.post("/scheduler", ...admin, body("paused").isBoolean(), validate, setScheduler); // { paused: bool }

export default router;
