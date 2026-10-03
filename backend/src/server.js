// Entry point: connect DB, then start the HTTP server.
import { createApp } from "./app.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { startCrawlerScheduler, stopCrawlerScheduler } from "./services/crawlerScheduler.js";
import { startEmergencyRequestExpiryWorker, stopEmergencyRequestExpiryWorker } from "./services/emergencyRequestExpiry.js";
import { drainWorkers, registerGracefulShutdown } from "./services/gracefulShutdown.js";

const app = createApp();

connectDB()
  .then(() => {
    startCrawlerScheduler();
    startEmergencyRequestExpiryWorker();
    const server = app.listen(env.port, () =>
      console.log(`[medreach] API listening on :${env.port} (${env.nodeEnv})`)
    );
    registerGracefulShutdown({ server, onStart: () => { app.locals.shuttingDown = true; },
      stopWorkers: () => drainWorkers([stopCrawlerScheduler, stopEmergencyRequestExpiryWorker]),
      disconnect: disconnectDB });
  })
  .catch((err) => {
    console.error("[medreach] Failed to start — is MongoDB running?\n", err.message);
    process.exit(1);
  });
