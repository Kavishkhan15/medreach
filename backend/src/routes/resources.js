import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listResources, getResource, createResource, updateResource } from "../controllers/resourceController.js";
export const resourceRouter = (kind) => {
  const router = Router();
  router.get("/", listResources(kind));
  router.get("/:id", param("id").isMongoId(), validate, getResource(kind));
  return router;
};
export const resourceAdminRouter = Router();
resourceAdminRouter.post("/", requireAuth, requireRole("admin", "system_admin"),
  body("kind").isIn(["blood_bank", "diagnostic", "ambulance"]), body("name").trim().isLength({ min: 2, max: 180 }),
  body("sourceName").trim().notEmpty(), validate, createResource);
resourceAdminRouter.patch("/:id", requireAuth, requireRole("admin", "system_admin"),
  param("id").isMongoId(), validate, updateResource);
