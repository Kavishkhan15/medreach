import mongoose from "mongoose";

const schema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
  applicant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  statement: { type: String, required: true, trim: true, maxlength: 1500 },
  contactEmail: { type: String, required: true, trim: true, lowercase: true },
  status: { type: String, enum: ["submitted", "under_review", "shortlisted", "rejected", "withdrawn"], default: "submitted" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
}, { timestamps: true });
schema.index({ job: 1, applicant: 1 }, { unique: true });
export const JobApplication = mongoose.model("JobApplication", schema);
