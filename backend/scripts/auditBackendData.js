import mongoose from "mongoose";
import { auditBackendData, assertLocalAuditTarget } from "../src/services/dataQualityAudit.js";

// Deliberately avoids env.js and application models: no remote fallback or index writes.
const uri = process.env.MEDREACH_AUDIT_MONGO_URI || "mongodb://127.0.0.1:27017/medreach";
let client;
try {
  const database = assertLocalAuditTarget(uri);
  client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 2, readPreference: "primary", appName: "medreach-read-only-audit" });
  await client.connect();
  console.log(JSON.stringify(await auditBackendData(client.db(database)), null, 2));
} catch {
  console.error("Read-only local audit unavailable. Verify the explicit local target and read permissions. No records were changed.");
  process.exitCode = 1;
} finally { await client?.close(); }
