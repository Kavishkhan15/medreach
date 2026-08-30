import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getSaved, saveHospital, unsaveHospital } from "../controllers/userController.js";

const router = Router();

router.get("/me/saved", requireAuth, getSaved);
router.post("/me/saved/:hospitalId", requireAuth, saveHospital);
router.delete("/me/saved/:hospitalId", requireAuth, unsaveHospital);

export default router;
