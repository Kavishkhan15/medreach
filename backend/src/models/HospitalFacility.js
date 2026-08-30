import mongoose from "mongoose";
import { FACILITY_TYPES, AVAILABILITY_STATUS, CONFIDENCE_LEVELS } from "../config/constants.js";

// A discrete facility at a hospital (ICU, Trauma Center, MRI, Ambulance, …).
// Holds the LATEST known status; the time-series of changes lives in
// AvailabilityObservation. We intentionally avoid exposing precise quantities
// unless a source supports them (count stays null → UI shows status only).
const hospitalFacilitySchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
    facility: { type: String, enum: FACILITY_TYPES, required: true },
    status: { type: String, enum: AVAILABILITY_STATUS, default: "unknown" },
    count: { type: Number, min: 0, default: null }, // null = quantity unknown/unsupported
    lastUpdated: { type: Date },
    source: { type: mongoose.Schema.Types.ObjectId, ref: "DataSource" },
    confidence: { type: String, enum: CONFIDENCE_LEVELS, default: "UNKNOWN" },
  },
  { timestamps: true }
);

hospitalFacilitySchema.index({ hospital: 1, facility: 1 }, { unique: true });
hospitalFacilitySchema.set("toJSON", { transform: (_d, r) => (delete r.__v, r) });

export const HospitalFacility = mongoose.model("HospitalFacility", hospitalFacilitySchema);
