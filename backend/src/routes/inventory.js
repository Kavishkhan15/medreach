import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listInventory, listInventoryHistory, putInventory } from "../controllers/inventoryController.js";
const router = Router();
router.get("/:kind/:organizationId", listInventory);
router.get("/:kind/:organizationId/:resourceKey/history", requireAuth, requireRole("system_admin", "provider_admin"), listInventoryHistory);
router.put("/:kind/:organizationId/:resourceKey", requireAuth, requireRole("provider_admin"), putInventory);
export default router;
