import mongoose from "mongoose";
import { Notification } from "../models/Notification.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const listNotifications = asyncHandler(async (req, res) => {
  const data = await Notification.find({ recipient: req.user.id }).sort({ createdAt: -1 }).limit(100).lean();
  const unread = await Notification.countDocuments({ recipient: req.user.id, readAt: null });
  res.json({ data, unread });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid notification" });
  const item = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user.id },
    { $set: { readAt: new Date() } }, { new: true });
  if (!item) return res.status(404).json({ error: "Notification not found" });
  res.json({ notification: item });
});
