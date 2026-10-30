import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      index: true,
      required: function () {
        return !this.provider;
      },
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResourceProvider",
      index: true,
    },
    organizationType: {
      type: String,
      enum: ["hospital", "diagnostic", "blood_bank", "ambulance", "other"],
      default: "hospital",
      index: true,
    },
    organizationName: { type: String, trim: true, maxlength: 200, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    category: {
      type: String,
      enum: [
        "Doctor",
        "Nurse",
        "Technician",
        "Pharmacist",
        "Administrative",
        "Emergency Staff",
        "Internship",
        "Other",
      ],
      required: true,
    },
    department: { type: String, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    requirements: { type: String, trim: true, maxlength: 2000 },
    employmentType: {
      type: String,
      enum: ["full_time", "part_time", "contract", "internship"],
      required: true,
    },
    location: { type: String, trim: true, maxlength: 160 },
    salaryText: { type: String, trim: true, maxlength: 100 },
    deadline: { type: Date },
    // Unknown legacy vacancy counts stay unknown; applications are not hires.
    vacancies: { type: Number, default: null, min: 0, max: 10000, validate: { validator: value => value === null || Number.isSafeInteger(value) } },
    filledPositions: { type: Number, default: 0, min: 0, max: 10000, validate: Number.isSafeInteger },
    availabilityReportedAt: { type: Date },
    availabilityReportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", select: false },
    status: {
      type: String,
      enum: ["draft", "pending", "published", "closed", "rejected"],
      default: "draft",
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: ["unverified", "verified"],
      default: "unverified",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true, optimisticConcurrency: true }
);

schema.pre("validate", function (next) {
  if (this.vacancies !== null && this.vacancies !== undefined && this.filledPositions > this.vacancies) {
    this.invalidate("filledPositions", "Filled positions cannot exceed total vacancies");
  }
  if (this.hospital && !this.organizationType) {
    this.organizationType = "hospital";
  }
  next();
});

schema.index({ status: 1, createdAt: -1 });
schema.index({ organizationType: 1, status: 1 });
schema.index({ provider: 1, status: 1 });

export const Job = mongoose.model("Job", schema);
