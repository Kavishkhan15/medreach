import { pathToFileURL } from "node:url";
import { startStandaloneWorker } from "../services/workerRuntime.js";
import { expireEmergencyRequests } from "../services/emergencyRequestExpiry.js";
import { expireCapacityHolds } from "../services/capacityExpiry.js";

export const expiryTasks = [{ type: "request.expiry", intervalMs: 60000,
  handler: async ({ assertLease }) => expireEmergencyRequests(new Date(), { assertLease }) },
  { type: "capacity.expiry", intervalMs: 30000, handler: async ({ assertLease }) => { await assertLease(); return expireCapacityHolds(); } }];
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startStandaloneWorker("expiry", expiryTasks).catch((error) => {
    console.error(JSON.stringify({ event: "worker_start_failed", role: "expiry", code: error.code || "WORKER_START_FAILED" })); process.exitCode = 1;
  });
}
