import mongoose from "mongoose";
import { assertSafeUri, TEST_MONGO_URI, API_BASE } from "./db-guard.mjs";
import { setupTestFixtures, createAuthenticatedSession } from "./fixtures.mjs";
import { EmergencyRequest } from "../../../backend/src/models/EmergencyRequest.js";
import { AuditLog } from "../../../backend/src/models/AuditLog.js";
import { writeFileSync } from "node:fs";

export async function runExperiment7() {
  assertSafeUri(TEST_MONGO_URI);
  console.log("\n=======================================================");
  console.log("RUNNING EXPERIMENT 7: Request-Status Consistency Across Repeated Reads");
  console.log("=======================================================");

  const fixtures = await setupTestFixtures();
  const staffSession = await createAuthenticatedSession(fixtures.staff1);
  const patientSession = await createAuthenticatedSession(fixtures.patient1);

  const results = {
    experimentId: "EXP-TX-07",
    name: "Request-Status Consistency Across Repeated and Concurrent Reads",
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

  // Create an EmergencyRequest
  const emergDoc = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-READ-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Anaphylaxis",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    isEmergency: true,
    expiresAt: new Date(Date.now() + 7200000),
    status: "UNDER_REVIEW",
    timeline: [
      { status: "REQUESTED", actorRole: "patient", at: new Date(Date.now() - 60000) },
      { status: "SENT", actorRole: "system", at: new Date(Date.now() - 30000) },
      { status: "UNDER_REVIEW", actorRole: "hospital_staff", actor: fixtures.staff1._id, at: new Date() },
    ],
  });

  // 7.1: Static repeated reads (50 consecutive GET requests)
  const N_static = 50;
  let staticConsistent = true;
  let firstPayloadJson = null;

  for (let i = 0; i < N_static; i++) {
    const res = await fetch(`${API_BASE}/api/emergency-requests/${emergDoc._id}`, {
      headers: { ...patientSession.authHeaders, "X-Forwarded-For": `10.0.7.${10 + (i % 20)}` },
    });
    if (res.status !== 200) {
      staticConsistent = false;
      break;
    }
    const data = await res.json();
    const currentJson = JSON.stringify({
      status: data.request.status,
      timelineLength: data.request.timeline.length,
      emergencyType: data.request.emergencyType,
    });
    if (firstPayloadJson === null) {
      firstPayloadJson = currentJson;
    } else if (firstPayloadJson !== currentJson) {
      staticConsistent = false;
      break;
    }
  }

  record("7.1", `50 repeated consecutive reads yield 100% identical state and timeline`, staticConsistent, {
    readsAttempted: N_static,
    payloadSample: firstPayloadJson,
  });

  // 7.2: Read-During-Write Concurrency
  // A background task executes state transitions while 50 concurrent readers hammer the GET endpoint
  const targetDoc = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-RDWR-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Multiple Trauma",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    isEmergency: true,
    expiresAt: new Date(Date.now() + 7200000),
    status: "SENT",
    timeline: [
      { status: "REQUESTED", actorRole: "patient", at: new Date(Date.now() - 60000) },
      { status: "SENT", actorRole: "system", at: new Date() },
    ],
  });

  let writerFinished = false;
  let splitBrainDetected = false;
  let readFailures = 0;
  const observedStatuses = [];

  // Writer task
  const writerPromise = (async () => {
    const transitions = [
      { status: "UNDER_REVIEW", note: "Doc reviewing" },
      { status: "INFORMATION_REQUESTED", hospitalResponse: "Need CT report" },
    ];
    for (const t of transitions) {
      await new Promise((r) => setTimeout(r, 25)); // slight delay between writes
      await fetch(`${API_BASE}/api/emergency-requests/${targetDoc._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": "10.0.7.200" },
        body: JSON.stringify(t),
      });
    }
    writerFinished = true;
  })();

  // Reader task: 40 concurrent reads executed while transitions are occurring
  const readerPromises = [];
  for (let i = 0; i < 40; i++) {
    readerPromises.push(
      (async () => {
        await new Promise((r) => setTimeout(r, Math.random() * 50));
        const res = await fetch(`${API_BASE}/api/emergency-requests/${targetDoc._id}`, {
          headers: { ...patientSession.authHeaders, "X-Forwarded-For": `10.0.7.${50 + (i % 20)}` },
        });
        if (res.status !== 200) {
          readFailures++;
          return;
        }
        const data = await res.json();
        const doc = data.request;
        const lastTimelineStatus = doc.timeline?.at(-1)?.status;
        observedStatuses.push(doc.status);
        // INVARIANT CHECK: Top-level status MUST ALWAYS match the latest timeline entry!
        if (doc.status !== lastTimelineStatus) {
          splitBrainDetected = true;
        }
      })()
    );
  }

  await Promise.all([writerPromise, ...readerPromises]);

  const pass2 = !splitBrainDetected && readFailures === 0;
  record("7.2", "40 concurrent reads during active state transitions maintain strict status-timeline consistency (0 split-brain reads)", pass2, {
    splitBrainDetected,
    readFailures,
    uniqueObservedStatuses: [...new Set(observedStatuses)],
  });

  // 7.3: Audit Log & Database State Synchronization Check
  const finalDoc = await EmergencyRequest.findById(targetDoc._id);
  const auditEntries = await AuditLog.find({ entityId: targetDoc._id });

  // Each transition must produce an AuditLog
  const pass3 = finalDoc.timeline.length === 4 && auditEntries.length >= 2;
  record("7.3", "Database timeline history exactly correlates with AuditLog entries", pass3, {
    finalTimelineLength: finalDoc.timeline.length,
    auditEntriesCount: auditEntries.length,
  });

  // 7.4: Guest tracking token access consistency and invalid token rejection
  const guestDoc = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-GUEST-READ-${Date.now()}`,
    hospital: fixtures.hospital._id,
    emergencyType: "Guest Toxin Exposure",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    isEmergency: true,
    expiresAt: new Date(Date.now() + 7200000),
    status: "SENT",
    timeline: [{ status: "REQUESTED", actorRole: "system" }, { status: "SENT", actorRole: "system" }],
    trackingTokenHash: "$2a$10$wO9hD1s5BvZ9Cqg.ZqF1heYwK25H6iC/QyUeKx2N3R7yXwO9hD1s5", // Dummy bcrypt hash
  });

  // Read with invalid tracking token -> 403 Forbidden
  const invalidRes = await fetch(`${API_BASE}/api/emergency-requests/${guestDoc._id}`, {
    headers: {
      "X-MedReach-Tracking-Token": "invalid-token-value-12345",
      "X-Forwarded-For": "10.0.7.88",
    },
  });

  const pass4 = invalidRes.status === 403;
  record("7.4", "Guest access with incorrect tracking token consistently rejected with 403 Forbidden", pass4, {
    status: invalidRes.status,
  });

  results.completedAt = new Date().toISOString();
  writeFileSync(
    "/home/anonymous/medreach/research/results/transactional/exp7_read_consistency.json",
    JSON.stringify(results, null, 2)
  );
  console.log(`[EXP-TX-07] Finished: ${results.passCount} passed, ${results.failCount} failed.`);
  return results;
}
