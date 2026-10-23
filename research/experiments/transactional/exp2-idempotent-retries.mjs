import mongoose from "mongoose";
import { assertSafeUri, TEST_MONGO_URI, API_BASE } from "./db-guard.mjs";
import { setupTestFixtures, createAuthenticatedSession } from "./fixtures.mjs";
import { EmergencyRequest } from "../../../backend/src/models/EmergencyRequest.js";
import { BloodRequest } from "../../../backend/src/models/BloodRequest.js";
import { AmbulanceBooking } from "../../../backend/src/models/AmbulanceBooking.js";
import { writeFileSync } from "node:fs";

export async function runExperiment2() {
  assertSafeUri(TEST_MONGO_URI);
  console.log("\n=======================================================");
  console.log("RUNNING EXPERIMENT 2: Idempotent Retries & Client Timeouts");
  console.log("=======================================================");

  const fixtures = await setupTestFixtures();
  const session1 = await createAuthenticatedSession(fixtures.patient1);

  const results = {
    experimentId: "EXP-TX-02",
    name: "Idempotent Retries and Simulated Timeout Recovery",
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

  // 2.1: Authenticated user replay
  const keyAuth = "TX-KEY-RETRY-AUTH-001-XYZ";
  const emergPayload = {
    hospitalId: fixtures.hospital._id.toString(),
    emergencyType: "Severe Respiratory Distress",
    requiredFacility: "Ventilator",
    contactPhone: "+91 98765 00001",
    contactEmail: "patient1.tx@medreach.test",
    isEmergency: true,
  };

  const res1 = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyAuth,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.2.1",
    },
    body: JSON.stringify(emergPayload),
  });
  const data1 = await res1.json();

  const res1Retry = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyAuth,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.2.2",
    },
    body: JSON.stringify(emergPayload),
  });
  const data1Retry = await res1Retry.json();

  const dbCount1 = await EmergencyRequest.countDocuments({
    hospital: fixtures.hospital._id,
    emergencyType: "Severe Respiratory Distress",
  });

  const pass1 = res1.status === 201 &&
    res1Retry.status === 200 &&
    data1.request.requestId === data1Retry.request.requestId &&
    dbCount1 === 1;

  record("2.1", "Authenticated user replay returns 200 OK with same requestId and no duplicate document", pass1, {
    initStatus: res1.status,
    retryStatus: res1Retry.status,
    requestId1: data1.request?.requestId,
    requestId2: data1Retry.request?.requestId,
    dbCount: dbCount1,
  });

  // 2.2: Replay with modified payload (must return original request without mutating document)
  const modifiedPayload = {
    ...emergPayload,
    emergencyType: "Altered Emergency Type",
    contactPhone: "+91 98765 99999",
  };
  const res2 = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyAuth,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.2.3",
    },
    body: JSON.stringify(modifiedPayload),
  });
  const data2 = await res2.json();
  const pass2 = res2.status === 200 &&
    data2.request.emergencyType === "Severe Respiratory Distress" &&
    data2.request.requestId === data1.request.requestId;

  record("2.2", "Idempotent replay with altered body returns cached original without mutating record", pass2, {
    status: res2.status,
    returnedEmergencyType: data2.request?.emergencyType,
    originalRequestId: data1.request?.requestId,
  });

  // 2.3: Guest idempotent retry
  const keyGuest = "TX-KEY-RETRY-GUEST-001-XYZ";
  const guestPayload = {
    ...emergPayload,
    contactEmail: "guest.retry@medreach.test",
  };

  const resGuest1 = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyGuest,
      "X-Forwarded-For": "10.0.2.4",
    },
    body: JSON.stringify(guestPayload),
  });
  const dataGuest1 = await resGuest1.json();

  const resGuest2 = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyGuest,
      "X-Forwarded-For": "10.0.2.5",
    },
    body: JSON.stringify(guestPayload),
  });
  const dataGuest2 = await resGuest2.json();

  const passGuest = resGuest1.status === 201 &&
    resGuest2.status === 200 &&
    dataGuest1.request.requestId === dataGuest2.request.requestId &&
    dataGuest1.trackingToken === dataGuest2.trackingToken;

  record("2.3", "Guest idempotent replay returns 200 OK with identical trackingToken and requestId", passGuest, {
    initStatus: resGuest1.status,
    retryStatus: resGuest2.status,
    tokenMatch: dataGuest1.trackingToken === dataGuest2.trackingToken,
  });

  // 2.4: Simulated client timeout & recovery
  const keyTimeout = "TX-KEY-TIMEOUT-SIM-001-XYZ";
  const timeoutPayload = {
    ...emergPayload,
    emergencyType: "Timeout Simulated Event",
  };

  // Simulate timeout using AbortController after headers/dispatch
  const controller = new AbortController();
  let timedOut = false;
  try {
    const timeoutPromise = fetch(`${API_BASE}/api/emergency-requests/emergency`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": keyTimeout,
        ...session1.authHeaders,
        "X-Forwarded-For": "10.0.2.6",
      },
      body: JSON.stringify(timeoutPayload),
      signal: controller.signal,
    });
    // Abort after 5ms to simulate client disconnecting mid-flight
    setTimeout(() => controller.abort(), 5);
    await timeoutPromise;
  } catch (err) {
    timedOut = true;
  }

  // Allow server backend 50ms to finish write
  await new Promise((r) => setTimeout(r, 60));

  // Client reconnects and retries with the same Idempotency-Key
  const resRecovered = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyTimeout,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.2.7",
    },
    body: JSON.stringify(timeoutPayload),
  });
  const dataRecovered = await resRecovered.json();

  const countRecovered = await EmergencyRequest.countDocuments({
    hospital: fixtures.hospital._id,
    emergencyType: "Timeout Simulated Event",
  });

  const passTimeout = timedOut &&
    (resRecovered.status === 200 || resRecovered.status === 201) &&
    Boolean(dataRecovered.request?.requestId) &&
    countRecovered === 1;

  record("2.4", "Simulated client timeout followed by retry recovers cleanly with exactly 1 DB record", passTimeout, {
    timedOut,
    recoveryStatus: resRecovered.status,
    requestId: dataRecovered.request?.requestId,
    countInDb: countRecovered,
  });

  // 2.5: Ambulance booking idempotent replay
  const keyAmb = "TX-KEY-RETRY-AMB-001-XYZ";
  const ambPayload = {
    providerId: fixtures.ambulanceProvider._id.toString(),
    patientName: "Patient Ambul Retry",
    patientAge: 62,
    ambulanceRequired: true,
    bookingPickup: "200 Linking Road, Bandra West, Mumbai",
    bookingDetails: "Cardiac event",
    contactPhone: "+91 98765 00001",
    contactEmail: "patient1.tx@medreach.test",
  };

  const resAmb1 = await fetch(`${API_BASE}/api/ambulances/book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyAmb,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.2.8",
    },
    body: JSON.stringify(ambPayload),
  });
  const dataAmb1 = await resAmb1.json();

  const resAmb2 = await fetch(`${API_BASE}/api/ambulances/book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyAmb,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.2.9",
    },
    body: JSON.stringify(ambPayload),
  });
  const dataAmb2 = await resAmb2.json();

  const countAmb = await AmbulanceBooking.countDocuments({
    "requestSnapshot.patientName": "Patient Ambul Retry",
  });

  const passAmb = resAmb1.status === 201 &&
    resAmb2.status === 200 &&
    dataAmb1.reference === dataAmb2.reference &&
    countAmb === 1;

  record("2.5", "Ambulance booking idempotent replay returns 200 OK with same reference and single DB booking", passAmb, {
    status1: resAmb1.status,
    status2: resAmb2.status,
    reference1: dataAmb1.reference,
    reference2: dataAmb2.reference,
    dbCount: countAmb,
  });

  // 2.6: Blood request idempotent replay
  const keyBlood = "TX-KEY-RETRY-BLOOD-001-XYZ";
  const bloodPayload = {
    type: "REQUEST",
    providerId: fixtures.bloodProvider._id.toString(),
    bloodBankName: fixtures.bloodProvider.name,
    bloodGroup: "B+",
    patientOrDonorName: "Patient Blood Retry",
    units: 1,
    urgency: "within 6 hours",
    isUrgent: true,
    contactPhone: "+91 98765 00001",
    contactEmail: "patient1.tx@medreach.test",
  };

  const resBlood1 = await fetch(`${API_BASE}/api/blood-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyBlood,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.2.10",
    },
    body: JSON.stringify(bloodPayload),
  });
  const dataBlood1 = await resBlood1.json();

  const resBlood2 = await fetch(`${API_BASE}/api/blood-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyBlood,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.2.11",
    },
    body: JSON.stringify(bloodPayload),
  });
  const dataBlood2 = await resBlood2.json();

  const countBlood = await BloodRequest.countDocuments({
    patientOrDonorName: "Patient Blood Retry",
  });

  const passBlood = resBlood1.status === 201 &&
    resBlood2.status === 200 &&
    dataBlood1.reference === dataBlood2.reference &&
    countBlood === 1;

  record("2.6", "Blood request idempotent replay returns 200 OK with same reference and single DB record", passBlood, {
    status1: resBlood1.status,
    status2: resBlood2.status,
    reference1: dataBlood1.reference,
    reference2: dataBlood2.reference,
    dbCount: countBlood,
  });

  // 2.7: Repeated consecutive retries (N=10 replays)
  let repeatedPass = true;
  const repeatStatuses = [];
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": keyAuth,
        ...session1.authHeaders,
        "X-Forwarded-For": `10.0.2.${20 + i}`,
      },
      body: JSON.stringify(emergPayload),
    });
    const d = await res.json();
    repeatStatuses.push(res.status);
    if (res.status !== 200 || d.request?.requestId !== data1.request.requestId) {
      repeatedPass = false;
    }
  }

  const finalDbCount = await EmergencyRequest.countDocuments({
    requestId: data1.request.requestId,
  });

  record("2.7", "10 consecutive idempotent retries all return 200 OK with unchanged database document count", repeatedPass && finalDbCount === 1, {
    repeatedPass,
    repeatStatuses,
    finalDbCount,
  });

  results.completedAt = new Date().toISOString();
  writeFileSync(
    "/home/anonymous/medreach/research/results/transactional/exp2_idempotent_retries.json",
    JSON.stringify(results, null, 2)
  );
  console.log(`[EXP-TX-02] Finished: ${results.passCount} passed, ${results.failCount} failed.`);
  return results;
}
