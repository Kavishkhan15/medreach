import mongoose from "mongoose";
import { env } from "./env.js";
import { connectionOptions } from "./runtimeOptions.js";
import { backendMetricsEnabled, installMongoTelemetry, flushBackendMetrics } from "../services/backendMetrics.js";

mongoose.set("strictQuery", true);

// Reuse the process's connection and deduplicate concurrent connection attempts.
// Production consumes the stored dataset without automatic collection/index changes.
let connPromise = null;
let disposeTelemetry;

// Call only after production prerequisite indexes have been verified.
export function enableDatabaseTelemetry() {
  disposeTelemetry?.();
  disposeTelemetry = installMongoTelemetry(mongoose.connection.getClient());
}

export async function connectDB(uri = env.mongoUri) {
  if (process.env.BACKEND_METRICS_ENABLED !== undefined && !["true", "false"].includes(process.env.BACKEND_METRICS_ENABLED)) throw Error("METRICS_CONFIGURATION_INVALID");
  if (mongoose.connection.readyState === 1) return mongoose.connection; // already connected
  if (!connPromise) {
    connPromise = mongoose
      .connect(uri, { ...connectionOptions(process.env, env.nodeEnv), monitorCommands: backendMetricsEnabled() })
      .then((m) => {
        console.log(`[medreach] MongoDB connected: ${m.connection.name}`);
        return m.connection;
      })
      .finally(() => { connPromise = null; });
  }
  await connPromise;
  return mongoose.connection;
}

export async function disconnectDB() {
  await flushBackendMetrics();
  disposeTelemetry?.(); disposeTelemetry = undefined;
  await mongoose.disconnect();
  connPromise = null;
}
