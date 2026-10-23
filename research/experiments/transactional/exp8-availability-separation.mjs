import mongoose from "mongoose";
import { assertSafeUri, TEST_MONGO_URI, API_BASE } from "./db-guard.mjs";
import { setupTestFixtures, createAuthenticatedSession } from "./fixtures.mjs";
import { EmergencyRequest } from "../../../backend/src/models/EmergencyRequest.js";
import { AvailabilityObservation } from "../../../backend/src/models/AvailabilityObservation.js";
import { AmbulanceBooking } from "../../../backend/src/models/AmbulanceBooking.js";
import { writeFileSync } from "node:fs";

export async function runExperiment8() {
  assertSafeUri(TEST_MONGO_URI);
  console.log("\n=======================================================");
  console.log("RUNNING EXPERIMENT 8: Availability Report vs Reservation Separation");
  console.log("=======================================================");

  const fixtures = await setupTestFixtures();
  const staffSession = await createAuthenticatedSession(fixtures.staff1);
  const patientSession = await createAuthenticatedSession(fixtures.patient1);

  const results = {
    experimentId: "EXP-TX-08",
    name: "Architectural Separation Between Observational Availability and Request Fulfillment",
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

  // 8.1: Record an initial availability observation (5 ICU beds)
  // Ensure existing observations are cleared for clean test
  await AvailabilityObservation.deleteMany({ hospital: fixtures.hospital._id });

  const recordObsRes = await fetch(`${API_BASE}/api/hospitals/${fixtures.hospital._id}/availability`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...staffSession.authHeaders,
      "X-Forwarded-For": "10.0.8.1",
    },
    body: JSON.stringify({
      facility: "ICU",
      status: "available",
      quantity: 5,
      observedAt: new Date().toISOString(),
    }),
  });
  const recordObsData = await recordObsRes.json();

  const getAvailRes1 = await fetch(`${API_BASE}/api/hospitals/${fixtures.hospital._id}/availability`, {
    headers: { "X-Forwarded-For": "10.0.8.2" },
  });
  const getAvailData1 = await getAvailRes1.json();

  const initialObsCount = await AvailabilityObservation.countDocuments({ hospital: fixtures.hospital._id });
  const initialObsDoc = await AvailabilityObservation.findOne({ hospital: fixtures.hospital._id, facility: "ICU" });

  const pass1 = recordObsRes.status === 201 &&
    initialObsCount === 1 &&
    initialObsDoc.quantity === 5;

  record("8.1", "Recorded initial availability observation (5 ICU beds) into append-only observation store", pass1, {
    status: recordObsRes.status,
    obsQuantity: initialObsDoc?.quantity,
    obsCount: initialObsCount,
  });

  // 8.2: Submit 10 Emergency Requests for ICU beds - Verify zero decrement to AvailabilityObservation
  const createdReqIds = [];
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `TX-KEY-AV-SEP-${i}-${Date.now()}`,
        ...patientSession.authHeaders,
        "X-Forwarded-For": `10.0.8.${10 + i}`,
      },
      body: JSON.stringify({
        hospitalId: fixtures.hospital._id.toString(),
        emergencyType: `ICU Triage Patient ${i}`,
        requiredFacility: "ICU",
        contactPhone: `+91 98765 000${i.toString().padStart(2, "0")}`,
        isEmergency: true,
      }),
    });
    const d = await res.json();
    if (d.request?._id) createdReqIds.push(d.request._id);
  }

  const obsAfter10Requests = await AvailabilityObservation.findOne({ hospital: fixtures.hospital._id, facility: "ICU" });
  const countAfter10Requests = await AvailabilityObservation.countDocuments({ hospital: fixtures.hospital._id });

  const pass2 = createdReqIds.length === 10 &&
    obsAfter10Requests.quantity === 5 &&
    countAfter10Requests === 1;

  record("8.2", "Submitting 10 emergency bed requests does NOT decrement reported availability (observations remain strictly observational)", pass2, {
    requestsSubmitted: createdReqIds.length,
    reportedQuantityBefore: 5,
    reportedQuantityAfter: obsAfter10Requests?.quantity,
    observationCountInDb: countAfter10Requests,
  });

  // 8.3: Transition requests to ACCEPTED - Verify zero decrement to AvailabilityObservation
  for (let i = 0; i < 3; i++) {
    await fetch(`${API_BASE}/api/emergency-requests/${createdReqIds[i]}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": `10.0.8.${30 + i}` },
      body: JSON.stringify({ status: "UNDER_REVIEW" }),
    });
    await fetch(`${API_BASE}/api/emergency-requests/${createdReqIds[i]}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": `10.0.8.${40 + i}` },
      body: JSON.stringify({ status: "ACCEPTED", hospitalResponse: "Bed allocated" }),
    });
  }

  const obsAfterAccepted = await AvailabilityObservation.findOne({ hospital: fixtures.hospital._id, facility: "ICU" });
  const pass3 = obsAfterAccepted.quantity === 5;

  record("8.3", "Accepting hospital bed requests does NOT deduct from AvailabilityObservation (no transactional lock/hold on reported capacity)", pass3, {
    acceptedCount: 3,
    reportedQuantityInDb: obsAfterAccepted?.quantity,
  });

  // 8.4: Transition requests to COMPLETED - Verify zero decrement to AvailabilityObservation
  for (let i = 0; i < 2; i++) {
    await fetch(`${API_BASE}/api/emergency-requests/${createdReqIds[i]}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": `10.0.8.${50 + i}` },
      body: JSON.stringify({ status: "COMPLETED", note: "Admitted to ICU" }),
    });
  }

  const obsAfterCompleted = await AvailabilityObservation.findOne({ hospital: fixtures.hospital._id, facility: "ICU" });
  const pass4 = obsAfterCompleted.quantity === 5;

  record("8.4", "Completing emergency admission does NOT alter AvailabilityObservation time-series ledger", pass4, {
    completedCount: 2,
    reportedQuantityInDb: obsAfterCompleted?.quantity,
  });

  // 8.5: Stale observation validation (> 30 minutes in the past is rejected)
  const staleObsRes = await fetch(`${API_BASE}/api/hospitals/${fixtures.hospital._id}/availability`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...staffSession.authHeaders,
      "X-Forwarded-For": "10.0.8.60",
    },
    body: JSON.stringify({
      facility: "ICU",
      status: "available",
      quantity: 3,
      observedAt: new Date(Date.now() - 45 * 60000).toISOString(), // 45 mins ago
    }),
  });
  const staleData = await staleObsRes.json();
  const pass5 = staleObsRes.status === 400 && staleData.error?.includes("observed within the last 30 minutes");

  record("8.5", "Stale availability reports (>30 min old) are rejected at ingestion boundary", pass5, {
    status: staleObsRes.status,
    error: staleData.error,
  });

  // 8.6: Explicit contract messaging: verify system responses confirm handoff, not guaranteed stock
  const ambRes = await fetch(`${API_BASE}/api/ambulances/book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `TX-KEY-AV-CONTRACT-${Date.now()}`,
      ...patientSession.authHeaders,
      "X-Forwarded-For": "10.0.8.70",
    },
    body: JSON.stringify({
      providerId: fixtures.ambulanceProvider._id.toString(),
      patientName: "Contract Test Patient",
      patientAge: 40,
      ambulanceRequired: true,
      bookingPickup: "500 Waterfield Road, Bandra",
      contactPhone: "+91 98765 00001",
    }),
  });
  const ambData = await ambRes.json();

  const bldRes = await fetch(`${API_BASE}/api/blood-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `TX-KEY-AV-CONTRACT-BLD-${Date.now()}`,
      ...patientSession.authHeaders,
      "X-Forwarded-For": "10.0.8.71",
    },
    body: JSON.stringify({
      type: "REQUEST",
      providerId: fixtures.bloodProvider._id.toString(),
      bloodBankName: fixtures.bloodProvider.name,
      bloodGroup: "O+",
      patientOrDonorName: "Contract Blood Patient",
      units: 1,
      urgency: "within 6 hours",
      isUrgent: true,
      contactPhone: "+91 98765 00001",
    }),
  });
  const bldData = await bldRes.json();

  const pass6 = ambData.recorded === true &&
    ambData.message?.includes("already recorded") || ambData.message?.includes("Contact the provider") ||
    bldData.message?.includes("Contact the blood bank to confirm inventory");

  record("8.6", "API response contracts explicitly classify submissions as requests requiring clinical confirmation rather than guaranteed reservations", pass6, {
    ambulanceRecorded: ambData.recorded,
    ambulanceMessage: ambData.message,
    bloodMessage: bldData.message,
  });

  results.completedAt = new Date().toISOString();
  writeFileSync(
    "/home/anonymous/medreach/research/results/transactional/exp8_availability_separation.json",
    JSON.stringify(results, null, 2)
  );
  console.log(`[EXP-TX-08] Finished: ${results.passCount} passed, ${results.failCount} failed.`);
  return results;
}
