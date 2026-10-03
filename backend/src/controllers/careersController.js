import { Job } from "../models/Job.js";
import { JobApplication } from "../models/JobApplication.js";
import { OrganizationApplication } from "../models/OrganizationApplication.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { AuditLog } from "../models/AuditLog.js";
import { User } from "../models/User.js";
import { canManageHospital } from "../services/hospitalAccess.js";
import { sendUserEmailSafely } from "../services/userEmailService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { IDEMPOTENCY_REPLAY_ERROR } from "../middleware/idempotency.js";
import { careerSubmission, createCareerApplication } from "../utils/careerReference.js";

const jobFields = [
  "hospital",
  "provider",
  "organizationType",
  "organizationName",
  "title",
  "category",
  "department",
  "description",
  "requirements",
  "employmentType",
  "location",
  "salaryText",
  "deadline",
];

const patchFrom = (body) =>
  Object.fromEntries(
    jobFields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])
  );

export const listJobs = asyncHandler(async (req, res) => {
  if (req.query.grouped === "true") {
    return listOrganizationsWithJobs(req, res);
  }

  const filter = { status: "published" };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.organizationType) filter.organizationType = req.query.organizationType;

  if (req.query.q) {
    const escaped = String(req.query.q)
      .slice(0, 80)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { title: { $regex: escaped, $options: "i" } },
      { department: { $regex: escaped, $options: "i" } },
      { organizationName: { $regex: escaped, $options: "i" } },
      { location: { $regex: escaped, $options: "i" } },
    ];
  }

  const data = await Job.find(filter)
    .populate("hospital", "name slug locality city address phone hospitalType verificationStatus")
    .populate("provider", "name kind locality city address phone providerType verificationStatus")
    .sort({ createdAt: -1 })
    .limit(150)
    .lean();

  res.json({ data });
});

export const listOrganizationsWithJobs = asyncHandler(async (req, res) => {
  const filter = { status: "published" };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.organizationType) filter.organizationType = req.query.organizationType;

  if (req.query.q) {
    const escaped = String(req.query.q)
      .slice(0, 80)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { title: { $regex: escaped, $options: "i" } },
      { department: { $regex: escaped, $options: "i" } },
      { organizationName: { $regex: escaped, $options: "i" } },
      { location: { $regex: escaped, $options: "i" } },
    ];
  }

  const jobs = await Job.find(filter)
    .populate("hospital", "name slug locality city address phone website hospitalType verificationStatus")
    .populate("provider", "name kind locality city address phone website providerType verificationStatus")
    .sort({ createdAt: -1 })
    .lean();

  const orgMap = new Map();

  for (const job of jobs) {
    const orgKey = job.hospital
      ? `hospital:${job.hospital._id}`
      : job.provider
      ? `provider:${job.provider._id}`
      : `custom:${job.organizationName || job._id}`;

    if (!orgMap.has(orgKey)) {
      let meta = {};
      if (job.hospital) {
        meta = {
          id: job.hospital._id,
          name: job.hospital.name,
          slug: job.hospital.slug,
          type: "hospital",
          organizationType: "hospital",
          locality: job.hospital.locality,
          city: job.hospital.city || "Mumbai",
          address: job.hospital.address,
          phone: job.hospital.phone,
          website: job.hospital.website,
          verificationStatus: job.hospital.verificationStatus || "unverified",
        };
      } else if (job.provider) {
        meta = {
          id: job.provider._id,
          name: job.provider.name,
          type: job.provider.kind || "other",
          organizationType: job.provider.kind || "other",
          locality: job.provider.locality,
          city: job.provider.city || "Mumbai",
          address: job.provider.address,
          phone: job.provider.phone,
          website: job.provider.website,
          verificationStatus: job.provider.verificationStatus || "unverified",
        };
      } else {
        meta = {
          id: null,
          name: job.organizationName || "Healthcare Provider",
          type: job.organizationType || "other",
          organizationType: job.organizationType || "other",
          locality: job.location || "Mumbai",
          city: "Mumbai",
          verificationStatus: "unverified",
        };
      }
      orgMap.set(orgKey, { ...meta, jobs: [], jobCount: 0 });
    }

    const entry = orgMap.get(orgKey);
    entry.jobs.push(job);
    entry.jobCount = entry.jobs.length;
  }

  const data = Array.from(orgMap.values());
  res.json({ data, organizations: data, totalOrganizations: data.length, totalJobs: jobs.length });
});

export const getJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id)
    .populate("hospital", "name slug locality city address phone website hospitalType")
    .populate("provider", "name kind locality city address phone website providerType")
    .lean();

  if (!job || job.status !== "published") {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json({ job });
});

export const manageJobs = asyncHandler(async (req, res) => {
  const filter = {};
  if (!["admin", "system_admin"].includes(req.user.role)) {
    const ids = await Hospital.find({ admins: req.user.id }).distinct("_id");
    filter.hospital = { $in: ids };
  }

  const data = await Job.find(filter)
    .populate("hospital", "name slug")
    .populate("provider", "name kind")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json({ data });
});

