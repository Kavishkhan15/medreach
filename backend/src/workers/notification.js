import { pathToFileURL } from "node:url";
import { startStandaloneWorker } from "../services/workerRuntime.js";
import { flushQueuedEmails } from "../services/emailDeliveryWorker.js";

export const notificationTasks = [{ type: "notification.delivery", intervalMs: 1000,
  handler: async ({ assertLease }) => { await assertLease(); return flushQueuedEmails(); } }];
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startStandaloneWorker("notification", notificationTasks).catch((error) => {
    console.error(JSON.stringify({ event: "worker_start_failed", role: "notification", code: error.code || "WORKER_START_FAILED" })); process.exitCode = 1;
  });
}
