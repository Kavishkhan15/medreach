import mongoose from "mongoose";

const schema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
  applicant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  statement: { type: String, trim: true, maxlength: 4000 },
  sop: { type: String, trim: true, maxlength: 4000 },
  resume: {
    fileName: { type: String, trim: true },
    fileType: { type: String, trim: true },
    fileUrl: { type: String, trim: true },
    fileSize: { type: Number },
  },
  contactEmail: { type: String, required: true, trim: true, lowercase: true },
  status: { type: String, enum: ["submitted", "under_review", "shortlisted", "rejected", "withdrawn"], default: "submitted" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
}, { timestamps: true });
schema.index({ job: 1, applicant: 1 }, { unique: true });
export const JobApplication = mongoose.model("JobApplication", schema);
