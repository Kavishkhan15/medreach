import { OperationalAlertReceipt } from "../models/OperationalAlertReceipt.js";
import { env } from "../config/env.js";
import { ResourceInventory } from "../models/ResourceInventory.js";
import { InventoryObservation } from "../models/InventoryObservation.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { EmailWebhookEvent } from "../models/EmailWebhookEvent.js";
import { EmergencyCoordination } from "../models/EmergencyCoordination.js";
import { RateLimitBucket } from "../models/RateLimitBucket.js";
import { PrivilegedSecurity, PrivilegedReauthentication } from "../models/PrivilegedSecurity.js";
import { DataExport } from "../models/DataExport.js";
import { EmergencyCoverage } from "../models/EmergencyCoverage.js";
import { OrganizationUsage } from "../models/OrganizationUsage.js";
import { ProviderGroup, ProviderOnboarding, ProviderOffboarding } from "../models/providerAdoptionModels.js";
import { HospitalEnrichment } from "../models/HospitalEnrichment.js";
import { BackendLatencyBucket } from "../models/BackendLatencyBucket.js";
import { DiagnosticRequest } from "../models/DiagnosticRequest.js";
import { ResourceReservation } from "../models/ResourceReservation.js";
import { DiagnosticDailyCapacity } from "../models/DiagnosticDailyCapacity.js";

// Startup verifies reviewed schema prerequisites; it never creates production
// collections or indexes. Uniqueness is part of the concurrency contract.
export async function verifyApiIndexes({ nodeEnv = env.nodeEnv } = {}) {
  if (nodeEnv !== "production") return;
  for (const Model of [ResourceInventory, InventoryObservation, EmailDelivery, EmailWebhookEvent, EmergencyCoordination, RateLimitBucket, PrivilegedSecurity, PrivilegedReauthentication, DataExport, EmergencyCoverage, OperationalAlertReceipt, OrganizationUsage, ProviderGroup, ProviderOnboarding, ProviderOffboarding, HospitalEnrichment, BackendLatencyBucket, DiagnosticRequest,
    ...(process.env.DIAGNOSTIC_CAPACITY_ENABLED === "true" ? [ResourceReservation, DiagnosticDailyCapacity] : [])]) {
    const existing = await Model.collection.indexes().catch(error => {
      if (error.code === 26) return [];
      throw error;
    });
    if(Model===OperationalAlertReceipt&&!existing.some(index=>index.key._id===1&&Object.keys(index.key).length===1&&(index.name==="_id_"||index.unique)))throw Object.assign(new Error("Operational alert receipt primary index missing"),{code:"API_INDEX_MISSING"});
    for (const [key, options] of Model.schema.indexes().filter(([, options]) => options.unique || options.expireAfterSeconds !== undefined)) {
      const requiredKeys = Object.entries(key);
      if (!existing.some(index => (!options.unique || index.unique) && Object.entries(index.key).length === requiredKeys.length
        && requiredKeys.every(([field, direction], position) => Object.entries(index.key)[position]?.[0] === field && index.key[field] === direction)
        && JSON.stringify(index.partialFilterExpression || {}) === JSON.stringify(options.partialFilterExpression || {})
        && Boolean(index.sparse) === Boolean(options.sparse)
        && (options.expireAfterSeconds === undefined || index.expireAfterSeconds === options.expireAfterSeconds))) {
        throw Object.assign(new Error(`Required index missing for ${Model.modelName}; apply the reviewed additive migration before startup`), { code: "API_INDEX_MISSING" });
      }
    }
  }
}
