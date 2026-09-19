import mongoose from "mongoose";

const bloodRequestSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["REQUEST", "DONATION"],
      required: true,
      index: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResourceProvider",
      index: true,
    },
    bloodBankName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
      required: true,
      index: true,
    },
    patientOrDonorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    // For REQUEST
    units: {
      type: Number,
      min: 1,
      max: 50,
      default: 1,
    },
    urgency: {
      type: String,
      enum: ["EMERGENCY", "URGENT", "ROUTINE"],
      default: "URGENT",
      index: true,
    },
    hospitalName: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    doctorNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    // For DONATION
    age: {
      type: Number,
      min: 18,
      max: 65,
    },
    weight: {
      type: Number,
      min: 45,
      max: 200,
    },
    preferredDate: {
      type: Date,
    },
    // Contact details
    contactPhone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 150,
    },
    status: {
      type: String,
      enum: ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"],
      default: "REQUESTED",
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

bloodRequestSchema.index({ type: 1, status: 1, createdAt: -1 });

export const BloodRequest = mongoose.model("BloodRequest", bloodRequestSchema);