export const createJob = asyncHandler(async (req, res) => {
  const payload = patchFrom(req.body);

  if (req.body.hospital) {
    const hospital = await Hospital.findById(req.body.hospital);
    if (!hospital) return res.status(404).json({ error: "Hospital not found" });
    if (!canManageHospital(req.user, hospital)) {
      return res.status(403).json({ error: "Not assigned to this hospital" });
    }
    payload.hospital = hospital._id;
    payload.organizationType = "hospital";
    payload.organizationName = hospital.name;
  } else if (req.body.provider) {
    if (!["admin", "system_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Only administrators can manage standalone provider careers" });
    }
    const provider = await ResourceProvider.findById(req.body.provider);
    if (!provider) return res.status(404).json({ error: "Resource provider not found" });
    payload.provider = provider._id;
    payload.organizationType = provider.kind || "other";
    payload.organizationName = provider.name;
  } else {
    return res.status(400).json({ error: "Either hospital or provider ID is required" });
  }

  const job = await Job.create({ ...payload, createdBy: req.user.id, status: "draft" });

  await AuditLog.create({
    user: req.user.id,
    action: "create",
    entityType: "Job",
    entityId: job._id,
    after: { hospital: payload.hospital, provider: payload.provider, status: job.status },
    requestId: req.id,
  });

  res.status(201).json({ job });
});

export const updateJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  if (job.hospital) {
    const hospital = await Hospital.findById(job.hospital);
    if (!canManageHospital(req.user, hospital)) {
      return res.status(403).json({ error: "Not assigned to this hospital" });
    }
  } else if (!["admin", "system_admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Not authorized to update this job" });
  }

  const before = { title: job.title, status: job.status };
  Object.assign(job, { ...patchFrom(req.body), hospital: job.hospital, provider: job.provider });

  if (
    !["admin", "system_admin"].includes(req.user.role) &&
    ["published", "closed", "rejected"].includes(before.status)
  ) {
    job.status = "pending";
    job.verificationStatus = "unverified";
    job.reviewedBy = undefined;
  }

  await job.save();

  await AuditLog.create({
    user: req.user.id,
    action: "update",
    entityType: "Job",
    entityId: job._id,
    before,
    after: { title: job.title, status: job.status },
    requestId: req.id,
  });

  res.json({ job });
});

export const setJobStatus = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  if (job.hospital) {
    const hospital = await Hospital.findById(job.hospital);
    if (!canManageHospital(req.user, hospital)) {
      return res.status(403).json({ error: "Not assigned to this hospital" });
    }
  } else if (!["admin", "system_admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Not authorized to modify this job" });
  }

  const next = req.body.status;

  if (
    next === "published" &&
    ["admin", "system_admin"].includes(req.user.role) &&
    !["pending", "draft"].includes(job.status)
  ) {
    return res.status(409).json({ error: "Only a draft or pending listing can be published" });
  }

  if (next === "published" && !["admin", "system_admin"].includes(req.user.role)) {
    if (job.status !== "draft") return res.status(409).json({ error: "Only drafts can be submitted" });
    job.status = "pending";
  } else {
    job.status = next;
  }

  if (next === "published" && ["admin", "system_admin"].includes(req.user.role)) {
    job.verificationStatus = "verified";
    job.reviewedBy = req.user.id;
  }

  await job.save();

  await AuditLog.create({
    user: req.user.id,
    action: "update",
    entityType: "Job",
    entityId: job._id,
    after: { status: job.status, verificationStatus: job.verificationStatus },
    requestId: req.id,
  });

  res.json({ job });
});

