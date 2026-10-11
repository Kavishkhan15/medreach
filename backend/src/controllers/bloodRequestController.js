import { routeRequestSafely } from "../services/requestNotifications.js";
import crypto from "crypto";
import { BloodRequest } from "../models/BloodRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendEmailEvent } from "../services/emailService.js";
import { TRACKING_TOKEN_HEADER, generateTrackingToken, hashTrackingToken, trackingTokenForIdempotency, verifyTrackingToken } from "../utils/trackingToken.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { IDEMPOTENCY_REPLAY_ERROR } from "../middleware/idempotency.js";
import { runEmailBatch } from "../services/emailBatch.js";

function generateReference(type) {
  const prefix = type === "DONATION" ? "BDP" : "BR";
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${dateStr}-${rand}`;
}

// POST /api/blood-requests — submit a blood requisition or donation pledge (public / authenticated)
export const createBloodRequest = asyncHandler(async (req, res) => {
  async function replay() {
    if (!req.idempotencyKeyHash) return false;
    const previous = await BloodRequest.findOne({ idempotencyKeyHash: req.idempotencyKeyHash }).select("+trackingTokenHash");
    if (!previous) return false;
    const isOwner = previous.user && String(previous.user) === String(req.user?.id || req.user?._id);
    const token = trackingTokenForIdempotency(req.idempotencyKeyHash);
    const isGuest = !previous.user && verifyTrackingToken(token, previous.trackingTokenHash);
    if (!isOwner && !isGuest) {
      res.status(409).json({ error: IDEMPOTENCY_REPLAY_ERROR, code: "IDEMPOTENCY_KEY_REUSED" });
      return true;
    }
    res.status(200).json({ bloodRequest: previous, reference: previous.reference,
      ...(isGuest ? { trackingToken: token } : {}),
      message: "Blood request already recorded. Contact the blood bank to confirm inventory and fulfillment." });
    return true;
  }
  if (await replay()) return;
  const {
    type,
    providerId,
    bloodBankName,
    bloodGroup,
    patientOrDonorName,
    units,
    urgency,
    isUrgent,
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

  let provider;
  if (providerId) {
    provider = await ResourceProvider.findOne({ _id: providerId, kind: "blood_bank", approvalStatus: { $nin: ["pending", "rejected"] }, active: { $ne: false } });
    if (!provider) return res.status(400).json({ error: "Active blood bank provider not found" });
  }

  const effectiveBloodBankName = provider?.name || bloodBankName?.trim() || (isUrgent ? "No specific blood bank selected" : "");
  if (!effectiveBloodBankName) {
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
  const trackingToken = userId ? undefined : (trackingTokenForIdempotency(req.idempotencyKeyHash) || generateTrackingToken());

  let bloodRequest;
  try {
    bloodRequest = await BloodRequest.create({
    notificationVersion: 1,
    reference,
    type,
    provider: provider?._id,
    bloodBankName: effectiveBloodBankName,
    bloodGroup,
    patientOrDonorName: patientOrDonorName.trim(),
    units: type === "REQUEST" ? (units ? Number(units) : 1) : undefined,
    urgency: type === "REQUEST" ? (urgency || (isUrgent ? "within 6 hours" : "3 days")) : undefined,
    isUrgent: Boolean(isUrgent),
    hospitalName: type === "REQUEST" && hospitalName ? hospitalName.trim() : undefined,
    doctorNotes: type === "REQUEST" && doctorNotes ? doctorNotes.trim() : undefined,
    age: type === "DONATION" && age ? Number(age) : undefined,
    weight: type === "DONATION" && weight ? Number(weight) : undefined,
    preferredDate: type === "DONATION" && preferredDate ? new Date(preferredDate) : undefined,
    contactPhone: contactPhone.trim(),
    contactEmail: (contactEmail || req.user?.email || "").trim().toLowerCase() || undefined,
    notes: notes ? notes.trim() : undefined,
    user: userId || undefined,
    trackingTokenHash: trackingToken ? hashTrackingToken(trackingToken) : undefined,
    idempotencyKeyHash: req.idempotencyKeyHash,
    status: "REQUESTED",
    });
  } catch (error) {
    if (error?.code === 11000 && await replay()) return;
    throw error;
  }

  const effectiveEmail = bloodRequest.contactEmail;
  const emails = [];

  // 1. User confirmation email (if email provided)
  if (effectiveEmail) {
    emails.push(async () => {
      try {
        await sendEmailEvent({
          eventKey: `blood_request_user_${bloodRequest.reference}`,
          to: effectiveEmail,
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
        });
      } catch (err) {
        console.warn("Failed to dispatch blood request user confirmation email:", err.message);
      }
    });
  }

  await routeRequestSafely(bloodRequest, "BloodRequest", emails);

  res.status(201).json({
    bloodRequest,
    reference: bloodRequest.reference,
    ...(trackingToken ? { trackingToken } : {}),
    message: type === "DONATION"
      ? "Blood donation pledge recorded. Contact the blood bank to arrange the donation."
      : "Blood request recorded. Contact the blood bank to confirm inventory and fulfillment.",
  });
});

// GET /api/blood-requests — list blood requests (admin views all; user views own)
export const listBloodRequests = asyncHandler(async (req, res) => {
  const isAdmin = req.user && ["system_admin"].includes(req.user.role);
  const filter = {};

  if (!isAdmin) {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required to view requests" });
    }
    if (["provider_admin", "hospital_admin"].includes(req.user.role)) filter.provider = { $in: req.user.providerIds || [] };
    else filter.user = userId;
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
    ? await BloodRequest.findById(reference).select("+trackingTokenHash").populate("user", "name email")
    : await BloodRequest.findOne({ reference }).select("+trackingTokenHash").populate("user", "name email");

  if (!bloodRequest) {
    return res.status(404).json({ error: "Blood request not found" });
  }

  const userId = req.user?._id || req.user?.id;
  const requestOwnerId = bloodRequest.user?._id || bloodRequest.user;
  const isOwner = Boolean(userId && requestOwnerId && String(userId) === String(requestOwnerId));
  const isAdmin = Boolean(req.user && ["system_admin"].includes(req.user.role));
  const hasGuestToken = !bloodRequest.user
    && verifyTrackingToken(req.get(TRACKING_TOKEN_HEADER), bloodRequest.trackingTokenHash);
  const isProvider = Boolean(req.user?.providerIds?.includes(String(bloodRequest.provider)));
  if (!isOwner && !isAdmin && !isProvider && !hasGuestToken) {
    return res.status(403).json({ error: "Access denied" });
  }

  res.json({ bloodRequest });
});
