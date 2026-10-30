import { requireRecentPrivilegedAuthentication } from "../middleware/privilegedSecurity.js";
import { Router } from "express";
import { body, param, query } from "express-validator";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { listJobs, listOrganizationsWithJobs, getJob, manageJobs, createJob, updateJob, updateJobAvailability, setJobStatus, applyToJob, myApplications, jobApplications, reviewApplication } from "../controllers/careersController.js";
import { applicationValidators } from "../validation/healthcare.js";
import { captureIdempotencyKey } from "../middleware/idempotency.js";
export const jobsRouter = Router();
const jobDetails = () => [
  body("department").optional().isString().trim().isLength({ max: 100 }),
  body("requirements").optional().isString().trim().isLength({ max: 2000 }),
  body("location").optional().isString().trim().isLength({ max: 160 }),
  body("salaryText").optional().isString().trim().isLength({ max: 100 }),
  body("deadline").optional().isString().isISO8601(),
];
jobsRouter.get("/", query("page").optional().isInt({ min: 1, max: 10000 }), query("limit").optional().isInt({ min: 1, max: 150 }),
  query("employmentType").optional().isIn(["full_time", "part_time", "contract", "internship"]), validate, listJobs);
jobsRouter.get("/organizations", listOrganizationsWithJobs);
jobsRouter.get("/manage", requireAuth, requireRole("provider_admin", "hospital_admin", "system_admin"), manageJobs);
jobsRouter.post("/", requireAuth, requireRole("provider_admin", "hospital_admin", "system_admin"),
  body().custom((_value, { req }) => {
    const ids = [req.body.hospital, req.body.provider].filter(Boolean);
    if (ids.length !== 1 || !mongoose.isValidObjectId(ids[0])) throw new Error("Exactly one valid hospital or provider ID is required");
    return true;
  }), body("title").isString().trim().isLength({ min: 3, max: 160 }),
  body("category").isString().isIn(["Doctor", "Nurse", "Technician", "Pharmacist", "Administrative", "Emergency Staff", "Internship", "Other"]),
  body("description").isString().trim().isLength({ min: 10, max: 4000 }), body("employmentType").isString().isIn(["full_time", "part_time", "contract", "internship"]),
  ...jobDetails(), body("vacancies").optional({ nullable: true }).custom(value => Number.isSafeInteger(value) && value >= 0 && value <= 10000), validate, createJob);
jobsRouter.get("/:id", param("id").isMongoId(), validate, getJob);
jobsRouter.patch("/:id/availability", requireAuth, requireRole("provider_admin", "hospital_admin", "system_admin"),
  param("id").isMongoId(), body().custom(value => {
    if (!value || Object.keys(value).some(key => !["vacancies", "filledPositions", "expectedVersion"].includes(key))) throw new Error("Unexpected availability field");
    if (!(value.vacancies === null || Number.isSafeInteger(value.vacancies) && value.vacancies >= 0 && value.vacancies <= 10000)
      || !Number.isSafeInteger(value.filledPositions) || value.filledPositions < 0 || value.filledPositions > 10000
      || value.vacancies !== null && value.filledPositions > value.vacancies
      || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0) throw new Error("Invalid vacancy counts or version");
    return true;
  }), validate, updateJobAvailability);
jobsRouter.patch("/:id", requireAuth, requireRecentPrivilegedAuthentication, param("id").isMongoId(),
  body().custom(value => !["vacancies", "filledPositions", "availabilityReportedAt", "availabilityReportedBy"].some(key => Object.hasOwn(value, key))),
  ...jobDetails(), body("title").optional().isString().trim().isLength({ min: 3, max: 160 }),
  body("description").optional().isString().trim().isLength({ min: 10, max: 4000 }),
  body("category").optional().isIn(["Doctor", "Nurse", "Technician", "Pharmacist", "Administrative", "Emergency Staff", "Internship", "Other"]),
  body("employmentType").optional().isIn(["full_time", "part_time", "contract", "internship"]), validate, updateJob);
jobsRouter.post("/:id/status", requireAuth, requireRecentPrivilegedAuthentication, param("id").isMongoId(), body("status").isIn(["published", "closed", "rejected"]), validate, setJobStatus);
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
applicationsRouter.patch("/:id", requireAuth, requireRecentPrivilegedAuthentication, param("id").isMongoId(), body("status").isIn(["under_review", "shortlisted", "rejected"]), validate, reviewApplication);
