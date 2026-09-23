import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import {
  createBloodRequest,
  listBloodRequests,
  getBloodRequest,
} from "../controllers/bloodRequestController.js";

const router = Router();

// Public / Authenticated creation of blood request or donation pledge
router.post(
  "/",
  optionalAuth,
  body("type")
    .isIn(["REQUEST", "DONATION"])
    .withMessage("Type must be either 'REQUEST' or 'DONATION'"),
  body("bloodBankName")
    .custom((val, { req }) => {
      if (req.body.isUrgent) return true;
      if (!val || !val.trim()) {
        throw new Error("Blood bank name is required");
      }
      return true;
    }),
  body("bloodGroup")
    .isIn(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"])
    .withMessage("Valid blood group is required"),
  body("patientOrDonorName").trim().notEmpty().withMessage("Name is required"),
  body("contactPhone").trim().notEmpty().withMessage("Contact phone is required"),
  validate,
  createBloodRequest
);

// Listing requires authentication (admins see all; users see own)
router.get("/", requireAuth, listBloodRequests);

// Get by reference or ID
router.get("/:reference", optionalAuth, getBloodRequest);

export default router;
