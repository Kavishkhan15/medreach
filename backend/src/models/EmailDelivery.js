import mongoose from "mongoose";

const schema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  recipient: { type: String, required: true, lowercase: true, trim: true },
  template: { type: String, required: true },
  subject: { type: String, required: true },
  status: { type: String, enum: ["disabled", "pending", "sent", "failed"], required: true },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, maxlength: 240 },
  errorCode: { type: String, maxlength: 80 },
  sentAt: { type: Date },
}, { timestamps: true });
export const EmailDelivery = mongoose.model("EmailDelivery", schema);
