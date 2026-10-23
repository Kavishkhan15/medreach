import mongoose from "mongoose";
import { assertSafeUri, TEST_MONGO_URI, API_BASE } from "./db-guard.mjs";
import { setupTestFixtures, createAuthenticatedSession } from "./fixtures.mjs";
import { EmergencyRequest } from "../../../backend/src/models/EmergencyRequest.js";
import { AmbulanceBooking } from "../../../backend/src/models/AmbulanceBooking.js";
import { BloodRequest } from "../../../backend/src/models/BloodRequest.js";
import { AuditLog } from "../../../backend/src/models/AuditLog.js";
import { writeFileSync } from "node:fs";

export async function runExperiment3() {
  assertSafeUri(TEST_MONGO_URI);
  console.log("\n=======================================================");
  console.log("RUNNING EXPERIMENT 3: Concurrent Requests & Optimistic Concurrency");
  console.log("=======================================================");

  const fixtures = await setupTestFixtures();
  const staffSession1 = await createAuthenticatedSession(fixtures.staff1);
  const staffSession2 = await createAuthenticatedSession(fixtures.staff2);
  const patientSession = await createAuthenticatedSession(fixtures.patient1);
  const ambulanceSession = await createAuthenticatedSession(fixtures.ambulanceAdmin);

  const results = {
    experimentId: "EXP-TX-03",
    name: "Concurrent Requests Competing for State Mutations & Resources",
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

  // Setup: Create an EmergencyRequest in UNDER_REVIEW status
  const emergDoc = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-CONCUR-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Cardiac Tamponade",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    contactEmail: "patient1.tx@medreach.test",
    isEmergency: true,
    expiresAt: new Date(Date.now() + 7200000),
    status: "UNDER_REVIEW",
    timeline: [
      { status: "REQUESTED", actorRole: "patient", at: new Date(Date.now() - 300000) },
      { status: "SENT", actorRole: "system", at: new Date(Date.now() - 240000) },
      { status: "UNDER_REVIEW", actorRole: "hospital_staff", actor: fixtures.staff1._id, at: new Date(Date.now() - 120000) },
    ],
  });

  const initialTimelineLength = emergDoc.timeline.length; // 3

  // 3.1: Fire N=10 simultaneous competing PATCH requests on EmergencyRequest
  // 5 try to ACCEPT, 5 try to REQUEST_INFORMATION
  const N = 10;
  console.log(`  Firing ${N} simultaneous conflicting PATCH requests on EmergencyRequest ${emergDoc.requestId}...`);

  const promises = [];
  for (let i = 0; i < N; i++) {
    const isAccept = i % 2 === 0;
    const session = i % 2 === 0 ? staffSession1 : staffSession2;
    const body = isAccept
      ? { status: "ACCEPTED", note: `Bed reserved by staff ${i}`, hospitalResponse: "Report to ED immediately" }
      : { status: "INFORMATION_REQUESTED", note: `Need vitals from staff ${i}`, hospitalResponse: "Please upload ECG" };

    promises.push(
      fetch(`${API_BASE}/api/emergency-requests/${emergDoc._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...session.authHeaders,
          "X-Forwarded-For": `10.0.3.${10 + i}`,
        },
        body: JSON.stringify(body),
      }).then(async (res) => ({
        index: i,
        status: res.status,
        body: await res.json(),
      }))
    );
  }

  const patchResults = await Promise.all(promises);

  const statusDistribution = patchResults.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const successCount = statusDistribution[200] || 0;
  const conflictCount = statusDistribution[409] || 0;

  // Verify in MongoDB: Exactly 1 transition was applied
  const finalEmergDoc = await EmergencyRequest.findById(emergDoc._id);
  const finalTimelineLength = finalEmergDoc.timeline.length;

  const pass1 = successCount === 1 &&
    conflictCount === (N - 1) &&
    finalTimelineLength === (initialTimelineLength + 1);

  record("3.1", `N=${N} simultaneous EmergencyRequest transitions: exactly 1 wins (200 OK), ${N - 1} fail with 409 Conflict`, pass1, {
    N,
    statusDistribution,
    initialTimelineLength,
    finalTimelineLength,
    finalStatus: finalEmergDoc.status,
  });

  // 3.2: Verify timeline integrity & AuditLog integrity after concurrency race
  const auditLogs = await AuditLog.find({
    entityId: emergDoc._id,
    action: "update",
  });

  const pass2 = finalEmergDoc.timeline.length === 4 &&
    ["ACCEPTED", "INFORMATION_REQUESTED"].includes(finalEmergDoc.status) &&
    auditLogs.length === 1;

  record("3.2", "Optimistic concurrency preserves timeline integrity without duplicate or phantom steps", pass2, {
    timelineEntries: finalEmergDoc.timeline.map((t) => ({ status: t.status, role: t.actorRole, note: t.note })),
    auditLogCount: auditLogs.length,
  });

  // 3.3: Concurrent status updates on AmbulanceBooking (Provider Request concurrency)
  // We fire conflicting transitions: 4 attempt CONFIRMED, 4 attempt CANCELLED from UNDER_REVIEW state
  const ambDoc = await AmbulanceBooking.create({
    reference: `AMB-CONCUR-${Date.now()}`,
    provider: fixtures.ambulanceProvider._id,
    user: fixtures.patient1._id,
    providerSnapshot: { name: fixtures.ambulanceProvider.name, phone: fixtures.ambulanceProvider.phone },
    requestSnapshot: {
      patientName: "Concurrent Patient",
      patientAge: 50,
      pickupAddress: "123 Bandra West",
      contactPhone: "+91 98765 00001",
    },
    status: "UNDER_REVIEW",
    delivery: {
      user: { status: "not_available" },
      admin: { status: "not_available" },
      provider: { status: "not_available" },
    },
    trackingTokenHash: "test-tracking-hash-concur-001",
  });

  const N_amb = 8;
  console.log(`  Firing ${N_amb} simultaneous conflicting PATCH requests on AmbulanceBooking ${ambDoc.reference}...`);
  const ambPromises = [];
  for (let i = 0; i < N_amb; i++) {
    const targetStatus = i % 2 === 0 ? "CONFIRMED" : "CANCELLED";
    ambPromises.push(
      fetch(`${API_BASE}/api/ambulances/bookings/${ambDoc._id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...ambulanceSession.authHeaders,
          "X-Forwarded-For": `10.0.3.${30 + i}`,
        },
        body: JSON.stringify({ status: targetStatus }),
      }).then(async (res) => ({
        index: i,
        status: res.status,
        body: await res.json(),
        targetStatus,
      }))
    );
  }

  const ambResults = await Promise.all(ambPromises);
  const ambDistribution = ambResults.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const ambDocFinal = await AmbulanceBooking.findById(ambDoc._id);
  // When conflicting transitions compete, the losing branch encounters 409 (transition unavailable or concurrent update)
  const winningBranch = ambDocFinal.status; // either CONFIRMED or CANCELLED
  const passAmb = (ambDistribution[409] || 0) >= 4 && // losing branch must be rejected
    ["CONFIRMED", "CANCELLED"].includes(winningBranch);

  record("3.3", `N=${N_amb} simultaneous conflicting AmbulanceBooking updates: OCC isolates branches with 409s and commits valid terminal status`, passAmb, {
    N: N_amb,
    distribution: ambDistribution,
    finalStatus: ambDocFinal.status,
    winningBranch,
  });

  // 3.4: Concurrent creation requests for the SAME reported resource
  // Hospital reports 1 ICU bed available. N=10 simultaneous emergency requests are submitted.
  const N_creation = 10;
  console.log(`  Firing ${N_creation} simultaneous emergency requests for the same hospital...`);
  const creationPromises = [];
  for (let i = 0; i < N_creation; i++) {
    const payload = {
      hospitalId: fixtures.hospital._id.toString(),
      emergencyType: `Concurrent Patient Emergency #${i}`,
      requiredFacility: "ICU",
      contactPhone: `+91 98765 000${i.toString().padStart(2, "0")}`,
      contactEmail: `patient${i}.tx@medreach.test`,
      isEmergency: true,
    };

    creationPromises.push(
      fetch(`${API_BASE}/api/emergency-requests/emergency`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `TX-KEY-CONCUR-CREATE-${i}-${Date.now()}`,
          "X-Forwarded-For": `10.0.4.${10 + i}`,
        },
        body: JSON.stringify(payload),
      }).then(async (res) => ({
        index: i,
        status: res.status,
        body: await res.json(),
      }))
    );
  }

  const creationResults = await Promise.all(creationPromises);
  const creationDistribution = creationResults.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const createdCount = creationDistribution[201] || 0;
  const uniqueRequestIds = new Set(
    creationResults.filter((r) => r.body.request?.requestId).map((r) => r.body.request.requestId)
  );

  const passCreation = createdCount === N_creation && uniqueRequestIds.size === N_creation;

  record("3.4", `N=${N_creation} simultaneous requests created successfully (triage queueing, non-blocking ingestion)`, passCreation, {
    N: N_creation,
    createdCount,
    uniqueRequestIdsCount: uniqueRequestIds.size,
    distribution: creationDistribution,
  });

  results.completedAt = new Date().toISOString();
  writeFileSync(
    "/home/anonymous/medreach/research/results/transactional/exp3_concurrent_requests.json",
    JSON.stringify(results, null, 2)
  );
  console.log(`[EXP-TX-03] Finished: ${results.passCount} passed, ${results.failCount} failed.`);
  return results;
}
