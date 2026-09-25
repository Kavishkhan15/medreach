import { randomBytes } from "node:crypto";
import { ResourceProvider, RESOURCE_KINDS } from "../models/ResourceProvider.js";
import { AuditLog } from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendEmailEvent, SYSTEM_NOTIFICATION_EMAIL } from "../services/emailService.js";

export const listResources = (kind) => asyncHandler(async (req, res) => {
  const filter = { kind, active: { $ne: false } };
  if (req.query.q) filter.$or = ["name", "locality", "services", "coverageArea"].map((field) => ({ [field]: { $regex: String(req.query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }));
  if (req.query.locality) filter.locality = { $regex: String(req.query.locality).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (req.query.service) filter.services = String(req.query.service).slice(0, 80);
  if (req.query.bloodGroup && kind === "blood_bank") filter.listedBloodGroups = String(req.query.bloodGroup).slice(0, 10);
  const data = await ResourceProvider.find(filter).sort({ verificationStatus: 1, name: 1 }).limit(100).lean();
  res.json({ data, currentInventory: "unknown", liveDispatch: false });
});
export const getResource = (kind) => asyncHandler(async (req, res) => {
  const data = await ResourceProvider.findOne({ _id: req.params.id, kind, active: { $ne: false } }).lean();
  if (!data) return res.status(404).json({ error: "Provider not found" });
  res.json({ data, currentInventory: "unknown", liveDispatch: false });
});
export const createResource = asyncHandler(async (req, res) => {
  if (!RESOURCE_KINDS.includes(req.body.kind)) return res.status(400).json({ error: "Invalid provider type" });
  const allowed = ["kind", "name", "hospital", "address", "locality", "city", "phone", "website", "operatingHours", "services", "listedBloodGroups", "providerType", "coverageArea", "location", "sourceName", "sourceUrl", "observedAt", "confidence", "verificationStatus", "demo"];
  const data = Object.fromEntries(allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  const provider = await ResourceProvider.create(data);
  await AuditLog.create({ user: req.user.id, action: "create", entityType: "ResourceProvider", entityId: provider._id,
    after: { kind: provider.kind, name: provider.name, verificationStatus: provider.verificationStatus }, requestId: req.id });
  res.status(201).json({ data: provider });
});
export const updateResource = asyncHandler(async (req, res) => {
  const allowed = ["name", "hospital", "address", "locality", "city", "phone", "website", "operatingHours", "services", "listedBloodGroups", "providerType", "coverageArea", "location", "sourceName", "sourceUrl", "observedAt", "confidence", "verificationStatus"];
  const patch = Object.fromEntries(allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  const provider = await ResourceProvider.findById(req.params.id);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  const before = { name: provider.name, verificationStatus: provider.verificationStatus };
  Object.assign(provider, patch); await provider.save();
  await AuditLog.create({ user: req.user.id, action: "update", entityType: "ResourceProvider", entityId: provider._id,
    before, after: { name: provider.name, verificationStatus: provider.verificationStatus }, requestId: req.id });
  res.json({ data: provider });
});

export const bookAmbulance = asyncHandler(async (req, res) => {
  const {
    providerId,
    providerName,
    patientName,
    patientAge,
    ambulanceRequired,
    bookingPickup,
    bookingDetails,
    contactEmail,
    contactPhone,
  } = req.body;

  if (!patientName || !patientName.trim()) {
    return res.status(400).json({ error: "Patient Name is required" });
  }
  if (!patientAge || isNaN(patientAge) || Number(patientAge) <= 0) {
    return res.status(400).json({ error: "Valid Patient Age is required" });
  }

  let provider = null;
  if (providerId) {
    provider = await ResourceProvider.findById(providerId).lean().catch(() => null);
  }

  const effectiveProviderName = provider?.name || providerName || "Mumbai Ambulance Service";
  const effectiveProviderPhone = provider?.phone || "108 / 112";
  const userEmail = (contactEmail || req.user?.email || "").trim().toLowerCase();
  const reference = `AMB-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;

  const bookingData = {
    reference,
    providerName: effectiveProviderName,
    providerPhone: effectiveProviderPhone,
    patientName: patientName.trim(),
    patientAge: Number(patientAge),
    ambulanceRequired: ambulanceRequired !== false,
    pickupAddress: (bookingPickup || "").trim() || "Not specified",
    contactEmail: userEmail || undefined,
    contactPhone: (contactPhone || "").trim() || undefined,
    notes: (bookingDetails || "").trim() || undefined,
  };

  // 1. User confirmation email (if email provided)
  if (userEmail) {
    try {
      await sendEmailEvent({
        eventKey: `ambulance_booking_user_${reference}`,
        to: userEmail,
        template: "ambulance_booking_confirmation",
        data: bookingData,
      });
    } catch (err) {
      console.warn("Failed to dispatch ambulance booking user confirmation email:", err.message);
    }
  }

  // 2. MedReach admin notification to medreachforyou@gmail.com
  try {
    await sendEmailEvent({
      eventKey: `ambulance_booking_admin_${reference}`,
      to: SYSTEM_NOTIFICATION_EMAIL,
      template: "ambulance_booking_admin_notification",
      data: bookingData,
    });
  } catch (err) {
    console.warn("Failed to dispatch ambulance booking admin notification email:", err.message);
  }

  res.status(201).json({
    success: true,
    reference,
    message: "Ambulance booking request submitted successfully. Response team and provider notified.",
    booking: bookingData,
  });
});

