import { Router } from "express";
import { body, param } from "express-validator";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { listJobs, getJob, manageJobs, createJob, updateJob, setJobStatus, applyToJob, myApplications, jobApplications, reviewApplication } from "../controllers/careersController.js";
export const jobsRouter = Router();
jobsRouter.get("/", listJobs);
jobsRouter.get("/manage", requireAuth, requireRole("hospital_admin", "admin", "system_admin"), manageJobs);
jobsRouter.post("/", requireAuth, requireRole("hospital_admin", "admin", "system_admin"),
  body("hospital").isMongoId(), body("title").trim().isLength({ min: 3, max: 160 }),
  body("category").isIn(["Doctor", "Nurse", "Technician", "Pharmacist", "Administrative", "Emergency Staff", "Internship", "Other"]),
  body("description").trim().isLength({ min: 10, max: 4000 }), body("employmentType").isIn(["full_time", "part_time", "contract", "internship"]), validate, createJob);
jobsRouter.get("/:id", param("id").isMongoId(), validate, getJob);
jobsRouter.patch("/:id", requireAuth, param("id").isMongoId(), validate, updateJob);
jobsRouter.post("/:id/status", requireAuth, param("id").isMongoId(), body("status").isIn(["published", "closed", "rejected"]), validate, setJobStatus);
jobsRouter.post("/:id/apply", requireAuth, param("id").isMongoId(), body("statement").trim().isLength({ min: 10, max: 1500 }), validate, applyToJob);
jobsRouter.get("/:id/applications", requireAuth, param("id").isMongoId(), validate, jobApplications);
export const applicationsRouter = Router();
applicationsRouter.get("/mine", requireAuth, myApplications);
applicationsRouter.patch("/:id", requireAuth, param("id").isMongoId(), body("status").isIn(["under_review", "shortlisted", "rejected"]), validate, reviewApplication);
