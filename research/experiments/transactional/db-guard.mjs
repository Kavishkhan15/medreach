import mongoose from "mongoose";

export const TEST_PORT = 27018;
export const FORBIDDEN_PORT = 27017;
export const TEST_DB_NAME = "medreach_research_test";
export const TEST_MONGO_URI = `mongodb://127.0.0.1:${TEST_PORT}/${TEST_DB_NAME}`;
export const BACKEND_PORT = 4100;
export const API_BASE = `http://127.0.0.1:${BACKEND_PORT}`;

export function assertSafeUri(uri) {
  if (!uri) throw new Error("Database URI is required.");
  if (uri.includes(String(FORBIDDEN_PORT))) {
    throw new Error(`CRITICAL VIOLATION: Refusing to interact with forbidden port ${FORBIDDEN_PORT}!`);
  }
  if (!uri.includes(String(TEST_PORT))) {
    throw new Error(`CRITICAL VIOLATION: URI must strictly target port ${TEST_PORT}. Received: ${uri}`);
  }
  return true;
}

export async function verifyDatabaseIsolation() {
  assertSafeUri(TEST_MONGO_URI);
  console.log(`[db-guard] Connecting to isolation verification endpoint: ${TEST_MONGO_URI}`);
  const conn = await mongoose.connect(TEST_MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  const adminDb = conn.connection.db.admin();
  const status = await adminDb.serverStatus();

  console.log("[db-guard] Server status verification:", {
    host: status.host,
    process: status.process,
    pid: status.pid,
    version: status.version,
    activeConnections: status.connections?.current,
  });

  if (!status.host.includes(`:${TEST_PORT}`)) {
    await mongoose.disconnect();
    throw new Error(`CRITICAL: Connected host '${status.host}' does not match expected port ${TEST_PORT}!`);
  }

  console.log(`[db-guard] ISOLATION PROVEN: Successfully verified mongod is running on port ${TEST_PORT} (PID ${status.pid}).`);
  return { status, connection: conn };
}
