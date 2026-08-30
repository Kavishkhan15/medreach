import { Alert } from "../models/Alert.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/alerts — public; active alerts, optionally by region.
export const listAlerts = asyncHandler(async (req, res) => {
  const { region } = req.query;
  const filter = { active: true };
  if (region) filter.region = region;
  filter.$or = [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }];
  const data = await Alert.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ data });
});

export const createAlert = asyncHandler(async (req, res) => {
  const alert = await Alert.create({ ...req.body, createdBy: req.user.id });
  res.status(201).json({ alert });
});

export const deactivateAlert = asyncHandler(async (req, res) => {
  const alert = await Alert.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!alert) return res.status(404).json({ error: "Alert not found" });
  res.json({ alert });
});
