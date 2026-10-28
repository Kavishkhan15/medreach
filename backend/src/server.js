// Entry point: connect DB, then start the HTTP server.
import { createApp } from "./app.js";
import { connectDB, disconnectDB, enableDatabaseTelemetry } from "./config/db.js";
import { env } from "./config/env.js";
import { registerGracefulShutdown } from "./services/gracefulShutdown.js";
import { setEmailQueueEnabled } from "./services/emailService.js";
import { verifyApiIndexes } from "./services/productionIndexes.js";

const app = createApp();

connectDB()
  .then(async () => {
    await verifyApiIndexes();
    enableDatabaseTelemetry();
    setEmailQueueEnabled(true);
    const server = app.listen(env.port, "0.0.0.0", () =>
      console.log(`[medreach] API listening on :${env.port} (${env.nodeEnv})`)
    );
    registerGracefulShutdown({ server, onStart: () => { app.locals.shuttingDown = true; },
      stopWorkers: async () => {},
      disconnect: disconnectDB });
  })
  .catch((err) => {
    console.error("[medreach] Failed to start — is MongoDB running?\n", err.message);
    process.exit(1);
  });
