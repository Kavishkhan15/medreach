import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { MongoRateLimitStore } from "../services/sharedRateLimitStore.js";

export function sharedLimiter(namespace, max, windowMs = 15 * 60 * 1000, options = {}) {
  // Unit tests deliberately run without a DB. Multi-instance integration tests
  // inject the real store; development and production always use shared state.
  const store = options.storeFactory ? options.storeFactory(namespace, windowMs)
    : env.nodeEnv === "test" ? undefined : new MongoRateLimitStore({ namespace });
  return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false,
    skipSuccessfulRequests: false, passOnStoreError: false, ...(store ? { store } : {}),
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
    message: { error: "Too many requests. Please try again later." } });
}
