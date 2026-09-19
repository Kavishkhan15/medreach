import crypto from "crypto";
import { BloodRequest } from "../models/BloodRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendEmailEvent } from "../services/emailService.js";

function generateReference(type) {
  const prefix = type === "DONATION" ? "BDP" : "BR";
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${dateStr}-${rand}`;
}

// POST /api/blood-requests — submit a blood requisition or donation pledge (public / authenticated)
export const createBloodRequest = asyncHandler(async (req, res) => {
  const {
    type,
    providerId,
    bloodBankName,
    bloodGroup,
    patientOrDonorName,
    units,
    urgency,
    hospitalName,
    doctorNotes,
    age,
    weight,
    preferredDate,
    contactPhone,
    contactEmail,
    notes,
  } = req.body;

  if (!type || !["REQUEST", "DONATION"].includes(type)) {
    return res.status(400).json({ error: "type must be either 'REQUEST' or 'DONATION'" });
  }

  if (!bloodBankName || !bloodBankName.trim()) {
    return res.status(400).json({ error: "bloodBankName is required" });
  }

  const validBloodGroups = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
  if (!bloodGroup || !validBloodGroups.includes(bloodGroup)) {
    return res.status(400).json({
      error: `bloodGroup is required and must be one of: ${validBloodGroups.join(", ")}`,
    });
  }

  if (!patientOrDonorName || !patientOrDonorName.trim()) {
    return res.status(400).json({
      error: type === "DONATION" ? "Donor name is required" : "Patient name is required",
    });
  }

  if (!contactPhone || !contactPhone.trim()) {
    return res.status(400).json({ error: "contactPhone is required" });
  }

  const reference = generateReference(type);
  const userId = req.user?._id || req.user?.id;

  const bloodRequest = await BloodRequest.create({
    reference,
    type,
    provider: providerId || undefined,
    bloodBankName: bloodBankName.trim(),
    bloodGroup,
    patientOrDonorName: patientOrDonorName.trim(),
    units: type === "REQUEST" ? (units ? Number(units) : 1) : undefined,
    urgency: type === "REQUEST" ? (urgency || "URGENT") : undefined,
    hospitalName: type === "REQUEST" && hospitalName ? hospitalName.trim() : undefined,
    doctorNotes: type === "REQUEST" && doctorNotes ? doctorNotes.trim() : undefined,
    age: type === "DONATION" && age ? Number(age) : undefined,
    weight: type === "DONATION" && weight ? Number(weight) : undefined,
    preferredDate: type === "DONATION" && preferredDate ? new Date(preferredDate) : undefined,
    contactPhone: contactPhone.trim(),
    contactEmail: contactEmail ? contactEmail.trim().toLowerCase() : undefined,
    notes: notes ? notes.trim() : undefined,
    user: userId || undefined,
    status: "REQUESTED",
  });

  // If email provided, trigger confirmation email
  if (bloodRequest.contactEmail) {
    sendEmailEvent({
      eventKey: `blood_request_${bloodRequest.reference}`,
      to: bloodRequest.contactEmail,
      template: "blood_request_confirmation",
      data: {
        type: bloodRequest.type,
        name: bloodRequest.patientOrDonorName,
        bloodGroup: bloodRequest.bloodGroup,
        bloodBankName: bloodRequest.bloodBankName,
        reference: bloodRequest.reference,
        units: bloodRequest.units,
        urgency: bloodRequest.urgency,
        hospitalName: bloodRequest.hospitalName,
        preferredDate: bloodRequest.preferredDate ? bloodRequest.preferredDate.toDateString() : undefined,
        contactPhone: bloodRequest.contactPhone,
      },
    }).catch((err) => {
      console.warn("Failed to dispatch blood request confirmation email:", err.message);
    });
  }

  res.status(201).json({
    bloodRequest,
    reference: bloodRequest.reference,
    message: type === "DONATION"
      ? "Blood donation pledge received. The blood bank has been notified."
      : "Blood requisition request submitted successfully.",
  });
});

// GET /api/blood-requests — list blood requests (admin views all; user views own)
export const listBloodRequests = asyncHandler(async (req, res) => {
  const isAdmin = req.user && ["admin", "system_admin"].includes(req.user.role);
  const filter = {};

  if (!isAdmin) {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required to view requests" });
    }
    filter.user = userId;
  }

  const { type, status, bloodGroup } = req.query;
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (bloodGroup) filter.bloodGroup = bloodGroup;

  const requests = await BloodRequest.find(filter)
    .sort({ createdAt: -1 })
    .populate("user", "name email")
    .lean();

  res.json({ data: requests, total: requests.length });
});

// GET /api/blood-requests/:reference — fetch by tracking reference or ID
export const getBloodRequest = asyncHandler(async (req, res) => {
  const { reference } = req.params;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(reference);

  const bloodRequest = isObjectId
    ? await BloodRequest.findById(reference).populate("user", "name email").lean()
    : await BloodRequest.findOne({ reference }).populate("user", "name email").lean();

  if (!bloodRequest) {
    return res.status(404).json({ error: "Blood request not found" });
  }

  res.json({ bloodRequest });
});
