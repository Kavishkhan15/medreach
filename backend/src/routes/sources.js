import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listSources, createSource, updateSource } from "../controllers/sourceController.js";
import { SOURCE_TYPES } from "../config/constants.js";

const router = Router();
const admin = [requireAuth, requireRole("admin", "system_admin", "hospital_admin")];

router.get("/", ...admin, listSources);
router.post(
  "/", ...admin,
  body("name").trim().notEmpty(),
  body("type").isIn(SOURCE_TYPES),
  body("url").optional().isURL({ require_protocol: true, protocols: ["http", "https"] }),
  validate,
  createSource
);
router.patch("/:id", ...admin, updateSource);

export default router;
