import { BloodCampaign } from "../models/BloodCampaign.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/blood-banks/campaigns — list campaigns (public shows active/upcoming; admin can view pending)
export const listCampaigns = asyncHandler(async (req, res) => {
  const { status, bloodGroup, q } = req.query;
  const isAdmin = req.user && ["admin", "system_admin"].includes(req.user.role);
  const filter = {};

  if (status === "pending") {
    if (!isAdmin) {
      return res.status(403).json({ error: "Only administrators can view pending campaigns" });
    }
    filter.status = "pending";
  } else if (status && status !== "all") {
    filter.status = status;
  } else if (status === "all") {
    if (!isAdmin) {
      filter.status = { $in: ["active", "upcoming"] };
    }
    // Admins viewing "all" see everything
  } else {
    // Default public view
    filter.status = { $in: ["active", "upcoming"] };
  }

  if (bloodGroup) {
    filter.bloodGroups = { $in: [bloodGroup, "All", "ALL"] };
  }

  if (q) {
    const safeQ = String(q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: safeQ, $options: "i" } },
      { location: { $regex: safeQ, $options: "i" } },
      { organizer: { $regex: safeQ, $options: "i" } },
    ];
  }

  const campaigns = await BloodCampaign.find(filter)
    .sort({ date: 1 })
    .populate("createdBy", "name email role")
    .lean();

  res.json({ data: campaigns, total: campaigns.length });
});

// POST /api/blood-banks/campaigns — propose or create a campaign
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
    status: requestedStatus,
  } = req.body;

  if (!name || !organizer || !location || !date || !contact) {
    return res.status(400).json({
      error: "name, organizer, location, date, and contact are required fields",
    });
  }

  const isAdmin = req.user && ["admin", "system_admin"].includes(req.user.role);
  // Admins can create directly as 'active' (or any requested status); public/guests are always 'pending'
  const initialStatus = isAdmin
    ? (requestedStatus || "active")
    : "pending";

  const userId = req.user?._id || req.user?.id;

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
    status: initialStatus,
    createdBy: userId || undefined,
  });

  res.status(201).json({
    campaign,
    message: initialStatus === "pending"
      ? "Campaign proposal submitted for administrator review"
      : "Campaign published successfully",
  });
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

  const userId = req.user?._id || req.user?.id;
  const isCreator = userId && String(campaign.createdBy) === String(userId);
  const isAdmin = req.user && ["admin", "system_admin"].includes(req.user.role);

  if (!isCreator && !isAdmin) {
    return res.status(403).json({ error: "Unauthorized to update this campaign" });
  }

  const allowedFields = [
    "name",
    "organizer",
    "location",
    "date",
    "endDate",
    "bloodGroups",
    "contact",
    "email",
    "description",
    "targetDonors",
  ];

  // Only admin can change status directly
  if (isAdmin && req.body.status !== undefined) {
    allowedFields.push("status");
  }

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      campaign[field] = req.body[field];
    }
  }

  await campaign.save();
  res.json({ campaign });
});

// PATCH /api/blood-banks/campaigns/:id/status — Admin status approval endpoint
export const updateCampaignStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["pending", "active", "upcoming", "completed", "cancelled", "rejected"];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
    });
  }

  const campaign = await BloodCampaign.findById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  campaign.status = status;
  await campaign.save();

  res.json({
    campaign,
    message: `Campaign status updated to ${status}`,
  });
});
