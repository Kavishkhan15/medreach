import mongoose from "mongoose";

const schema = new mongoose.Schema({
  eventKey: { type: String, unique: true, sparse: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, required: true, maxlength: 60 },
  title: { type: String, required: true, maxlength: 140 },
  message: { type: String, required: true, maxlength: 500 },
  relatedType: { type: String, maxlength: 50 },
  relatedId: { type: mongoose.Schema.Types.ObjectId },
  readAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ recipient: 1, createdAt: -1 });
export const Notification = mongoose.model("Notification", schema);
