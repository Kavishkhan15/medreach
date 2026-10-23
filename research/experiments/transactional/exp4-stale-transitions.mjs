import mongoose from "mongoose";
import { assertSafeUri, TEST_MONGO_URI, API_BASE } from "./db-guard.mjs";
import { setupTestFixtures, createAuthenticatedSession } from "./fixtures.mjs";
import { EmergencyRequest } from "../../../backend/src/models/EmergencyRequest.js";
import { BloodRequest } from "../../../backend/src/models/BloodRequest.js";
import { AmbulanceBooking } from "../../../backend/src/models/AmbulanceBooking.js";
import { writeFileSync } from "node:fs";

export async function runExperiment4() {
  assertSafeUri(TEST_MONGO_URI);
  console.log("\n=======================================================");
  console.log("RUNNING EXPERIMENT 4: Stale-State Transitions");
  console.log("=======================================================");

  const fixtures = await setupTestFixtures();
  const staffSession = await createAuthenticatedSession(fixtures.staff1);
  const patientSession = await createAuthenticatedSession(fixtures.patient1);
  const bloodSession = await createAuthenticatedSession(fixtures.bloodAdmin);
  const ambulanceSession = await createAuthenticatedSession(fixtures.ambulanceAdmin);

  const results = {
    experimentId: "EXP-TX-04",
    name: "Stale-State and Out-of-Order Transition Prevention",
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

  // Create an EmergencyRequest at ACCEPTED status
  const emergAccepted = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-STALE-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Polytrauma",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    contactEmail: "patient1.tx@medreach.test",
    isEmergency: true,
    expiresAt: new Date(Date.now() + 7200000),
    status: "ACCEPTED",
    timeline: [
      { status: "REQUESTED", actorRole: "patient", at: new Date(Date.now() - 400000) },
      { status: "SENT", actorRole: "system", at: new Date(Date.now() - 300000) },
      { status: "UNDER_REVIEW", actorRole: "hospital_staff", actor: fixtures.staff1._id, at: new Date(Date.now() - 200000) },
      { status: "ACCEPTED", actorRole: "hospital_staff", actor: fixtures.staff1._id, at: new Date(Date.now() - 100000) },
    ],
  });

  // 4.1: expectedStatus mismatch
  const res1 = await fetch(`${API_BASE}/api/emergency-requests/${emergAccepted._id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...staffSession.authHeaders,
      "X-Forwarded-For": "10.0.4.1",
    },
    body: JSON.stringify({
      status: "COMPLETED",
      expectedStatus: "UNDER_REVIEW", // Mismatch: current status is ACCEPTED
    }),
  });
  const data1 = await res1.json();
  const pass1 = res1.status === 409 && data1.error?.includes("Request changed. Refresh its status");
  record("4.1", "Rejection of transition when expectedStatus mismatches actual database state", pass1, {
    status: res1.status,
    data: data1,
  });

  // 4.2: expectedTimelineLength mismatch
  const res2 = await fetch(`${API_BASE}/api/emergency-requests/${emergAccepted._id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...staffSession.authHeaders,
      "X-Forwarded-For": "10.0.4.2",
    },
    body: JSON.stringify({
      status: "COMPLETED",
      expectedTimelineLength: 2, // Mismatch: actual length is 4
    }),
  });
  const data2 = await res2.json();
  const pass2 = res2.status === 409 && data2.error?.includes("Request changed. Refresh its status");
  record("4.2", "Rejection of transition when expectedTimelineLength mismatches actual timeline history", pass2, {
    status: res2.status,
    data: data2,
  });

  // 4.3: Invalid transition from terminal state (REJECTED -> ACCEPTED)
  const emergRejected = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-REJ-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Fracture",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    isEmergency: true,
    expiresAt: new Date(Date.now() + 7200000),
    status: "REJECTED",
    timeline: [
      { status: "REQUESTED", actorRole: "patient", at: new Date() },
      { status: "REJECTED", actorRole: "hospital_staff", actor: fixtures.staff1._id, at: new Date() },
    ],
  });

  const res3 = await fetch(`${API_BASE}/api/emergency-requests/${emergRejected._id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...staffSession.authHeaders,
      "X-Forwarded-For": "10.0.4.3",
    },
    body: JSON.stringify({
      status: "ACCEPTED",
    }),
  });
  const data3 = await res3.json();
  const pass3 = res3.status === 409 && data3.error === "Invalid status transition";
  record("4.3", "Invalid state transition from terminal REJECTED status is blocked with 409", pass3, {
    status: res3.status,
    data: data3,
  });

  // 4.4: Stale transition on BloodRequest (from COMPLETED back to CONFIRMED)
  const bloodDoc = await BloodRequest.create({
    reference: `BLD-STALE-${Date.now()}`,
    type: "REQUEST",
    provider: fixtures.bloodProvider._id,
    bloodBankName: fixtures.bloodProvider.name,
    bloodGroup: "O-",
    patientOrDonorName: "Stale Blood Patient",
    contactPhone: "+91 98765 00001",
    status: "COMPLETED",
  });

  const resBlood = await fetch(`${API_BASE}/api/blood-requests/${bloodDoc._id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...bloodSession.authHeaders,
      "X-Forwarded-For": "10.0.4.4",
    },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  const dataBlood = await resBlood.json();
  const passBlood = resBlood.status === 409 && dataBlood.error?.includes("This status transition is unavailable");
  record("4.4", "Stale transition on terminal BloodRequest blocked with 409", passBlood, {
    status: resBlood.status,
    data: dataBlood,
  });

  // 4.5: Stale transition on AmbulanceBooking (from CANCELLED back to CONFIRMED)
  const ambDoc = await AmbulanceBooking.create({
    reference: `AMB-STALE-${Date.now()}`,
    provider: fixtures.ambulanceProvider._id,
    user: fixtures.patient1._id,
    providerSnapshot: { name: fixtures.ambulanceProvider.name, phone: fixtures.ambulanceProvider.phone },
    requestSnapshot: {
      patientName: "Stale Amb Patient",
      patientAge: 38,
      pickupAddress: "456 Bandra",
      contactPhone: "+91 98765 00001",
    },
    delivery: {
      user: { status: "not_available" },
      admin: { status: "not_available" },
      provider: { status: "not_available" },
    },
    trackingTokenHash: "test-hash-stale-001",
    status: "CANCELLED",
  });

  const resAmb = await fetch(`${API_BASE}/api/ambulances/bookings/${ambDoc._id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...ambulanceSession.authHeaders,
      "X-Forwarded-For": "10.0.4.5",
    },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  const dataAmb = await resAmb.json();
  const passAmb = resAmb.status === 409 && dataAmb.error?.includes("This status transition is unavailable");
  record("4.5", "Stale transition on terminal AmbulanceBooking blocked with 409", passAmb, {
    status: resAmb.status,
    data: dataAmb,
  });

  // 4.6: Expired request transition attempts
  const emergExpired = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-EXP-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Expired Test Request",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    isEmergency: true,
    expiresAt: new Date(Date.now() - 10000), // In the past!
    status: "UNDER_REVIEW",
    timeline: [
      { status: "REQUESTED", actorRole: "patient", at: new Date(Date.now() - 60000) },
      { status: "UNDER_REVIEW", actorRole: "hospital_staff", actor: fixtures.staff1._id, at: new Date(Date.now() - 30000) },
    ],
  });

  const resExpired = await fetch(`${API_BASE}/api/emergency-requests/${emergExpired._id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...staffSession.authHeaders,
      "X-Forwarded-For": "10.0.4.6",
    },
    body: JSON.stringify({
      status: "ACCEPTED",
    }),
  });
  const dataExpired = await resExpired.json();
  const updatedExpiredDoc = await EmergencyRequest.findById(emergExpired._id);
  const passExpired = resExpired.status === 409 &&
    dataExpired.error === "Request expired" &&
    updatedExpiredDoc.status === "EXPIRED";

  record("4.6", "Transition on expired request auto-finalizes to EXPIRED and rejects with 409", passExpired, {
    status: resExpired.status,
    data: dataExpired,
    docStatusInDb: updatedExpiredDoc.status,
  });

  // 4.7: Patient trying to reply when request is NOT in INFORMATION_REQUESTED
  const emergUnderReview = await EmergencyRequest.create({
    notificationVersion: 1,
    requestId: `MR-NOT-INFO-${Date.now()}`,
    user: fixtures.patient1._id,
    hospital: fixtures.hospital._id,
    emergencyType: "Reviewing",
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

  const resPatientReply = await fetch(`${API_BASE}/api/emergency-requests/${emergUnderReview._id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...patientSession.authHeaders,
      "X-Forwarded-For": "10.0.4.7",
    },
    body: JSON.stringify({
      status: "UNDER_REVIEW",
      note: "Patient premature info reply",
    }),
  });
  const dataPatientReply = await resPatientReply.json();
  const passPatientReply = resPatientReply.status === 409 && dataPatientReply.error === "The hospital has not requested more information";
  record("4.7", "Patient cannot submit reply when status is not INFORMATION_REQUESTED", passPatientReply, {
    status: resPatientReply.status,
    data: dataPatientReply,
  });

  results.completedAt = new Date().toISOString();
  writeFileSync(
    "/home/anonymous/medreach/research/results/transactional/exp4_stale_transitions.json",
    JSON.stringify(results, null, 2)
  );
  console.log(`[EXP-TX-04] Finished: ${results.passCount} passed, ${results.failCount} failed.`);
  return results;
}
