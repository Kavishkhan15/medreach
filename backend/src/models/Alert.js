import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
    },
    region: { type: String, trim: true, index: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital" },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

alertSchema.set("toJSON", { transform: (_d, r) => (delete r.__v, r) });

export const Alert = mongoose.model("Alert", alertSchema);
