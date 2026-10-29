import mongoose from "mongoose";
const schema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  sourceType: { type: String, enum: ["EmergencyRequest", "BloodRequest", "AmbulanceBooking", "DiagnosticRequest"], required: true },
  source: { type: mongoose.Schema.Types.ObjectId, required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recoveryCheckedAt: { type: Date },
  channel: { type: String, enum: ["system", "provider"], required: true },
  email: { type: String, required: true },
  status: { type: String, enum: ["pending", "sent", "failed", "uncertain", "disabled", "cancelled"], default: "pending" },
}, { timestamps: true });
export const RequestNotification = mongoose.model("RequestNotification", schema);
