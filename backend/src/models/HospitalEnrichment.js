import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  hospital: { type: mongoose.Schema.Types.ObjectId, required: true },
  inputHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  status: { type: String, enum: ['queued','awaiting_review','approved','rejected','superseded'], default: 'queued', required: true },
  version: { type: Number, default: 1, min: 1 },
  proposed: { type: mongoose.Schema.Types.Mixed, default: {} },
  approvedFields: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  requestReason: { type: String, required: true, maxlength: 500 },
  reviewedBy: mongoose.Schema.Types.ObjectId,
  reviewedAt: Date,
  reviewReason: { type: String, maxlength: 500 },
  extractedAt: Date,
  jobEnqueuedAt: Date,
  supersededAt: Date,
  extractLeaseToken: { type: String, select: false },
  extractLeaseUntil: Date,
}, { timestamps: true, strict: 'throw' });
schema.index({ hospital: 1, inputHash: 1 }, { unique: true });
schema.index({ hospital: 1, status: 1, updatedAt: -1 });
schema.index({ status: 1, createdAt: 1 });
schema.index({ status: 1, _id: -1 });
export const HospitalEnrichment = mongoose.model('HospitalEnrichment', schema);
