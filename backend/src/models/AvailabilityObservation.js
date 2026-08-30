import mongoose from "mongoose";
import {
  FACILITY_TYPES,
  AVAILABILITY_STATUS,
  CONFIDENCE_LEVELS,
  VERIFICATION_STATUS,
} from "../config/constants.js";

// Append-only time-series of availability observations. We never overwrite the
// past — each fetch/verification writes a new row. This lets the UI say
// "updated 4 min ago" honestly and supports historical analysis, instead of
// pretending a single number is permanently current.
const availabilityObservationSchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
    facility: { type: String, enum: FACILITY_TYPES, required: true },
    status: { type: String, enum: AVAILABILITY_STATUS, default: "unknown" },
    quantity: { type: Number, min: 0, default: null },
    source: { type: mongoose.Schema.Types.ObjectId, ref: "DataSource" },
    // When the source reported it vs when we retrieved it (drift matters for freshness).
    observedAt: { type: Date },
    retrievedAt: { type: Date, default: Date.now },
    confidence: { type: String, enum: CONFIDENCE_LEVELS, default: "UNKNOWN" },
    verificationStatus: { type: String, enum: VERIFICATION_STATUS, default: "unverified" },
  },
  { timestamps: true }
);

// Fast "latest observation for this hospital+facility" lookups.
availabilityObservationSchema.index({ hospital: 1, facility: 1, retrievedAt: -1 });
availabilityObservationSchema.set("toJSON", { transform: (_d, r) => (delete r.__v, r) });

export const AvailabilityObservation = mongoose.model(
  "AvailabilityObservation",
  availabilityObservationSchema
);
