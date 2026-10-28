import { createHmac } from "node:crypto";
import { env } from "../config/env.js";
import { RateLimitBucket } from "../models/RateLimitBucket.js";
export { RateLimitBucket } from "../models/RateLimitBucket.js";

// Fixed windows are shared by all API replicas. MongoDB expiry is housekeeping;
// the window in the identity enforces expiry even before the TTL monitor runs.
export class MongoRateLimitStore {
  constructor({ namespace, collection = RateLimitBucket, clock = Date.now } = {}) {
    if (!/^[a-z0-9_-]{1,60}$/.test(namespace || "")) throw new Error("Rate limiter namespace required");
    this.namespace = namespace;
    this.collection = collection;
    this.clock = clock;
    this.localKeys = false;
    this.prefix = `${namespace}:`;
  }
  init({ windowMs }) { this.windowMs = windowMs; }
  key(key) {
    const window = Math.floor(this.clock() / this.windowMs);
    const digest = createHmac("sha256", env.jwtSecret).update(String(key)).digest("hex");
    return { id: `${this.namespace}:${window}:${digest}`, resetTime: new Date((window + 1) * this.windowMs) };
  }
  async increment(key) {
    const { id, resetTime } = this.key(key);
    try {
      let row;
      try {
        row = await this.collection.findOneAndUpdate({ _id: id }, {
          $inc: { totalHits: 1 }, $setOnInsert: { resetTime, expiresAt: resetTime },
        }, { upsert: true, new: true, setDefaultsOnInsert: false });
      } catch (error) {
        if (error.code !== 11000) throw error;
        row = await this.collection.findOneAndUpdate({ _id: id }, { $inc: { totalHits: 1 } }, { new: true });
      }
      if (!row || !Number.isSafeInteger(row.totalHits)) throw new Error("Invalid rate counter");
      return { totalHits: row.totalHits, resetTime: row.resetTime };
    } catch {
      throw Object.assign(new Error("Rate limiting temporarily unavailable"), { code: "RATE_LIMIT_UNAVAILABLE", status: 503 });
    }
  }
  async decrement(key) {
    await this.collection.updateOne({ _id: this.key(key).id, totalHits: { $gt: 0 } }, { $inc: { totalHits: -1 } });
  }
  async resetKey(key) { await this.collection.deleteOne({ _id: this.key(key).id }); }
}
