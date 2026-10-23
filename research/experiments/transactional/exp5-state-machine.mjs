import mongoose from "mongoose";
import { assertSafeUri, TEST_MONGO_URI, API_BASE } from "./db-guard.mjs";
import { setupTestFixtures, createAuthenticatedSession } from "./fixtures.mjs";
import { EmergencyRequest } from "../../../backend/src/models/EmergencyRequest.js";
import { BloodRequest } from "../../../backend/src/models/BloodRequest.js";
import { AmbulanceBooking } from "../../../backend/src/models/AmbulanceBooking.js";
import { writeFileSync } from "node:fs";

export async function runExperiment5() {
  assertSafeUri(TEST_MONGO_URI);
  console.log("\n=======================================================");
  console.log("RUNNING EXPERIMENT 5: State Machine Lifecycle Transitions");
  console.log("=======================================================");

  const fixtures = await setupTestFixtures();
  const staffSession = await createAuthenticatedSession(fixtures.staff1);
  const patientSession = await createAuthenticatedSession(fixtures.patient1);
  const unrelatedSession = await createAuthenticatedSession(fixtures.patient2);
  const bloodSession = await createAuthenticatedSession(fixtures.bloodAdmin);
  const ambulanceSession = await createAuthenticatedSession(fixtures.ambulanceAdmin);

  const results = {
    experimentId: "EXP-TX-05",
    name: "Documented State Machine Transitions and RBAC Enforcement",
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

  // 5.1: EmergencyRequest Full Happy Path:
  // Submit -> SENT -> UNDER_REVIEW -> INFORMATION_REQUESTED -> UNDER_REVIEW (patient) -> ACCEPTED -> COMPLETED
  const createRes = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `TX-SM-HAPPY-${Date.now()}`,
      ...patientSession.authHeaders,
      "X-Forwarded-For": "10.0.5.1",
    },
    body: JSON.stringify({
      hospitalId: fixtures.hospital._id.toString(),
      emergencyType: "Acute Abdomen",
      requiredFacility: "ICU",
      contactPhone: "+91 98765 00001",
      contactEmail: "patient1.tx@medreach.test",
      isEmergency: true,
    }),
  });
  const createData = await createRes.json();
  const reqId = createData.request._id;

  // Step A: Hospital staff moves to UNDER_REVIEW
  const stepARes = await fetch(`${API_BASE}/api/emergency-requests/${reqId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": "10.0.5.2" },
    body: JSON.stringify({ status: "UNDER_REVIEW", note: "Triage physician evaluating" }),
  });
  const stepAData = await stepARes.json();

  // Step B: Hospital staff requests information
  const stepBRes = await fetch(`${API_BASE}/api/emergency-requests/${reqId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": "10.0.5.3" },
    body: JSON.stringify({
      status: "INFORMATION_REQUESTED",
      hospitalResponse: "Please specify prior surgical history and allergies.",
    }),
  });
  const stepBData = await stepBRes.json();

  // Step C: Patient replies with required information -> moves to UNDER_REVIEW
  const stepCRes = await fetch(`${API_BASE}/api/emergency-requests/${reqId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...patientSession.authHeaders, "X-Forwarded-For": "10.0.5.4" },
    body: JSON.stringify({
      status: "UNDER_REVIEW",
      note: "No prior abdominal surgeries. Penicillin allergy.",
    }),
  });
  const stepCData = await stepCRes.json();

  // Step D: Hospital staff accepts request
  const stepDRes = await fetch(`${API_BASE}/api/emergency-requests/${reqId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": "10.0.5.5" },
    body: JSON.stringify({
      status: "ACCEPTED",
      hospitalResponse: "Bed allocated in surgical ICU. Transport en route.",
    }),
  });
  const stepDData = await stepDRes.json();

  // Step E: Hospital staff marks COMPLETED
  const stepERes = await fetch(`${API_BASE}/api/emergency-requests/${reqId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": "10.0.5.6" },
    body: JSON.stringify({
      status: "COMPLETED",
      note: "Patient admitted to surgical ICU bed 4.",
    }),
  });
  const stepEData = await stepERes.json();

  const finalHappyDoc = await EmergencyRequest.findById(reqId);
  const passHappy = createRes.status === 201 &&
    stepARes.status === 200 && stepAData.request.status === "UNDER_REVIEW" &&
    stepBRes.status === 200 && stepBData.request.status === "INFORMATION_REQUESTED" &&
    stepCRes.status === 200 && stepCData.request.status === "UNDER_REVIEW" &&
    stepDRes.status === 200 && stepDData.request.status === "ACCEPTED" &&
    stepERes.status === 200 && stepEData.request.status === "COMPLETED" &&
    finalHappyDoc.timeline.length >= 6;

  record("5.1", "Full EmergencyRequest happy path: REQUESTED -> SENT -> UNDER_REVIEW -> INFORMATION_REQUESTED -> UNDER_REVIEW -> ACCEPTED -> COMPLETED", passHappy, {
    statuses: [createData.request.status, stepAData.request?.status, stepBData.request?.status, stepCData.request?.status, stepDData.request?.status, stepEData.request?.status],
    timelineLength: finalHappyDoc.timeline.length,
  });

  // 5.2: Rejection Path: UNDER_REVIEW -> REJECTED
  const reqRej = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-SM-REJ-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Complex Neurotrauma",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    isEmergency: true,
    expiresAt: new Date(Date.now() + 7200000),
    status: "UNDER_REVIEW",
    timeline: [
      { status: "REQUESTED", actorRole: "patient", at: new Date() },
      { status: "UNDER_REVIEW", actorRole: "hospital_staff", actor: fixtures.staff1._id, at: new Date() },
    ],
  });

  const rejRes = await fetch(`${API_BASE}/api/emergency-requests/${reqRej._id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": "10.0.5.7" },
    body: JSON.stringify({
      status: "REJECTED",
      hospitalResponse: "Neuro ICU currently at full census; diversion active.",
    }),
  });
  const rejData = await rejRes.json();
  const passRej = rejRes.status === 200 && rejData.request.status === "REJECTED";
  record("5.2", "EmergencyRequest rejection path: UNDER_REVIEW -> REJECTED", passRej, {
    status: rejRes.status,
    finalStatus: rejData.request?.status,
  });

  // 5.3: Patient Cancellation Path: UNDER_REVIEW -> CANCELLED
  const reqCancel = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-SM-CAN-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Fever and Dehydration",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    isEmergency: true,
    expiresAt: new Date(Date.now() + 7200000),
    status: "UNDER_REVIEW",
    timeline: [
      { status: "REQUESTED", actorRole: "patient", at: new Date() },
      { status: "UNDER_REVIEW", actorRole: "hospital_staff", actor: fixtures.staff1._id, at: new Date() },
    ],
  });

  const cancelRes = await fetch(`${API_BASE}/api/emergency-requests/${reqCancel._id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...patientSession.authHeaders, "X-Forwarded-For": "10.0.5.8" },
    body: JSON.stringify({
      status: "CANCELLED",
      note: "Patient admitted to another facility privately.",
    }),
  });
  const cancelData = await cancelRes.json();
  const passCancel = cancelRes.status === 200 && cancelData.request.status === "CANCELLED";
  record("5.3", "EmergencyRequest patient cancellation path: UNDER_REVIEW -> CANCELLED", passCancel, {
    status: cancelRes.status,
    finalStatus: cancelData.request?.status,
  });

  // 5.4: Unauthorized Access & State Machine Guards
  // Scenario A: Unrelated user attempts to mutate request
  const unauthRes = await fetch(`${API_BASE}/api/emergency-requests/${reqRej._id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...unrelatedSession.authHeaders, "X-Forwarded-For": "10.0.5.9" },
    body: JSON.stringify({ status: "ACCEPTED" }),
  });

  // Scenario B: Staff requests info without providing note or hospitalResponse
  const reqInfoMissing = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-SM-INFO-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Abdominal Pain",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    isEmergency: true,
    expiresAt: new Date(Date.now() + 7200000),
    status: "UNDER_REVIEW",
    timeline: [{ status: "REQUESTED", actorRole: "patient" }, { status: "UNDER_REVIEW", actorRole: "hospital_staff" }],
  });

  const emptyInfoRes = await fetch(`${API_BASE}/api/emergency-requests/${reqInfoMissing._id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...staffSession.authHeaders, "X-Forwarded-For": "10.0.5.10" },
    body: JSON.stringify({ status: "INFORMATION_REQUESTED", note: "", hospitalResponse: "" }),
  });

  // Scenario C: Patient attempts staff-only status (e.g. ACCEPTED)
  const patientStaffRes = await fetch(`${API_BASE}/api/emergency-requests/${reqInfoMissing._id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...patientSession.authHeaders, "X-Forwarded-For": "10.0.5.11" },
    body: JSON.stringify({ status: "ACCEPTED" }),
  });

  const passGuards = unauthRes.status === 403 &&
    emptyInfoRes.status === 400 &&
    patientStaffRes.status === 403;

  record("5.4", "RBAC & payload validation guards enforced on state transitions (403/400)", passGuards, {
    unrelatedStatus: unauthRes.status,
    emptyInfoStatus: emptyInfoRes.status,
    patientStaffStatus: patientStaffRes.status,
  });

  // 5.5: BloodRequest transitions: REQUESTED -> CONFIRMED -> COMPLETED
  const bloodDoc = await BloodRequest.create({
    reference: `BLD-SM-${Date.now()}`,
    type: "REQUEST",
    provider: fixtures.bloodProvider._id,
    bloodBankName: fixtures.bloodProvider.name,
    bloodGroup: "AB+",
    patientOrDonorName: "Blood SM Patient",
    contactPhone: "+91 98765 00001",
    status: "REQUESTED",
  });

  const bldConfirmRes = await fetch(`${API_BASE}/api/blood-requests/${bloodDoc._id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...bloodSession.authHeaders, "X-Forwarded-For": "10.0.5.12" },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  const bldConfirmData = await bldConfirmRes.json();

  const bldCompleteRes = await fetch(`${API_BASE}/api/blood-requests/${bloodDoc._id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...bloodSession.authHeaders, "X-Forwarded-For": "10.0.5.13" },
    body: JSON.stringify({ status: "COMPLETED" }),
  });
  const bldCompleteData = await bldCompleteRes.json();

  const passBlood = bldConfirmRes.status === 200 && bldConfirmData.data.status === "CONFIRMED" &&
    bldCompleteRes.status === 200 && bldCompleteData.data.status === "COMPLETED";

  record("5.5", "BloodRequest state transitions: REQUESTED -> CONFIRMED -> COMPLETED", passBlood, {
    confirmStatus: bldConfirmRes.status,
    completeStatus: bldCompleteRes.status,
  });

  // 5.6: AmbulanceBooking transitions: RECORDED -> UNDER_REVIEW -> CONFIRMED -> DISPATCHED -> COMPLETED
  const ambDoc = await AmbulanceBooking.create({
    reference: `AMB-SM-${Date.now()}`,
    provider: fixtures.ambulanceProvider._id,
    user: fixtures.patient1._id,
    providerSnapshot: { name: fixtures.ambulanceProvider.name, phone: fixtures.ambulanceProvider.phone },
    requestSnapshot: {
      patientName: "Amb SM Patient",
      patientAge: 29,
      pickupAddress: "88 Hill Road, Bandra West",
      contactPhone: "+91 98765 00001",
    },
    delivery: {
      user: { status: "not_available" },
      admin: { status: "not_available" },
      provider: { status: "not_available" },
    },
    trackingTokenHash: "test-hash-sm-001",
    status: "RECORDED",
  });

  const ambSteps = ["UNDER_REVIEW", "CONFIRMED", "DISPATCHED", "COMPLETED"];
  let ambPass = true;
  const ambStepResults = [];

  for (let i = 0; i < ambSteps.length; i++) {
    const nextStatus = ambSteps[i];
    const res = await fetch(`${API_BASE}/api/ambulances/bookings/${ambDoc._id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...ambulanceSession.authHeaders, "X-Forwarded-For": `10.0.5.${20 + i}` },
      body: JSON.stringify({ status: nextStatus }),
    });
    const d = await res.json();
    ambStepResults.push({ step: nextStatus, status: res.status, ok: d.data?.status === nextStatus });
    if (res.status !== 200 || d.data?.status !== nextStatus) {
      ambPass = false;
    }
  }

  record("5.6", "AmbulanceBooking state transitions: RECORDED -> UNDER_REVIEW -> CONFIRMED -> DISPATCHED -> COMPLETED", ambPass, {
    ambStepResults,
  });

  results.completedAt = new Date().toISOString();
  writeFileSync(
    "/home/anonymous/medreach/research/results/transactional/exp5_state_machine.json",
    JSON.stringify(results, null, 2)
  );
  console.log(`[EXP-TX-05] Finished: ${results.passCount} passed, ${results.failCount} failed.`);
  return results;
}
