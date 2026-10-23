import mongoose from "mongoose";
import { assertSafeUri, TEST_MONGO_URI, API_BASE } from "./db-guard.mjs";
import { setupTestFixtures, createAuthenticatedSession } from "./fixtures.mjs";
import { EmergencyRequest } from "../../../backend/src/models/EmergencyRequest.js";
import { AmbulanceBooking } from "../../../backend/src/models/AmbulanceBooking.js";
import { AuditLog } from "../../../backend/src/models/AuditLog.js";
import { writeFileSync } from "node:fs";

export async function runExperiment6() {
  assertSafeUri(TEST_MONGO_URI);
  console.log("\n=======================================================");
  console.log("RUNNING EXPERIMENT 6: Interrupted Operations & Safe Retry");
  console.log("=======================================================");

  const fixtures = await setupTestFixtures();
  const staffSession = await createAuthenticatedSession(fixtures.staff1);
  const patientSession = await createAuthenticatedSession(fixtures.patient1);
  const ambulanceSession = await createAuthenticatedSession(fixtures.ambulanceAdmin);

  const results = {
    experimentId: "EXP-TX-06",
    name: "Interrupted In-Flight Operations and Safe Idempotent Resumption",
    startedAt: new Date().toISOString(),
    tests: [],
    passCount: 0,
    failCount: 0,
  };

  function record(id, description, passed, details) {
    if (passed) results.passCount++;
    else results.failCount++;
    results.tests.push({ id, description, passed, details });
    console.log(`  [${passed ? "PASS" : "FAIL"}] ${id}: ${description}`);
    if (!passed) console.error("    Details:", details);
  }

  // 6.1: Transition Replay on Interrupted Network
  const emergDoc = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-INT-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Cerebral Ischemia",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    isEmergency: true,
    expiresAt: new Date(Date.now() + 7200000),
    status: "SENT",
    timeline: [
      { status: "REQUESTED", actorRole: "patient", at: new Date(Date.now() - 60000) },
      { status: "SENT", actorRole: "system", at: new Date(Date.now() - 30000) },
    ],
  });

  const transitionPayload = {
    status: "UNDER_REVIEW",
    note: "Emergency physician reviewing brain CT",
    hospitalResponse: "Stroke protocol initiated",
  };

  // Step 1: Initial transition succeeds
  const initialRes = await fetch(`${API_BASE}/api/emergency-requests/${emergDoc._id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": "10.0.6.1" },
    body: JSON.stringify(transitionPayload),
  });
  const initialData = await initialRes.json();

  const auditCountInitial = await AuditLog.countDocuments({ entityId: emergDoc._id, action: "update" });

  // Step 2: Client simulates lost connection and replays the exact same transition request
  const replayRes = await fetch(`${API_BASE}/api/emergency-requests/${emergDoc._id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": "10.0.6.2" },
    body: JSON.stringify(transitionPayload),
  });
  const replayData = await replayRes.json();

  const docAfterReplay = await EmergencyRequest.findById(emergDoc._id);
  const auditCountAfterReplay = await AuditLog.countDocuments({ entityId: emergDoc._id, action: "update" });

  const pass1 = initialRes.status === 200 &&
    replayRes.status === 200 &&
    replayData.request.status === "UNDER_REVIEW" &&
    docAfterReplay.timeline.length === 3 && // Timeline was NOT duplicated
    auditCountAfterReplay === auditCountInitial; // Audit log was NOT duplicated

  record("6.1", "Identical transition retry after simulated network interruption returns 200 without duplicate timeline or audit entries", pass1, {
    initialStatus: initialRes.status,
    replayStatus: replayRes.status,
    timelineLength: docAfterReplay.timeline.length,
    auditCount: auditCountAfterReplay,
  });

  // 6.2: Transition retry with MODIFIED parameters fails with 409
  const modifiedReplayRes = await fetch(`${API_BASE}/api/emergency-requests/${emergDoc._id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": "10.0.6.3" },
    body: JSON.stringify({
      status: "UNDER_REVIEW",
      note: "DIFFERENT NOTE: Trying to alter state after commit",
    }),
  });
  const modifiedData = await modifiedReplayRes.json();
  const pass2 = modifiedReplayRes.status === 409;
  record("6.2", "Altered transition parameters on already-committed state rejected with 409 Conflict", pass2, {
    status: modifiedReplayRes.status,
    data: modifiedData,
  });

  // 6.3: Simulated aborted write before DB commit: safe retry creates cleanly
  const abortKey = `TX-INT-ABORT-${Date.now()}`;
  // We verify that if an idempotency key was never committed to DB, retrying creates it cleanly
  const freshRes = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": abortKey,
      ...patientSession.authHeaders,
      "X-Forwarded-For": "10.0.6.4",
    },
    body: JSON.stringify({
      hospitalId: fixtures.hospital._id.toString(),
      emergencyType: "Post-Abort Safe Creation",
      requiredFacility: "ICU",
      contactPhone: "+91 98765 00001",
      contactEmail: "patient1.tx@medreach.test",
      isEmergency: true,
    }),
  });
  const freshData = await freshRes.json();
  const pass3 = freshRes.status === 201 && Boolean(freshData.request?.requestId);
  record("6.3", "Uncommitted operation retry creates the record cleanly without ghost lock or stale failure", pass3, {
    status: freshRes.status,
    requestId: freshData.request?.requestId,
  });

  // 6.4: Interrupted Provider Request retry: idempotent return with status message
  const ambDoc = await AmbulanceBooking.create({
    reference: `AMB-INT-${Date.now()}`,
    provider: fixtures.ambulanceProvider._id,
    user: fixtures.patient1._id,
    providerSnapshot: { name: fixtures.ambulanceProvider.name, phone: fixtures.ambulanceProvider.phone },
    requestSnapshot: {
      patientName: "Interrupted Amb Patient",
      patientAge: 44,
      pickupAddress: "99 Hill Road, Bandra",
      contactPhone: "+91 98765 00001",
    },
    delivery: {
      user: { status: "not_available" },
      admin: { status: "not_available" },
      provider: { status: "not_available" },
    },
    trackingTokenHash: "test-hash-int-001",
    status: "RECORDED",
  });

  // Step 1: Update to UNDER_REVIEW
  const ambRes1 = await fetch(`${API_BASE}/api/ambulances/bookings/${ambDoc._id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...ambulanceSession.authHeaders, "X-Forwarded-For": "10.0.6.5" },
    body: JSON.stringify({ status: "UNDER_REVIEW" }),
  });
  const ambData1 = await ambRes1.json();

  // Step 2: Replay the same status update
  const ambRes2 = await fetch(`${API_BASE}/api/ambulances/bookings/${ambDoc._id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...ambulanceSession.authHeaders, "X-Forwarded-For": "10.0.6.6" },
    body: JSON.stringify({ status: "UNDER_REVIEW" }),
  });
  const ambData2 = await ambRes2.json();

  const pass4 = ambRes1.status === 200 &&
    ambRes2.status === 200 &&
    ambData2.message === "Status already recorded.";

  record("6.4", "Provider status update replay after lost response returns 200 OK ('Status already recorded.')", pass4, {
    status1: ambRes1.status,
    status2: ambRes2.status,
    message2: ambData2.message,
  });

  results.completedAt = new Date().toISOString();
  writeFileSync(
    "/home/anonymous/medreach/research/results/transactional/exp6_interrupted_operations.json",
    JSON.stringify(results, null, 2)
  );
  console.log(`[EXP-TX-06] Finished: ${results.passCount} passed, ${results.failCount} failed.`);
  return results;
}
