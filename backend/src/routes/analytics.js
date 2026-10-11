import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { analyticsOverview } from "../controllers/analyticsController.js";
const router = Router();
router.get("/overview", requireAuth, requireRole("system_admin"), analyticsOverview);
export default router;
