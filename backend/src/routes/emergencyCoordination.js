import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { readEmergencyCoordination, acknowledgeEmergency } from "../services/emergencyCoordination.js";
const router = Router();
router.use(requireAuth, requireRole("system_admin", "provider_admin"));
function handler(action) {
  return async (req, res, next) => {
    try {
      const result = await action({ sourceType: req.params.sourceType, sourceId: req.params.sourceId,
        actor: req.user, expectedVersion: req.body?.expectedVersion });
      res.json({ coordination: result });
    } catch (error) {
      if ([400, 401, 403, 404, 409].includes(error.status)) return res.status(error.status).json({ error: error.message, code: error.code });
      next(error);
    }
  };
}
router.get("/:sourceType/:sourceId", handler(readEmergencyCoordination));
router.post("/:sourceType/:sourceId/acknowledge", handler(acknowledgeEmergency));
export default router;
