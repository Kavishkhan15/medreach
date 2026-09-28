import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    organizationType: {
      type: String,
      enum: ["hospital", "blood_bank", "diagnostic", "ambulance"],
      required: true,
      index: true,
    },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", index: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "ResourceProvider", index: true },
    roleInterested: { type: String, required: true, trim: true, maxlength: 120 },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    idempotencyKeyHash: { type: String, select: false },
    candidateName: { type: String, trim: true, maxlength: 150 },
    candidatePhone: { type: String, trim: true, maxlength: 50 },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    qualifications: { type: String, trim: true, maxlength: 500 },
    experienceYears: { type: Number, min: 0, max: 70 },
    statement: { type: String, trim: true, maxlength: 4000 },
    sop: { type: String, trim: true, maxlength: 4000 },
    resume: {
      fileName: { type: String, trim: true },
      fileType: { type: String, trim: true },
      fileUrl: { type: String, trim: true },
      fileSize: { type: Number },
    },
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

schema.index({ hospital: 1, applicant: 1 }, { unique: true, partialFilterExpression: { hospital: { $exists: true } } });
schema.index({ provider: 1, applicant: 1 }, { unique: true, partialFilterExpression: { provider: { $exists: true } } });
schema.index({ idempotencyKeyHash: 1 }, { unique: true, sparse: true });
schema.index({ organizationType: 1, status: 1 });
schema.set("toJSON", { transform: (_doc, result) => {
  delete result.idempotencyKeyHash;
  delete result.__v;
  return result;
} });

export const OrganizationApplication = mongoose.model("OrganizationApplication", schema);
