import { Job } from "../models/Job.js";
import { JobApplication } from "../models/JobApplication.js";
import { Hospital } from "../models/Hospital.js";
import { AuditLog } from "../models/AuditLog.js";
import { User } from "../models/User.js";
import { canManageHospital } from "../services/hospitalAccess.js";
import { notifyUser } from "../services/notificationService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const jobFields = ["hospital", "title", "category", "department", "description", "requirements", "employmentType", "location", "salaryText", "deadline"];
const patchFrom = (body) => Object.fromEntries(jobFields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
export const listJobs = asyncHandler(async (req, res) => {
  const filter = { status: "published" };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) filter.title = { $regex: String(req.query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const data = await Job.find(filter).populate("hospital", "name slug locality").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ data });
});
export const getJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id).populate("hospital", "name slug locality").lean();
  if (!job || job.status !== "published") return res.status(404).json({ error: "Job not found" });
  res.json({ job });
});
export const manageJobs = asyncHandler(async (req, res) => {
  const filter = {};
  if (!["admin", "system_admin"].includes(req.user.role)) {
    const ids = await Hospital.find({ admins: req.user.id }).distinct("_id");
    filter.hospital = { $in: ids };
  }
  const data = await Job.find(filter).populate("hospital", "name slug").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ data });
});
export const createJob = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findById(req.body.hospital);
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  if (!canManageHospital(req.user, hospital)) return res.status(403).json({ error: "Not assigned to this hospital" });
  const job = await Job.create({ ...patchFrom(req.body), createdBy: req.user.id, status: "draft" });
  await AuditLog.create({ user: req.user.id, action: "create", entityType: "Job", entityId: job._id,
    after: { hospital: hospital._id, status: job.status }, requestId: req.id });
  res.status(201).json({ job });
});
export const updateJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const hospital = await Hospital.findById(job.hospital);
  if (!canManageHospital(req.user, hospital)) return res.status(403).json({ error: "Not assigned to this hospital" });
  const before = { title: job.title, status: job.status };
  Object.assign(job, { ...patchFrom(req.body), hospital: job.hospital });
  if (!["admin", "system_admin"].includes(req.user.role) && ["published", "closed", "rejected"].includes(before.status)) {
    job.status = "pending";
    job.verificationStatus = "unverified";
    job.reviewedBy = undefined;
  }
  await job.save();
  await AuditLog.create({ user: req.user.id, action: "update", entityType: "Job", entityId: job._id,
    before, after: { title: job.title, status: job.status }, requestId: req.id });
  res.json({ job });
});
export const setJobStatus = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const hospital = await Hospital.findById(job.hospital);
  if (!canManageHospital(req.user, hospital)) return res.status(403).json({ error: "Not assigned to this hospital" });
  const next = req.body.status;
  if (next === "published" && ["admin", "system_admin"].includes(req.user.role) && !["pending", "draft"].includes(job.status)) {
    return res.status(409).json({ error: "Only a draft or pending listing can be published" });
  }
  if (next === "published" && !["admin", "system_admin"].includes(req.user.role)) {
    if (job.status !== "draft") return res.status(409).json({ error: "Only drafts can be submitted" });
    job.status = "pending";
  } else job.status = next;
  if (next === "published" && ["admin", "system_admin"].includes(req.user.role)) {
    job.verificationStatus = "verified"; job.reviewedBy = req.user.id;
  }
  await job.save();
  await AuditLog.create({ user: req.user.id, action: "update", entityType: "Job", entityId: job._id,
    after: { status: job.status, verificationStatus: job.verificationStatus }, requestId: req.id });
  res.json({ job });
});
export const applyToJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job || job.status !== "published") return res.status(404).json({ error: "Job not found" });
  if (job.deadline && job.deadline < new Date()) return res.status(409).json({ error: "Applications closed" });
  const user = await User.findById(req.user.id);
  const exists = await JobApplication.exists({ job: job._id, applicant: req.user.id });
  if (exists) return res.status(409).json({ error: "Already applied" });

  const sop = (req.body.sop || req.body.statement || "").trim();
  const statement = (req.body.statement || req.body.sop || "").trim();

  let resume = {};
  if (req.body.resume && typeof req.body.resume === "object") {
    resume = {
      fileName: req.body.resume.fileName || req.body.resume.name || "",
      fileType: req.body.resume.fileType || req.body.resume.type || "",
      fileUrl: req.body.resume.fileUrl || req.body.resume.url || req.body.resume.dataUrl || req.body.resume.data || "",
      fileSize: Number(req.body.resume.fileSize || req.body.resume.size || 0),
    };
  } else if (typeof req.body.resume === "string" && req.body.resume.trim()) {
    resume = {
      fileName: req.body.resumeName || "Resume",
      fileUrl: req.body.resume.trim(),
      fileType: "application/octet-stream",
    };
  }

  const application = await JobApplication.create({
    job: job._id,
    applicant: req.user.id,
    statement,
    sop,
    resume,
    contactEmail: user.email,
  });
  await AuditLog.create({ user: req.user.id, action: "create", entityType: "JobApplication", entityId: application._id,
    after: { job: job._id, status: application.status }, requestId: req.id });
  await notifyUser({ recipient: req.user.id, eventKey: `application:${application._id}:submitted`, type: "job_application",
    title: job.demo ? "Demo application recorded" : "Application submitted",
    message: job.demo ? `Your simulation application for ${job.title} was recorded; it was not delivered as a real job application.` : `Your application for ${job.title} was submitted.`,
    relatedType: "JobApplication", relatedId: application._id,
    emailTemplate: "job_applied", emailData: { title: job.title, demo: job.demo } });
  const hospital = await Hospital.findById(job.hospital).select("admins").lean();
  for (const recipient of hospital?.admins || []) {
    await notifyUser({ recipient, eventKey: `application:${application._id}:received:${recipient}`,
      type: "job_application", title: "New job application", message: `${job.title} has a new application.`,
      relatedType: "JobApplication", relatedId: application._id,
      emailTemplate: "job_application_received", emailData: { title: job.title } });
  }
  res.status(201).json({ application, demo: job.demo });
});
export const myApplications = asyncHandler(async (req, res) => {
  const data = await JobApplication.find({ applicant: req.user.id }).populate({ path: "job", select: "title status hospital", populate: { path: "hospital", select: "name" } }).sort({ createdAt: -1 }).lean();
  res.json({ data });
});
export const jobApplications = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const hospital = await Hospital.findById(job.hospital);
  if (!canManageHospital(req.user, hospital)) return res.status(403).json({ error: "Not assigned to this hospital" });
  const data = await JobApplication.find({ job: job._id }).populate("applicant", "name email").sort({ createdAt: -1 }).lean();
  res.json({ data });
});
export const reviewApplication = asyncHandler(async (req, res) => {
  const application = await JobApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ error: "Application not found" });
  const job = await Job.findById(application.job);
  const hospital = await Hospital.findById(job.hospital);
  if (!canManageHospital(req.user, hospital)) return res.status(403).json({ error: "Not assigned to this hospital" });
  const previous = application.status;
  application.status = req.body.status;
  application.reviewedBy = req.user.id;
  application.reviewedAt = new Date();
  await application.save();
  await AuditLog.create({ user: req.user.id, action: "update", entityType: "JobApplication", entityId: application._id,
    before: { status: previous }, after: { status: application.status }, requestId: req.id });
  await notifyUser({ recipient: application.applicant, eventKey: `application:${application._id}:${application.status}`,
    type: "job_application", title: "Application status updated", message: `${job.title}: ${application.status}.`,
    relatedType: "JobApplication", relatedId: application._id,
    emailTemplate: "job_updated", emailData: { title: job.title, status: application.status } });
  res.json({ application });
});