export const applyToJob = asyncHandler(async (req, res) => {
  if (req.idempotencyKeyHash) {
    const previous = await JobApplication.findOne({ idempotencyKeyHash: req.idempotencyKeyHash });
    if (previous) return String(previous.applicant) === String(req.user.id)
      ? res.status(200).json({ application: await careerSubmission(previous) })
      : res.status(409).json({ error: IDEMPOTENCY_REPLAY_ERROR, code: "IDEMPOTENCY_KEY_REUSED" });
  }
  const job = await Job.findById(req.params.id);
  if (!job || job.status !== "published") return res.status(404).json({ error: "Job not found" });
  if (job.deadline && job.deadline < new Date()) {
    return res.status(409).json({ error: "Applications closed" });
  }

  const user = await User.findById(req.user.id);
  const exists = await JobApplication.exists({ job: job._id, applicant: req.user.id });
  if (exists) return res.status(409).json({ error: "Already applied" });

  const sop = (req.body.sop || req.body.statement || "").trim();
  const statement = (req.body.statement || req.body.sop || "").trim();
  const candidateName = (req.body.candidateName || req.body.name || user?.name || "").trim();
  const candidatePhone = (req.body.contactPhone || req.body.candidatePhone || req.body.phone || user?.emergencyContact || user?.phone || "").trim();
  const qualifications = (req.body.qualifications || req.body.qualification || "").trim();
  const experienceYears =
    req.body.experienceYears !== undefined && !isNaN(Number(req.body.experienceYears))
      ? Number(req.body.experienceYears)
      : req.body.experience !== undefined && !isNaN(Number(req.body.experience))
      ? Number(req.body.experience)
      : undefined;
  const currentOrganization = (req.body.currentOrganization || "").trim();
  const contactEmail = (req.body.contactEmail || req.body.email || user?.email || "").trim().toLowerCase();

  let resume = {};
  if (req.body.resume && typeof req.body.resume === "object") {
    resume = {
      fileName: req.body.resume.fileName || req.body.resume.name || "",
      fileType: req.body.resume.fileType || req.body.resume.type || "",
      fileUrl:
        req.body.resume.fileUrl ||
        req.body.resume.url ||
        req.body.resume.dataUrl ||
        req.body.resume.data ||
        "",
      fileSize: Number(req.body.resume.fileSize || req.body.resume.size || 0),
    };
  } else if (typeof req.body.resume === "string" && req.body.resume.trim()) {
    resume = {
      fileName: req.body.resumeName || "Resume",
      fileUrl: req.body.resume.trim(),
      fileType: "application/octet-stream",
    };
  }

  let application;
  try {
    application = await createCareerApplication(JobApplication, {
    job: job._id,
    applicant: req.user.id,
    candidateName,
    candidatePhone,
    qualifications,
    experienceYears,
    currentOrganization,
    statement,
    sop,
    resume,
    contactEmail,
    idempotencyKeyHash: req.idempotencyKeyHash,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const previous = await JobApplication.findOne({ job: job._id, applicant: req.user.id });
      if (previous) return res.status(200).json({ application: await careerSubmission(previous), demo: job.demo });
    }
    throw error;
  }

  try { await AuditLog.create({
    user: req.user.id,
    action: "create",
    entityType: "JobApplication",
    entityId: application._id,
    after: { job: job._id, status: application.status },
    requestId: req.id,
  }); } catch (error) { console.warn("Job application recorded but audit logging failed:", error.message); }

  await sendUserEmailSafely({
    recipient: req.user.id,
    eventKey: `application:${application._id}:submitted`,
    emailTemplate: "job_applied",
    emailData: { title: job.title, demo: job.demo },
  });

  if (job.hospital) {
    const hospital = await Hospital.findById(job.hospital).select("admins").lean();
    for (const recipient of hospital?.admins || []) {
      await sendUserEmailSafely({
        recipient,
        eventKey: `application:${application._id}:received:${recipient}`,
        emailTemplate: "job_application_received",
        emailData: { title: job.title },
      });
    }
  }

  res.status(201).json({ application: await careerSubmission(application), demo: job.demo });
});

export const myApplications = asyncHandler(async (req, res) => {
  const jobs = await JobApplication.find({ applicant: req.user.id })
    .populate({
      path: "job",
      select: "title status hospital provider organizationName organizationType location",
      populate: [
        { path: "hospital", select: "name slug locality" },
        { path: "provider", select: "name kind locality" },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();

  const organizations = await OrganizationApplication.find({ applicant: req.user.id })
    .populate("hospital", "name slug locality")
    .populate("provider", "name kind locality")
    .sort({ createdAt: -1 })
    .lean();
  const data = [
    ...jobs.map((application) => ({ ...application, applicationType: "job" })),
    ...organizations.map((application) => ({ ...application, applicationType: "organization" })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ data });
});

export const jobApplications = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  if (job.hospital) {
    const hospital = await Hospital.findById(job.hospital);
    if (!canManageHospital(req.user, hospital)) {
      return res.status(403).json({ error: "Not assigned to this hospital" });
    }
  } else if (!["admin", "system_admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Not authorized to view these applications" });
  }

  const data = await JobApplication.find({ job: job._id })
    .populate("applicant", "name email emergencyContact phone")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ data });
});

export const reviewApplication = asyncHandler(async (req, res) => {
  const application = await JobApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ error: "Application not found" });

  const job = await Job.findById(application.job);
  if (job.hospital) {
    const hospital = await Hospital.findById(job.hospital);
    if (!canManageHospital(req.user, hospital)) {
      return res.status(403).json({ error: "Not assigned to this hospital" });
    }
  } else if (!["admin", "system_admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Not authorized to review this application" });
  }

  const previous = application.status;
  application.status = req.body.status;
  application.reviewedBy = req.user.id;
  application.reviewedAt = new Date();
  await application.save();

  await AuditLog.create({
    user: req.user.id,
    action: "update",
    entityType: "JobApplication",
    entityId: application._id,
    before: { status: previous },
    after: { status: application.status },
    requestId: req.id,
  });

  await sendUserEmailSafely({
    recipient: application.applicant,
    eventKey: `application:${application._id}:${application.status}`,
    emailTemplate: "job_updated",
    emailData: { title: job.title, status: application.status },
  });

  res.json({ application });
});
