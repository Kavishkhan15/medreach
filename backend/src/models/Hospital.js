import mongoose from "mongoose";
import {
  HOSPITAL_TYPES,
  EMERGENCY_STATUS,
  AVAILABILITY_STATUS,
  VERIFICATION_STATUS,
} from "../config/constants.js";

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const hospitalSchema = new mongoose.Schema(
  {
    capacityReservationCount: { type: Number, default: 0, min: 0, select: false },
    archivedAt: { type: Date, default: null, index: true },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    archiveReason: { type: String, trim: true, maxlength: 500 },
    archiveOperation: { type: mongoose.Schema.Types.ObjectId },
    archivePending: { type: Boolean, default: false },
    archiveAttempts: { type: Number, default: 0, min: 0, max: 5 },
    archiveLeaseToken: { type: String, select: false },
    archiveLeaseUntil: Date,
    archiveRetryAt: Date,
    archiveExhaustedAt: Date,
    archiveErrorCode: { type: String, maxlength: 80 },
    approvalStatus: { type: String, enum: ["pending", "approved", "rejected"] },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, unique: true, index: true },
    description: { type: String, trim: true, maxlength: 2000 },
    hospitalType: { type: String, enum: HOSPITAL_TYPES, index: true },

    // Address / locality
    address: { type: String, trim: true },
    locality: { type: String, trim: true, index: true },
    city: { type: String, trim: true, index: true },
    region: { type: String, trim: true, index: true },
    pincode: { type: String, trim: true },

    // GeoJSON point [longitude, latitude] for "nearest hospital" queries.
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },

    phone: { type: String, trim: true },
    emergencyPhone: { type: String, trim: true },
    website: { type: String, trim: true },

    specialties: [{ type: String, trim: true }],
    // Backward-compat alias for specialties/departments used by legacy UI + text index.
    departments: [{ type: String, trim: true }],
    services: [{ type: String, trim: true }],
    operatingHours: { type: String, trim: true },
    // Legacy field kept so existing fixtures/UI keep rendering.
    hours: { type: String, trim: true },

    // Derived/compat snapshot of emergency capability. Authoritative volatile data
    // now lives in AvailabilityObservation; these are convenience mirrors.
    emergencyDepartmentStatus: { type: String, enum: AVAILABILITY_STATUS, default: "unknown" },
    ambulanceStatus: { type: String, enum: AVAILABILITY_STATUS, default: "unknown" },
    emergencyStatus: { type: String, enum: EMERGENCY_STATUS, default: "available" }, // legacy
    bedsTotal: { type: Number, default: 0, min: 0 }, // legacy
    bedsAvailable: { type: Number, default: 0, min: 0 }, // legacy

    verificationStatus: { type: String, enum: VERIFICATION_STATUS, default: "unverified" },
    verificationDate: { type: Date },

    sourceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "DataSource" }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// Search + geo indexes.
hospitalSchema.index({
  name: "text",
  city: "text",
  locality: "text",
  departments: "text",
  specialties: "text",
  services: "text",
});
hospitalSchema.index({ location: "2dsphere" });
hospitalSchema.index({ archivedAt: 1, name: 1, _id: 1 });

hospitalSchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = `${slugify(this.name)}-${String(this._id).slice(-5)}`;
  }
  // Keep specialties/departments mirrored so either field works everywhere.
  if (this.specialties?.length && !this.departments?.length) this.departments = this.specialties;
  if (this.departments?.length && !this.specialties?.length) this.specialties = this.departments;
  next();
});

hospitalSchema.set("toJSON", { transform: (_d, r) => (delete r.__v, r) });

export const Hospital = mongoose.model("Hospital", hospitalSchema);
