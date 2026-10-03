import { OrganizationApplication } from "../models/OrganizationApplication.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { AuditLog } from "../models/AuditLog.js";
import { User } from "../models/User.js";
import { canManageHospital } from "../services/hospitalAccess.js";
import { sendUserEmailSafely } from "../services/userEmailService.js";
import { runEmailBatch } from "../services/emailBatch.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { IDEMPOTENCY_REPLAY_ERROR } from "../middleware/idempotency.js";
import { careerSubmission, createCareerApplication } from "../utils/careerReference.js";

export const listOrganizationsForCareers = asyncHandler(async (req, res) => {
  const q = req.query.q ? String(req.query.q) : "";
  const typeFilter = req.query.type ? String(req.query.type) : null;

  let query = {};
  if (q) {
    const escaped = q
      .slice(0, 80)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { locality: { $regex: escaped, $options: "i" } },
      { city: { $regex: escaped, $options: "i" } },
    ];
  }

  let hospitals = [];
  if (!typeFilter || typeFilter === "hospital") {
    hospitals = await Hospital.find(query)
      .select("name slug locality city address phone website hospitalType verificationStatus specialties departments operatingHours")
      .lean();
    
    hospitals = hospitals.map(h => ({
      ...h,
      type: "hospital"
    }));
  }

  let providers = [];
  if (!typeFilter || ["blood_bank", "diagnostic", "ambulance"].includes(typeFilter)) {
    let providerQuery = { active: { $ne: false }, ...query };
    if (typeFilter) {
      providerQuery.kind = typeFilter;
    }
    
    providers = await ResourceProvider.find(providerQuery)
      .select("name kind locality city address phone website providerType verificationStatus services operatingHours")
      .lean();
      
    providers = providers.map(p => ({
      ...p,
      type: p.kind
    }));
  }

  const bloodBanks = providers.filter(p => p.type === "blood_bank");
  const diagnostics = providers.filter(p => p.type === "diagnostic");
  const ambulances = providers.filter(p => p.type === "ambulance");

  const data = [...hospitals, ...providers];

  res.json({
    hospitals,
    bloodBanks,
    diagnostics,
    ambulances,
    data,
    totalOrganizations: data.length,
    hospitalCount: hospitals.length,
    bloodBankCount: bloodBanks.length,
    diagnosticCount: diagnostics.length,
    ambulanceCount: ambulances.length,
    stats: {
      totalOrganizations: data.length,
      hospitalCount: hospitals.length,
      bloodBankCount: bloodBanks.length,
      diagnosticCount: diagnostics.length,
      ambulanceCount: ambulances.length,
    },
  });
});

