import mongoose from "mongoose";

// Tiny key/value store for GLOBAL crawler settings that aren't per-source —
// currently just the scheduler paused flag. Kept as its own collection so the
// scheduler's paused/resumed state survives a backend restart (an in-memory
// flag would silently reset on every deploy).
const crawlerSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

crawlerSettingSchema.set("toJSON", { transform: (_d, r) => (delete r.__v, r) });

export const CrawlerSetting = mongoose.model("CrawlerSetting", crawlerSettingSchema);
