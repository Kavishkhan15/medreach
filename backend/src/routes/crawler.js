import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listJobs, listResults, runCrawl } from "../controllers/crawlerController.js";

const router = Router();
const admin = [requireAuth, requireRole("admin", "system_admin", "hospital_admin")];

router.get("/jobs", ...admin, listJobs);
router.get("/results", ...admin, listResults);
router.post("/run", ...admin, runCrawl); // ?sourceId= (approved source only)

export default router;
