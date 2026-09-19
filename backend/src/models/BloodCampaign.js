import mongoose from "mongoose";

const bloodCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    organizer: { type: String, required: true, trim: true, maxlength: 200 },
    location: { type: String, required: true, trim: true, maxlength: 300 },
    date: { type: Date, required: true, index: true },
    endDate: { type: Date },
    bloodGroups: [{ type: String, trim: true }],
    contact: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["pending", "active", "upcoming", "completed", "cancelled", "rejected"],
      default: "pending",
      index: true,
    },
    description: { type: String, trim: true, maxlength: 1000 },
    targetDonors: { type: Number, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

bloodCampaignSchema.index({ status: 1, date: 1 });

export const BloodCampaign = mongoose.model("BloodCampaign", bloodCampaignSchema);
