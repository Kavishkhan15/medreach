import mongoose from "mongoose";

export const AMBULANCE_BOOKING_STATES = [
  "RECORDED",
  "UNDER_REVIEW",
  "CONFIRMED",
  "DISPATCHED",
  "CANCELLED",
  "COMPLETED",
];

export const DELIVERY_STATES = [
  "not_available",
  "pending",
  "sent",
  "failed",
  "uncertain",
  "disabled",
];

const providerSnapshotSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 180 },
  phone: { type: String, trim: true, maxlength: 40 },
  email: { type: String, trim: true, lowercase: true, maxlength: 150 },
}, { _id: false });

const requestSnapshotSchema = new mongoose.Schema({
  patientName: { type: String, required: true, trim: true, maxlength: 150 },
  patientAge: { type: Number, required: true, min: 1, max: 130 },
  ambulanceRequired: { type: Boolean, default: true },
  pickupAddress: { type: String, required: true, trim: true, maxlength: 300 },
  contactEmail: { type: String, trim: true, lowercase: true, maxlength: 150 },
  contactPhone: { type: String, trim: true, maxlength: 50 },
  notes: { type: String, trim: true, maxlength: 1000 },
}, { _id: false });

const deliverySchema = new mongoose.Schema({
  status: { type: String, enum: DELIVERY_STATES, required: true },
  attempted: { type: Boolean, default: false },
  attemptedAt: Date,
  sentAt: Date,
  errorCode: { type: String, maxlength: 80 },
  emailDelivery: { type: mongoose.Schema.Types.ObjectId, ref: "EmailDelivery" },
}, { _id: false });

const schema = new mongoose.Schema({
  notificationVersion: Number,
  notificationRoutedAt: Date,
  notificationRouting: { type: String, enum: ["recorded", "no_eligible_recipients"] },
  isEmergency: { type: Boolean, default: false },
  reference: { type: String, required: true, unique: true, index: true, trim: true },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: "ResourceProvider", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  providerSnapshot: { type: providerSnapshotSchema, required: true },
  requestSnapshot: { type: requestSnapshotSchema, required: true },
  status: { type: String, enum: AMBULANCE_BOOKING_STATES, default: "RECORDED", index: true },
  delivery: {
    user: { type: deliverySchema, required: true },
    admin: { type: deliverySchema, required: true },
    provider: { type: deliverySchema, required: true },
  },
  trackingTokenHash: { type: String, required: true, select: false },
  idempotencyKeyHash: { type: String, select: false },
}, {
  timestamps: true,
  toJSON: {
    transform: (_document, result) => {
      delete result.trackingTokenHash;
      delete result.idempotencyKeyHash;
      return result;
    },
  },
});

schema.index({ user: 1, createdAt: -1 });
schema.index({ provider: 1, createdAt: -1 });
schema.index({ idempotencyKeyHash: 1 }, { unique: true, sparse: true });

schema.index({ notificationVersion: 1, notificationRoutedAt: 1 });
export const AmbulanceBooking = mongoose.model("AmbulanceBooking", schema);
