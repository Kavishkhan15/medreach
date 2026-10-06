import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("strictQuery", true);

// Reuse the process's connection and deduplicate concurrent connection attempts.
// Production consumes the stored dataset without automatic collection/index changes.
let connPromise = null;

export async function connectDB(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection; // already connected
  if (!connPromise) {
    connPromise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 10,
        minPoolSize: 0, maxIdleTimeMS: 60000, autoIndex: env.nodeEnv !== "production",
        autoCreate: env.nodeEnv !== "production" })
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
  await mongoose.disconnect();
  connPromise = null;
}
