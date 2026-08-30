import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("strictQuery", true);

// Cache the connection promise across serverless invocations (Vercel/Lambda).
// Without this, every function call would open a new connection and exhaust the
// database's connection limit.
let connPromise = null;

export async function connectDB(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection; // already connected
  if (!connPromise) {
    connPromise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 })
      .then((m) => {
        console.log(`[medreach] MongoDB connected: ${m.connection.name}`);
        return m.connection;
      })
      .catch((err) => {
        connPromise = null; // allow retry on next invocation
        throw err;
      });
  }
  await connPromise;
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  connPromise = null;
}
