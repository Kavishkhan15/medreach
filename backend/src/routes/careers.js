import { Router } from "express";
import { body, param } from "express-validator";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { listJobs, listOrganizationsWithJobs, getJob, manageJobs, createJob, updateJob, setJobStatus, applyToJob, myApplications, jobApplications, reviewApplication } from "../controllers/careersController.js";
import { applicationValidators } from "../validation/healthcare.js";
import { captureIdempotencyKey } from "../middleware/idempotency.js";
export const jobsRouter = Router();
jobsRouter.get("/", listJobs);
jobsRouter.get("/organizations", listOrganizationsWithJobs);
jobsRouter.get("/manage", requireAuth, requireRole("provider_admin", "hospital_admin", "system_admin"), manageJobs);
jobsRouter.post("/", requireAuth, requireRole("provider_admin", "hospital_admin", "system_admin"),
  body().custom((_value, { req }) => {
    const ids = [req.body.hospital, req.body.provider].filter(Boolean);
    if (ids.length !== 1 || !mongoose.isValidObjectId(ids[0])) throw new Error("Exactly one valid hospital or provider ID is required");
    return true;
  }), body("title").trim().isLength({ min: 3, max: 160 }),
  body("category").isIn(["Doctor", "Nurse", "Technician", "Pharmacist", "Administrative", "Emergency Staff", "Internship", "Other"]),
  body("description").trim().isLength({ min: 10, max: 4000 }), body("employmentType").isIn(["full_time", "part_time", "contract", "internship"]), validate, createJob);
jobsRouter.get("/:id", param("id").isMongoId(), validate, getJob);
jobsRouter.patch("/:id", requireAuth, param("id").isMongoId(), validate, updateJob);
jobsRouter.post("/:id/status", requireAuth, param("id").isMongoId(), body("status").isIn(["published", "closed", "rejected"]), validate, setJobStatus);
jobsRouter.post("/:id/apply", requireAuth, param("id").isMongoId(),
  captureIdempotencyKey("job-application"),
  ...applicationValidators(body),
  body().custom((_value, { req }) => {
    const text = (req.body.sop || req.body.statement || "").trim();
    if (!text || text.length < 10 || text.length > 4000) {
      throw new Error("Statement of Purpose or statement is required (10-4000 characters)");
    }
    return true;
  }),
  validate, applyToJob);
jobsRouter.get("/:id/applications", requireAuth, param("id").isMongoId(), validate, jobApplications);
export const applicationsRouter = Router();
applicationsRouter.get("/mine", requireAuth, myApplications);
applicationsRouter.patch("/:id", requireAuth, param("id").isMongoId(), body("status").isIn(["under_review", "shortlisted", "rejected"]), validate, reviewApplication);
