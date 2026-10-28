import mongoose from "mongoose";

const schema = new mongoose.Schema({
  workerId: { type: String, required: true },
  role: { type: String, required: true, enum: ["notification", "expiry", "recovery"] },
  status: { type: String, enum: ["idle", "running", "stopping", "stopped", "degraded"], required: true },
  heartbeatAt: { type: Date, required: true },
  job: { type: mongoose.Schema.Types.ObjectId, ref: "BackgroundJob" },
  lastSuccessAt: Date,
  lastFailureAt: Date,
  errorCode: String,
}, { timestamps: true });
schema.index({ workerId: 1 }, { unique: true });
schema.index({ role: 1, heartbeatAt: -1 });
schema.index({ heartbeatAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
export const WorkerHeartbeat = mongoose.model("WorkerHeartbeat", schema);
