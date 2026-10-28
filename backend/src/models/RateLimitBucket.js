import mongoose from "mongoose";
const schema = new mongoose.Schema({ _id: String, totalHits: Number, resetTime: Date, expiresAt: Date });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RateLimitBucket = mongoose.models.RateLimitBucket || mongoose.model("RateLimitBucket", schema);
