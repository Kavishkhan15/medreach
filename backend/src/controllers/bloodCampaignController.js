import { BloodCampaign } from "../models/BloodCampaign.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/blood-banks/campaigns — list active and upcoming campaigns
export const listCampaigns = asyncHandler(async (req, res) => {
  const { status, bloodGroup, q } = req.query;
  const filter = {};

  if (status && status !== "all") {
    filter.status = status;
  } else if (!status) {
    filter.status = { $in: ["active", "upcoming"] };
  }

  if (bloodGroup) {
    filter.bloodGroups = { $in: [bloodGroup, "All", "ALL"] };
  }

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { location: { $regex: q, $options: "i" } },
      { organizer: { $regex: q, $options: "i" } },
    ];
  }

  const campaigns = await BloodCampaign.find(filter)
    .sort({ date: 1 })
    .populate("createdBy", "name email role")
    .lean();

  res.json({ data: campaigns, total: campaigns.length });
});

// POST /api/blood-banks/campaigns — create a campaign (authenticated)
export const createCampaign = asyncHandler(async (req, res) => {
  const {
    name,
    organizer,
    location,
    date,
    endDate,
    bloodGroups = ["All"],
    contact,
    email,
    description,
    targetDonors,
  } = req.body;

  if (!name || !organizer || !location || !date || !contact) {
    return res.status(400).json({
      error: "name, organizer, location, date, and contact are required fields",
    });
  }

  const campaign = await BloodCampaign.create({
    name: name.trim(),
    organizer: organizer.trim(),
    location: location.trim(),
    date: new Date(date),
    endDate: endDate ? new Date(endDate) : undefined,
    bloodGroups: Array.isArray(bloodGroups) ? bloodGroups : [bloodGroups],
    contact: contact.trim(),
    email: email ? email.trim() : req.user?.email,
    description: description ? description.trim() : "",
    targetDonors: targetDonors ? Number(targetDonors) : undefined,
    status: "active",
    createdBy: req.user?._id,
  });

  res.status(201).json({ campaign });
});

// GET /api/blood-banks/campaigns/:id
export const getCampaign = asyncHandler(async (req, res) => {
  const campaign = await BloodCampaign.findById(req.params.id)
    .populate("createdBy", "name email role")
    .lean();

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  res.json({ campaign });
});

// PATCH /api/blood-banks/campaigns/:id
export const updateCampaign = asyncHandler(async (req, res) => {
  const campaign = await BloodCampaign.findById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  // Only creator or admin can modify
  const isCreator = req.user && String(campaign.createdBy) === String(req.user._id);
  const isAdmin = req.user && ["admin", "system_admin"].includes(req.user.role);

  if (!isCreator && !isAdmin) {
    return res.status(403).json({ error: "Unauthorized to update this campaign" });
  }

  const allowedFields = ["name", "organizer", "location", "date", "endDate", "bloodGroups", "contact", "email", "status", "description", "targetDonors"];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      campaign[field] = req.body[field];
    }
  }

  await campaign.save();
  res.json({ campaign });
});
