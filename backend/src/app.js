// Builds the Express app WITHOUT connecting to the DB or listening.
// Exported so tests can import it with supertest. server.js wires DB + listen.

import express from "express";
import { applySecurity } from "./middleware/security.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/logging.js";

import healthRouter from "./routes/health.js";
import authRoutes from "./routes/authRoutes.js";
import hospitalRoutes from "./routes/hospitalRoutes.js";
import availabilityRoutes from "./routes/availability.js";
import sourceRoutes from "./routes/sources.js";
import crawlerRoutes from "./routes/crawler.js";
import adminRoutes from "./routes/admin.js";
import alertRoutes from "./routes/alertRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import assistantRoutes from "./routes/assistantRoutes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // correct req.ip behind a proxy (for ipHash only)
  app.use(requestId);
  app.use(requestLogger);
  app.use(express.json({ limit: "100kb" }));

  // Shared, identical security posture for every variant (plan §4, §6).
  applySecurity(app);

  // Health (both /health and /api/v1/health style).
  app.use("/health", healthRouter);

  app.use("/api/auth", authRoutes);
  app.use("/api/hospitals", hospitalRoutes);
  // Facilities + availability are nested under a hospital id.
  app.use("/api/hospitals", availabilityRoutes);
  app.use("/api/sources", sourceRoutes);
  app.use("/api/crawler", crawlerRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/alerts", alertRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/assistant", assistantRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
