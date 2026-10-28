import { archivedHospitalIds, organizationIsAvailable, archiveProviderOrganization } from "../services/providerLifecycle.js";
import { routeRequestSafely } from "../services/requestNotifications.js";
import { canManageResource } from "../services/providerAccess.js";
import { randomBytes } from "node:crypto";
import { ResourceProvider, RESOURCE_KINDS } from "../models/ResourceProvider.js";
import { AmbulanceBooking, DELIVERY_STATES } from "../models/AmbulanceBooking.js";
import { AuditLog } from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  generateTrackingToken,
  hashTrackingToken,
  trackingTokenForIdempotency,
  verifyTrackingToken,
  TRACKING_TOKEN_HEADER,
} from "../utils/trackingToken.js";
import { sendEmailEvent } from "../services/emailService.js";
import { IDEMPOTENCY_REPLAY_ERROR } from "../middleware/idempotency.js";

export const listResources = (kind) => asyncHandler(async (req, res) => {
  const filter = { kind, archivedAt: null, hospital: { $nin: await archivedHospitalIds() }, approvalStatus: { $nin: ["pending", "rejected"] }, active: { $ne: false } };
  if (req.query.q) filter.$or = ["name", "locality", "services", "coverageArea"].map((field) => ({ [field]: { $regex: String(req.query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }));
  if (req.query.locality) filter.locality = { $regex: String(req.query.locality).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (req.query.service) filter.services = String(req.query.service).slice(0, 80);
  if (req.query.bloodGroup && kind === "blood_bank") filter.listedBloodGroups = String(req.query.bloodGroup).slice(0, 10);
  const data = await ResourceProvider.find(filter).select("-email").sort({ verificationStatus: 1, name: 1 }).limit(100).lean();
  res.json({ data, currentInventory: "unknown", liveDispatch: false });
});
export const getResource = (kind) => asyncHandler(async (req, res) => {
  const data = await ResourceProvider.findOne({ _id: req.params.id, kind, archivedAt: null, hospital: { $nin: await archivedHospitalIds() }, approvalStatus: { $nin: ["pending", "rejected"] }, active: { $ne: false } }).select("-email").lean();
  if (!data) return res.status(404).json({ error: "Provider not found" });
  res.json({ data, currentInventory: "unknown", liveDispatch: false });
});
export const createResource = asyncHandler(async (req, res) => {
  if (!RESOURCE_KINDS.includes(req.body.kind)) return res.status(400).json({ error: "Invalid provider type" });
  const allowed = ["kind", "name", "hospital", "address", "locality", "city", "phone", "email", "website", "operatingHours", "services", "listedBloodGroups", "providerType", "coverageArea", "location", "sourceName", "sourceUrl", "observedAt", "confidence", "verificationStatus", "demo"];
  const data = Object.fromEntries(allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  const provider = await ResourceProvider.create({ ...data, approvalStatus: "pending" });
  await AuditLog.create({ user: req.user.id, action: "create", entityType: "ResourceProvider", entityId: provider._id,
    after: { kind: provider.kind, name: provider.name, verificationStatus: provider.verificationStatus }, requestId: req.id });
  res.status(201).json({ data: provider });
});
export const updateResource = asyncHandler(async (req, res) => {
  const allowed = req.user.role === "system_admin" ? ["name", "hospital", "address", "locality", "city", "phone", "email", "website", "operatingHours", "services", "listedBloodGroups", "providerType", "coverageArea", "location", "sourceName", "sourceUrl", "observedAt", "confidence", "verificationStatus"] : ["address", "locality", "phone", "email", "website", "operatingHours"];
  const patch = Object.fromEntries(allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  const provider = await ResourceProvider.findById(req.params.id);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  if (!canManageResource(req.user, provider)) return res.status(403).json({ error: "Not assigned to this provider" });
  const before = { name: provider.name, verificationStatus: provider.verificationStatus };
  Object.assign(provider, patch); await provider.save();
  await AuditLog.create({ user: req.user.id, action: "update", entityType: "ResourceProvider", entityId: provider._id,
    before, after: { name: provider.name, verificationStatus: provider.verificationStatus }, requestId: req.id });
  res.json({ data: provider });
});

function publicBooking(booking) {
  const result = typeof booking.toObject === "function" ? booking.toObject() : { ...booking };
  delete result.trackingTokenHash;
  if (result.providerSnapshot) delete result.providerSnapshot.email;
  return result;
}

function deliverySummary(delivery) {
  return Object.fromEntries(Object.entries(delivery).map(([recipient, state]) => {
    const value = typeof state?.toObject === "function" ? state.toObject() : state;
    return [recipient, {
      status: value.status,
      attempted: Boolean(value.attempted),
      sent: value.status === "sent",
      ...(value.errorCode ? { errorCode: value.errorCode } : {}),
    }];
  }));
}

async function sendBookingEmail(booking, recipient, event) {
  let result;
  try {
    result = await sendEmailEvent({
      ...event,
      source: { model: "AmbulanceBooking", id: booking._id, channel: recipient },
    });
  } catch (error) {
    result = { status: "failed", errorCode: error?.code || "EMAIL_DELIVERY_FAILED" };
  }

  const status = DELIVERY_STATES.includes(result?.status) ? result.status : "failed";
  const now = new Date();
  booking.delivery[recipient].status = status;
  booking.delivery[recipient].attempted = true;
  booking.delivery[recipient].attemptedAt = now;
  booking.delivery[recipient].sentAt = status === "sent" ? (result.sentAt || now) : undefined;
  booking.delivery[recipient].errorCode = result?.errorCode;
  booking.delivery[recipient].emailDelivery = result?._id;
  await booking.save();
}

export const bookAmbulance = asyncHandler(async (req, res) => {
  async function replay() {
    if (!req.idempotencyKeyHash) return false;
    const previous = await AmbulanceBooking.findOne({ idempotencyKeyHash: req.idempotencyKeyHash })
      .select("+trackingTokenHash");
    if (!previous) return false;
    const isOwner = previous.user && String(previous.user) === String(req.user?.id);
    const token = trackingTokenForIdempotency(req.idempotencyKeyHash);
    const isGuest = !previous.user && verifyTrackingToken(token, previous.trackingTokenHash);
    if (!isOwner && !isGuest) {
      res.status(409).json({ error: IDEMPOTENCY_REPLAY_ERROR, code: "IDEMPOTENCY_KEY_REUSED" });
      return true;
    }
    res.status(200).json({ success: true, recorded: true, reference: previous.reference,
      message: "Ambulance booking request already recorded.",
      booking: publicBooking(previous), delivery: deliverySummary(previous.delivery),
      ...(isGuest ? { trackingToken: token } : {}) });
    return true;
  }
  if (await replay()) return;
  const {
    providerId,
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

  const provider = providerId
    ? await ResourceProvider.findOne({ _id: providerId, kind: "ambulance", approvalStatus: { $nin: ["pending", "rejected"] }, active: { $ne: false } })
      .select("+email")
      .lean()
    : null;
  if (!provider || !await organizationIsAvailable("ambulance", provider._id)) return res.status(404).json({ error: "Active ambulance provider not found" });

  const userEmail = (contactEmail || req.user?.email || "").trim().toLowerCase();
  const reference = `AMB-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const trackingToken = trackingTokenForIdempotency(req.idempotencyKeyHash) || generateTrackingToken();

  const bookingData = {
    reference,
    providerName: provider.name,
    providerPhone: provider.phone,
    patientName: patientName.trim(),
    patientAge: Number(patientAge),
    ambulanceRequired: ambulanceRequired !== false,
    pickupAddress: (bookingPickup || "").trim() || "Not specified",
    contactEmail: userEmail || undefined,
    contactPhone: (contactPhone || "").trim() || undefined,
    notes: (bookingDetails || "").trim() || undefined,
  };

  let booking;
  try {
    booking = await AmbulanceBooking.create({
    coordinationVersion: 1,
    notificationVersion: 1,
    isEmergency: req.body.isEmergency === true,
    reference,
    provider: provider._id,
    user: req.user?.id || undefined,
    providerSnapshot: {
      name: provider.name,
      phone: provider.phone,
      email: provider.email,
    },
    requestSnapshot: {
      patientName: bookingData.patientName,
      patientAge: bookingData.patientAge,
      ambulanceRequired: bookingData.ambulanceRequired,
      pickupAddress: bookingData.pickupAddress,
      contactEmail: bookingData.contactEmail,
      contactPhone: bookingData.contactPhone,
      notes: bookingData.notes,
    },
    status: "RECORDED",
    delivery: {
      user: { status: userEmail ? "pending" : "not_available" },
      admin: { status: req.body.isEmergency === true ? "pending" : "not_available" },
      provider: { status: "pending" },
    },
    trackingTokenHash: hashTrackingToken(trackingToken),
    idempotencyKeyHash: req.idempotencyKeyHash,
    });
  } catch (error) {
    if (error?.code === 11000 && await replay()) return;
    throw error;
  }

  async function deliver(recipient, event) {
    try { await sendBookingEmail(booking, recipient, event); }
    catch (error) { console.warn(`Ambulance booking ${reference} recorded but ${recipient} delivery state could not be saved:`, error.message); }
  }
  if (userEmail) {
    await deliver("user", {
      eventKey: `ambulance_booking_user_${reference}`,
      to: userEmail,
      template: "ambulance_booking_confirmation",
      data: bookingData,
    });
  }

  await routeRequestSafely(booking, "AmbulanceBooking");

  res.status(201).json({
    success: true,
    recorded: true,
    reference,
    message: "Ambulance booking request recorded.",
    booking: {
      ...bookingData,
      _id: booking._id,
      status: booking.status,
      createdAt: booking.createdAt,
    },
    delivery: deliverySummary(booking.delivery),
    ...(!req.user ? { trackingToken } : {}),
  });
});

export const listAmbulanceBookings = asyncHandler(async (req, res) => {
  const filter = req.user.role === "system_admin" ? {} : ["provider_admin", "hospital_admin"].includes(req.user.role) ? { provider: { $in: req.user.providerIds || [] } } : { user: req.user.id };
  const data = await AmbulanceBooking.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ data: data.map(publicBooking), total: data.length });
});

export const getAmbulanceBooking = asyncHandler(async (req, res) => {
  const booking = await AmbulanceBooking.findOne({ reference: req.params.reference })
    .select("+trackingTokenHash");
  if (!booking) return res.status(404).json({ error: "Ambulance booking not found" });

  const isAdmin = req.user && (req.user.role === "system_admin" || req.user.providerIds?.includes(String(booking.provider)));
  const isOwner = req.user && booking.user && String(booking.user) === String(req.user.id);
  const suppliedToken = req.get(TRACKING_TOKEN_HEADER);
  const hasGuestAccess = verifyTrackingToken(suppliedToken, booking.trackingTokenHash);
  if (!isAdmin && !isOwner && !hasGuestAccess) {
    return res.status(403).json({ error: "Private tracking token required" });
  }

  res.json({ booking: publicBooking(booking), delivery: deliverySummary(booking.delivery) });
});

export const archiveResource = asyncHandler(async (req, res) => {
  const provider = await ResourceProvider.findById(req.params.id).select("kind").lean();
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  const result = await archiveProviderOrganization({ kind: provider.kind, id: provider._id, actor: req.user, reason: req.body?.reason });
  res.json({ ok: true, archived: true, cleanupPending: result.cleanupPending });
});
