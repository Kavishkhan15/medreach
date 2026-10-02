import mongoose from "mongoose";
import { generateCareerReference } from "../utils/careerReference.js";

const schema = new mongoose.Schema(
  {
    reference: { type: String, immutable: true, match: /^CAR-J[A-F0-9]{14}$/, default: () => generateCareerReference("J") },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    idempotencyKeyHash: { type: String, select: false },
    candidateName: { type: String, trim: true, maxlength: 150 },
    candidatePhone: { type: String, trim: true, maxlength: 50 },
    qualifications: { type: String, trim: true, maxlength: 500 },
    experienceYears: { type: Number, min: 0, max: 70 },
    currentOrganization: { type: String, trim: true, maxlength: 200 },
    statement: { type: String, trim: true, maxlength: 4000 },
    sop: { type: String, trim: true, maxlength: 4000 },
    resume: {
      fileName: { type: String, trim: true },
      fileType: { type: String, trim: true },
      fileUrl: { type: String, trim: true },
      fileSize: { type: Number },
    },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["submitted", "under_review", "shortlisted", "rejected", "withdrawn"],
      default: "submitted",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

schema.index({ job: 1, applicant: 1 }, { unique: true });
schema.index({ reference: 1 }, { unique: true, sparse: true });
schema.index({ idempotencyKeyHash: 1 }, { unique: true, sparse: true });
schema.index({ job: 1, status: 1 });
schema.set("toJSON", { transform: (_doc, result) => {
  delete result.idempotencyKeyHash;
  delete result.__v;
  return result;
} });

export const JobApplication = mongoose.model("JobApplication", schema);
