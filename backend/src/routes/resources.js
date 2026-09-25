import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listResources, getResource, createResource, updateResource, bookAmbulance } from "../controllers/resourceController.js";
export const resourceRouter = (kind) => {
  const router = Router();
  router.get("/", listResources(kind));
  if (kind === "ambulance") {
    router.post(
      "/book",
      body("patientName").trim().notEmpty().withMessage("Patient name is required"),
      body("patientAge").notEmpty().withMessage("Patient age is required"),
      body("contactEmail").optional({ checkFalsy: true }).trim().toLowerCase().isEmail(),
      validate,
      bookAmbulance
    );
  }
  router.get("/:id", param("id").isMongoId(), validate, getResource(kind));
  return router;
};
export const resourceAdminRouter = Router();
resourceAdminRouter.post("/", requireAuth, requireRole("admin", "system_admin"),
  body("kind").isIn(["blood_bank", "diagnostic", "ambulance"]), body("name").trim().isLength({ min: 2, max: 180 }),
  body("sourceName").trim().notEmpty(), validate, createResource);
resourceAdminRouter.patch("/:id", requireAuth, requireRole("admin", "system_admin"),
  param("id").isMongoId(), validate, updateResource);
