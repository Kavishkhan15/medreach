// Entry point: connect DB, then start the HTTP server.
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";

const app = createApp();

connectDB()
  .then(() => {
    app.listen(env.port, () =>
      console.log(`[medreach] API listening on :${env.port} (${env.nodeEnv})`)
    );
  })
  .catch((err) => {
    console.error("[medreach] Failed to start — is MongoDB running?\n", err.message);
    process.exit(1);
  });
