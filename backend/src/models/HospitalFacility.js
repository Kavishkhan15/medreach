import mongoose from "mongoose";
import { FACILITY_TYPES, AVAILABILITY_STATUS, CONFIDENCE_LEVELS } from "../config/constants.js";

// A discrete facility at a hospital (ICU, Trauma Center, MRI, Ambulance, …).
// Holds the latest resolved *capability* from source claims. Current patient
// availability lives in AvailabilityObservation and is composed at API read
// time. Legacy status/count fields remain for stored-record compatibility.
const hospitalFacilitySchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
    facility: { type: String, enum: FACILITY_TYPES, required: true },
    // Static evidence that this hospital has the facility. This is independent
    // of whether it has capacity for a patient right now.
    capability: { type: String, enum: ["yes", "no", "unknown"], default: "unknown" },
    capabilityConflict: { type: Boolean, default: false },
    // Legacy status retained for old records. New crawler writes keep it unknown;
    // public availability comes from AvailabilityObservation instead.
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
