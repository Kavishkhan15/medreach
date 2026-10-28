import { pathToFileURL } from "node:url";
import { startStandaloneWorker } from "../services/workerRuntime.js";
import { recoverRequestNotifications } from "../services/requestNotificationWorker.js";
import { reconcileEmergencyExpiryEffects } from "../services/emergencyRequestExpiry.js";

// Imports are resolved when the task runs, so a missing recovery implementation
// is a visible failed job rather than a silently disabled reliability feature.
export const recoveryTasks = [
  { type: "hospital.enrichment-drain", intervalMs: 30000, handler: async ({ assertLease, signal }) => {
    const { drainHospitalEnrichment } = await import("../services/hospitalEnrichmentWorkflow.js");
    await assertLease(); return drainHospitalEnrichment({ assertLease, signal, limit: 2 });
  } },
  { type: "provider.offboarding-recovery", intervalMs: 30000, handler: async ({ assertLease }) => {
    const { recoverProviderOffboarding } = await import("../services/providerAdoption.js");
    await assertLease(); return recoverProviderOffboarding({ limit: 25 });
  } },
  { type: "inventory.import-recovery", intervalMs: 30000, handler: async ({ assertLease }) => {
    const { recoverInventoryImports } = await import("../services/inventoryImport.js");
    await assertLease(); return recoverInventoryImports();
  } },
  { type: "provider.archive-recovery", intervalMs: 30000, handler: async ({ assertLease }) => {
    const { recoverProviderArchives } = await import("../services/providerLifecycle.js");
    await assertLease(); return recoverProviderArchives({ limit: 50 });
  } },
  { type: "operations.alert-delivery", intervalMs: 15000, handler: async ({ assertLease }) => {
    const { dispatchOperationalAlerts } = await import("../services/operationalAlerts.js");
    await assertLease(); return dispatchOperationalAlerts({ limit: 20, assertLease });
  } },
  { type: "operations.incidents", intervalMs: 30000, handler: async ({ assertLease }) => {
    const { refreshOperationalIncidents } = await import("../services/backendOperations.js");
    await assertLease(); return refreshOperationalIncidents();
  } },
  { type: "request.status-effects", intervalMs: 30000, handler: async ({ assertLease }) => {
    const { recoverRequestStatusEffects } = await import("../services/requestStatusEffects.js");
    await assertLease(); return recoverRequestStatusEffects({ limit: 25 });
  } },
  { type: "emergency.coordination", intervalMs: 30000, handler: async ({ assertLease }) => {
    const { reconcileEmergencyCoordination } = await import("../services/emergencyCoordination.js");
    await assertLease(); return reconcileEmergencyCoordination({ limit: 25 });
  } },
  { type: "notification.recovery", intervalMs: 30000, handler: async ({ assertLease }) => {
    await assertLease(); await recoverRequestNotifications(); return { checked: true };
  } },
  { type: "request.expiry-effects", intervalMs: 30000, handler: async ({ assertLease }) => reconcileEmergencyExpiryEffects({ assertLease }) },
  { type: "inventory.journal-recovery", intervalMs: 30000, handler: async ({ assertLease }) => {
    const { reconcileInventoryJournal } = await import("../services/inventoryService.js");
    await assertLease(); return reconcileInventoryJournal({ limit: 100 });
  } },
  { type: "notification.webhook-recovery", intervalMs: 30000, handler: async ({ assertLease }) => {
    const { reconcileWebhookEvents } = await import("../services/resendWebhook.js");
    await assertLease(); return reconcileWebhookEvents();
  } },
];
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startStandaloneWorker("recovery", recoveryTasks).catch((error) => {
    console.error(JSON.stringify({ event: "worker_start_failed", role: "recovery", code: error.code || "WORKER_START_FAILED" })); process.exitCode = 1;
  });
}
