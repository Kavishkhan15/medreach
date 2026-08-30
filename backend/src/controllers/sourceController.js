import { DataSource } from "../models/DataSource.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { writeAudit, hashIp } from "../utils/audit.js";
import { isSafeUrl } from "../_crawler/ssrf.js";

// GET /api/sources — admin: list registered data sources.
export const listSources = asyncHandler(async (_req, res) => {
  const data = await DataSource.find().sort({ createdAt: -1 }).lean();
  res.json({ data });
});

// POST /api/sources — admin: register a source. URL must pass the SSRF guard.
export const createSource = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (url && !isSafeUrl(url)) return res.status(400).json({ error: "Source URL failed the SSRF safety check" });
  const source = await DataSource.create(req.body);
  await writeAudit({ user: req.user.id, action: "create", entityType: "DataSource", entityId: source._id,
    after: { name: source.name, type: source.type }, ipHash: hashIp(req.ip), requestId: req.id });
  res.status(201).json({ source });
});

// PATCH /api/sources/:id — admin: enable/disable or update.
export const updateSource = asyncHandler(async (req, res) => {
  if (req.body.url && !isSafeUrl(req.body.url)) return res.status(400).json({ error: "Source URL failed the SSRF safety check" });
  const source = await DataSource.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!source) return res.status(404).json({ error: "Source not found" });
  res.json({ source });
});
