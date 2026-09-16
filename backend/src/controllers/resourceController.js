import { ResourceProvider, RESOURCE_KINDS } from "../models/ResourceProvider.js";
import { AuditLog } from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";

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
