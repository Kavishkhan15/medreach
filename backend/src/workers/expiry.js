import { pathToFileURL } from "node:url";
import { startStandaloneWorker } from "../services/workerRuntime.js";
import { expireEmergencyRequests } from "../services/emergencyRequestExpiry.js";

export const expiryTasks = [{ type: "request.expiry", intervalMs: 60000,
  handler: async ({ assertLease }) => expireEmergencyRequests(new Date(), { assertLease }) }];
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startStandaloneWorker("expiry", expiryTasks).catch((error) => {
    console.error(JSON.stringify({ event: "worker_start_failed", role: "expiry", code: error.code || "WORKER_START_FAILED" })); process.exitCode = 1;
  });
}
