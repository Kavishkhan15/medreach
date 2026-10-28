// Builds the Express app WITHOUT connecting to the DB or listening.
// Exported so tests can import it with supertest. server.js wires DB + listen.

import express from "express";
import { env } from "./config/env.js";
import { applySecurity } from "./middleware/security.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/logging.js";
import { publicCompression } from "./middleware/publicCompression.js";

import { providerAccountRouter, providerRouter, providerApprovalRouter } from "./routes/providerAdmin.js";
import healthRouter from "./routes/health.js";
import authRoutes from "./routes/authRoutes.js";
import hospitalRoutes from "./routes/hospitalRoutes.js";
import availabilityRoutes from "./routes/availability.js";
import adminRoutes from "./routes/admin.js";
import alertRoutes from "./routes/alertRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import assistantRoutes from "./routes/assistantRoutes.js";
import hospitalAdminRoutes from "./routes/hospitalAdmin.js";
import emergencyRequestRoutes from "./routes/emergencyRequests.js";
import { resourceRouter, resourceAdminRouter } from "./routes/resources.js";
import { jobsRouter, applicationsRouter } from "./routes/careers.js";
import { organizationCareersRouter, orgApplicationsRouter } from './routes/organizationCareers.js';
import routingRouter from "./routes/routing.js";
import analyticsRouter from "./routes/analytics.js";
import emailRouter from "./routes/email.js";
import refinementRouter from "./routes/refinement.js";
import bloodCampaignRoutes from "./routes/bloodCampaignRoutes.js";
import bloodRequestRoutes from "./routes/bloodRequestRoutes.js";
import trackingRouter from "./routes/tracking.js";
import inventoryRouter from "./routes/inventory.js";
import { resendWebhookRouter } from "./routes/resendWebhook.js";
import emergencyCoordinationRouter from "./routes/emergencyCoordination.js";
import backendOperationsRouter from "./routes/backendOperations.js";
import inventoryImportsRouter from "./routes/inventoryImports.js";
import privacyRouter from "./routes/privacy.js";
import { validateMfaConfiguration } from "./config/mfaPolicy.js";
import integrationsRouter from "./routes/integrations.js";
import contractsRouter from "./routes/contracts.js";
import providerAdoptionRouter from "./routes/providerAdoption.js";
import hospitalEnrichmentRouter from "./routes/hospitalEnrichment.js";
import backendMetricsRouter from "./routes/backendMetrics.js";

export function createApp(options = {}) {
  validateMfaConfiguration();
  const app = express();
  app.set("trust proxy", env.trustProxy);
  app.use(requestId);
  app.use(requestLogger);
  // Shared, identical security posture for every variant (plan §4, §6).
  applySecurity(app, options);
  app.use(publicCompression());
  // The signature covers the exact bytes; mount before the general JSON parser.
  app.use("/api/webhooks/resend", resendWebhookRouter);
  app.use(express.json({ limit: "6mb" }));

  // Health (both /health and /api/v1/health style).
  app.use("/health", healthRouter);

  app.use("/api/auth", authRoutes);
  app.use("/api/hospitals", hospitalRoutes);
  app.use("/api/admin/hospital-enrichment", hospitalEnrichmentRouter);
  app.use("/api/admin/backend-metrics", backendMetricsRouter);
  // Facilities + availability are nested under a hospital id.
  app.use("/api/hospitals", availabilityRoutes);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/provider-imports", inventoryImportsRouter);
  app.use("/api/privacy", privacyRouter);
  app.use("/api/integrations", integrationsRouter);
  app.use("/api/contracts", contractsRouter);
  app.use("/api/provider-adoption", providerAdoptionRouter);
  app.use("/api/admin/provider-accounts", providerAccountRouter);
  app.use("/api/admin/provider-approvals", providerApprovalRouter);
  app.use("/api/providers", providerRouter);
  app.use("/api/admin", adminRoutes);
  app.use("/api/alerts", alertRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/assistant", assistantRoutes);
  app.use("/api/hospital-admin", hospitalAdminRoutes);
  app.use("/api/emergency-requests", emergencyRequestRoutes);
  app.use("/api/emergency-coordination", emergencyCoordinationRouter);
  app.use("/api/admin/backend", backendOperationsRouter);
  app.use("/api/tracking", trackingRouter);
  app.use("/api/blood-banks/campaigns", bloodCampaignRoutes);
  app.use("/api/blood-campaigns", bloodCampaignRoutes);
  app.use("/api/blood-requests", bloodRequestRoutes);
  app.use("/api/blood-banks", resourceRouter("blood_bank"));
  app.use("/api/diagnostics", resourceRouter("diagnostic"));
  app.use("/api/ambulances", resourceRouter("ambulance"));
  app.use("/api/admin/resources", resourceAdminRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/applications", applicationsRouter);
  app.use('/api/organizations', organizationCareersRouter);
  app.use('/api/organization-applications', orgApplicationsRouter);
  app.use("/api/routing", routingRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/email", emailRouter);
  app.use("/api/admin/refinement", refinementRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