export const applyToOrganization = asyncHandler(async (req, res) => {
  if (req.idempotencyKeyHash) {
    const previous = await OrganizationApplication.findOne({ idempotencyKeyHash: req.idempotencyKeyHash });
    if (previous) return String(previous.applicant) === String(req.user.id)
      ? res.status(200).json({ application: await careerSubmission(previous) })
      : res.status(409).json({ error: IDEMPOTENCY_REPLAY_ERROR, code: "IDEMPOTENCY_KEY_REUSED" });
  }
  const { id } = req.params;
  const {
    organizationType,
    roleInterested,
    candidateName,
    contactEmail,
    contactPhone,
    qualifications,
    experienceYears,
    sop,
    statement,
    resume
  } = req.body;

  let organization;
  if (organizationType === "hospital") {
    organization = await Hospital.findById(id);
  } else if (["blood_bank", "diagnostic", "ambulance"].includes(organizationType)) {
    organization = await ResourceProvider.findById(id);
    if (organization && (organization.kind !== organizationType || organization.active === false)) {
      return res.status(400).json({ error: "Organization does not match the selected type" });
    }
  }

  if (!organization) {
    return res.status(404).json({ error: "Organization not found" });
  }

  const duplicateFilter = { applicant: req.user.id };
  if (organizationType === "hospital") {
    duplicateFilter.hospital = id;
  } else {
    duplicateFilter.provider = id;
  }
  const exists = await OrganizationApplication.exists(duplicateFilter);

  if (exists) {
    return res.status(409).json({ error: "Already applied to this organization" });
  }

  const applicationData = {
    applicant: req.user.id,
    organizationType,
    roleInterested,
    candidateName,
    contactEmail,
    candidatePhone: contactPhone,
    qualifications,
    experienceYears: experienceYears !== undefined && !isNaN(Number(experienceYears)) ? Number(experienceYears) : undefined,
    sop: (sop || statement || "").trim(),
    statement: (statement || sop || "").trim(),
    idempotencyKeyHash: req.idempotencyKeyHash,
  };

  if (organizationType === "hospital") {
    applicationData.hospital = id;
  } else {
    applicationData.provider = id;
  }

  if (resume && typeof resume === "object") {
    applicationData.resume = {
      fileName: resume.fileName || resume.name || "",
      fileType: resume.fileType || resume.type || "",
      fileUrl: resume.fileUrl || resume.url || resume.dataUrl || resume.data || "",
      fileSize: Number(resume.fileSize || resume.size || 0),
    };
  } else if (typeof resume === "string" && resume.trim()) {
    applicationData.resume = {
      fileName: "Resume",
      fileUrl: resume.trim(),
      fileType: "application/octet-stream",
    };
  }

  let application;
  try {
    application = await createCareerApplication(OrganizationApplication, applicationData);
  } catch (error) {
    if (error?.code === 11000) {
      const previous = await OrganizationApplication.findOne(duplicateFilter);
      if (previous) return res.status(200).json({ application: await careerSubmission(previous) });
    }
    throw error;
  }

  try { await AuditLog.create({
    user: req.user.id,
    action: "create",
    entityType: "OrganizationApplication",
    entityId: application._id,
    after: { organizationType, hospital: applicationData.hospital, provider: applicationData.provider },
    requestId: req.id,
  }); } catch (error) { console.warn("Organization application recorded but audit logging failed:", error.message); }

  const emails = [() => sendUserEmailSafely({
    recipient: req.user.id,
    eventKey: `org_application:${application._id}:submitted`,
    emailTemplate: "org_applied",
    emailData: { organizationName: organization.name, reference: application.reference },
  })];

  if (organizationType === "hospital" && organization.admins && organization.admins.length > 0) {
    for (const adminId of organization.admins) {
      emails.push(() => sendUserEmailSafely({
        recipient: adminId,
        eventKey: `org_application:${application._id}:received:${adminId}`,
        emailTemplate: "org_application_received",
        emailData: { organizationName: organization.name },
      }));
    }
  }
  await runEmailBatch(emails);
  res.status(201).json({ application: await careerSubmission(application) });
});

export const organizationApplications = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hospital = await Hospital.findById(id);
  const provider = !hospital ? await ResourceProvider.findById(id) : null;

  if (hospital) {
    if (!canManageHospital(req.user, hospital)) {
      return res.status(403).json({ error: "Not assigned to this hospital" });
    }
  } else if (provider) {
    if (!["admin", "system_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Not authorized to view these applications" });
    }
  } else {
    return res.status(404).json({ error: "Organization not found" });
  }

  const filter = hospital ? { hospital: id } : { provider: id };
  const data = await OrganizationApplication.find(filter)
    .populate("applicant", "name email")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ data });
});

export const reviewOrganizationApplication = asyncHandler(async (req, res) => {
  const application = await OrganizationApplication.findById(req.params.id);
  if (!application) {
    return res.status(404).json({ error: "Application not found" });
  }

  let organization;
  if (application.organizationType === "hospital") {
    organization = await Hospital.findById(application.hospital);
    if (!organization) return res.status(404).json({ error: "Organization not found" });
    if (!canManageHospital(req.user, organization)) {
      return res.status(403).json({ error: "Not assigned to this hospital" });
    }
  } else {
    organization = await ResourceProvider.findById(application.provider);
    if (!organization) return res.status(404).json({ error: "Organization not found" });
    if (!["admin", "system_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Not authorized to review this application" });
    }
  }

  const previous = application.status;
  application.status = req.body.status;
  application.reviewedBy = req.user.id;
  application.reviewedAt = new Date();
  await application.save();

  await AuditLog.create({
    user: req.user.id,
    action: "update",
    entityType: "OrganizationApplication",
    entityId: application._id,
    before: { status: previous },
    after: { status: application.status },
    requestId: req.id,
  });

  await sendUserEmailSafely({
    recipient: application.applicant,
    eventKey: `org_application:${application._id}:${application.status}`,
    emailTemplate: "org_application_updated",
    emailData: { organizationName: organization.name, status: application.status },
  });

  res.json({ application });
});
