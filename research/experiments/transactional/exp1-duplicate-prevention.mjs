import mongoose from "mongoose";
import { assertSafeUri, TEST_MONGO_URI, API_BASE } from "./db-guard.mjs";
import { setupTestFixtures, createAuthenticatedSession } from "./fixtures.mjs";
import { EmergencyRequest } from "../../../backend/src/models/EmergencyRequest.js";
import { BloodRequest } from "../../../backend/src/models/BloodRequest.js";
import { AmbulanceBooking } from "../../../backend/src/models/AmbulanceBooking.js";
import { JobApplication } from "../../../backend/src/models/JobApplication.js";
import { OrganizationApplication } from "../../../backend/src/models/OrganizationApplication.js";
import { writeFileSync } from "node:fs";

export async function runExperiment1() {
  assertSafeUri(TEST_MONGO_URI);
  console.log("\n=======================================================");
  console.log("RUNNING EXPERIMENT 1: Duplicate Request Prevention");
  console.log("=======================================================");

  const fixtures = await setupTestFixtures();
  const session1 = await createAuthenticatedSession(fixtures.patient1);
  const session2 = await createAuthenticatedSession(fixtures.patient2);

  const results = {
    experimentId: "EXP-TX-01",
    name: "Duplicate Request Prevention and Idempotency Key Handling",
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

  // 1.1: Submit emergency request as Patient 1 with key K1
  const key1 = "TX-KEY-EMERG-001-AABBCCDD";
  const payload1 = {
    hospitalId: fixtures.hospital._id.toString(),
    emergencyType: "Acute Coronary Syndrome",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00001",
    contactEmail: "patient1.tx@medreach.test",
    isEmergency: true,
  };

  const res1 = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key1,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.1.1",
    },
    body: JSON.stringify(payload1),
  });
  const data1 = await res1.json();
  const pass1 = res1.status === 201 && data1.request?.requestId;
  record("1.1", "Initial emergency request succeeds with 201 Created", pass1, {
    status: res1.status,
    requestId: data1.request?.requestId,
  });

  // 1.2: Submit emergency request as Patient 2 with the SAME key K1 -> Expect 409 Conflict
  const payload2 = {
    hospitalId: fixtures.hospital._id.toString(),
    emergencyType: "Severe Asthma",
    requiredFacility: "ICU",
    contactPhone: "+91 98765 00002",
    contactEmail: "patient2.tx@medreach.test",
    isEmergency: true,
  };

  const res2 = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key1,
      ...session2.authHeaders,
      "X-Forwarded-For": "10.0.1.2",
    },
    body: JSON.stringify(payload2),
  });
  const data2 = await res2.json();
  const pass2 = res2.status === 409 && (data2.error?.includes("Idempotency-Key was already used") || data2.code === "IDEMPOTENCY_KEY_REUSED");
  record("1.2", "Reusing key with different authenticated user returns 409 IDEMPOTENCY_KEY_REUSED", pass2, {
    status: res2.status,
    data: data2,
  });

  // 1.3: Submit emergency request as Guest with key K_GUEST
  const keyGuest = "TX-KEY-GUEST-001-AABBCCDD";
  const res3 = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyGuest,
      "X-Forwarded-For": "10.0.1.3",
    },
    body: JSON.stringify(payload1),
  });
  const data3 = await res3.json();
  const pass3 = res3.status === 201 && Boolean(data3.trackingToken);
  record("1.3", "Guest emergency request succeeds with 201 and tracking token", pass3, {
    status: res3.status,
    hasTrackingToken: Boolean(data3.trackingToken),
  });

  // 1.4: Guest attempts to reuse Patient 1's key K1 -> Expect 409 Conflict
  const res4 = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key1,
      "X-Forwarded-For": "10.0.1.4",
    },
    body: JSON.stringify(payload2),
  });
  const data4 = await res4.json();
  const pass4 = res4.status === 409 && (data4.error?.includes("Idempotency-Key was already used") || data4.code === "IDEMPOTENCY_KEY_REUSED");
  record("1.4", "Unauthenticated guest reusing authenticated user's idempotency key is rejected with 409 Conflict", pass4, {
    status: res4.status,
    data: data4,
  });

  // 1.5: Blood Request idempotency key reuse across different users
  const keyBlood = "TX-KEY-BLOOD-001-AABBCCDD";
  const bloodPayload = {
    type: "REQUEST",
    providerId: fixtures.bloodProvider._id.toString(),
    bloodBankName: fixtures.bloodProvider.name,
    bloodGroup: "O+",
    patientOrDonorName: "Patient One",
    units: 2,
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
      "X-Forwarded-For": "10.0.1.5",
    },
    body: JSON.stringify(bloodPayload),
  });
  const dataBlood1 = await resBlood1.json();

  const resBlood2 = await fetch(`${API_BASE}/api/blood-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyBlood,
      ...session2.authHeaders,
      "X-Forwarded-For": "10.0.1.6",
    },
    body: JSON.stringify({ ...bloodPayload, patientOrDonorName: "Patient Two" }),
  });
  const dataBlood2 = await resBlood2.json();
  const passBlood = resBlood1.status === 201 && resBlood2.status === 409 && dataBlood2.code === "IDEMPOTENCY_KEY_REUSED";
  record("1.5", "BloodRequest duplicate key returns 409 IDEMPOTENCY_KEY_REUSED", passBlood, {
    status1: resBlood1.status,
    status2: resBlood2.status,
    code2: dataBlood2.code,
  });

  // 1.6: Ambulance booking duplicate key reuse across different users
  const keyAmb = "TX-KEY-AMBUL-001-AABBCCDD";
  const ambPayload = {
    providerId: fixtures.ambulanceProvider._id.toString(),
    patientName: "Patient One",
    patientAge: 45,
    ambulanceRequired: true,
    bookingPickup: "100 Bandra West, Mumbai",
    bookingDetails: "Difficulty breathing",
    contactPhone: "+91 98765 00001",
    contactEmail: "patient1.tx@medreach.test",
  };

  const resAmb1 = await fetch(`${API_BASE}/api/ambulances/book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyAmb,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.1.7",
    },
    body: JSON.stringify(ambPayload),
  });
  const dataAmb1 = await resAmb1.json();

  const resAmb2 = await fetch(`${API_BASE}/api/ambulances/book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": keyAmb,
      ...session2.authHeaders,
      "X-Forwarded-For": "10.0.1.8",
    },
    body: JSON.stringify({ ...ambPayload, patientName: "Patient Two" }),
  });
  const dataAmb2 = await resAmb2.json();
  const passAmb = resAmb1.status === 201 && resAmb2.status === 409 && dataAmb2.code === "IDEMPOTENCY_KEY_REUSED";
  record("1.6", "AmbulanceBooking duplicate key returns 409 IDEMPOTENCY_KEY_REUSED", passAmb, {
    status1: resAmb1.status,
    status2: resAmb2.status,
    code2: dataAmb2.code,
  });

  // 1.7: Database index verification (unique & sparse on idempotencyKeyHash)
  const models = [
    { name: "EmergencyRequest", model: EmergencyRequest },
    { name: "BloodRequest", model: BloodRequest },
    { name: "AmbulanceBooking", model: AmbulanceBooking },
    { name: "JobApplication", model: JobApplication },
    { name: "OrganizationApplication", model: OrganizationApplication },
  ];

  let allIndexesVerified = true;
  const indexDetails = {};
  for (const m of models) {
    const indexes = await m.model.collection.indexes();
    const idx = indexes.find(i => i.key && i.key.idempotencyKeyHash === 1);
    const isUnique = idx?.unique === true;
    const isSparse = idx?.sparse === true;
    indexDetails[m.name] = { exists: Boolean(idx), unique: isUnique, sparse: isSparse };
    if (!idx || !isUnique || !isSparse) {
      allIndexesVerified = false;
    }
  }
  record("1.7", "Unique sparse idempotencyKeyHash indexes verified across all 5 transaction models", allIndexesVerified, indexDetails);

  // 1.8: Raw DB duplicate key collision triggers Mongo 11000 and maps correctly
  let directDuplicateCaught = false;
  let rawErrorCode = null;
  try {
    const existing = await EmergencyRequest.findOne({}).select("+idempotencyKeyHash");
    await EmergencyRequest.create({
      requestId: `RAW-DUP-${Date.now()}`,
      hospital: fixtures.hospital._id,
      emergencyType: "Raw Duplicate Collision Test",
      requiredFacility: "ICU",
      contactPhone: "+91 98765 99999",
      expiresAt: new Date(Date.now() + 3600000),
      timeline: [{ status: "REQUESTED", actorRole: "system" }],
      idempotencyKeyHash: existing.idempotencyKeyHash,
    });
  } catch (err) {
    directDuplicateCaught = true;
    rawErrorCode = err.code;
  }
  record("1.8", "Direct DB insert with duplicate idempotencyKeyHash triggers Mongo E11000 error", directDuplicateCaught && rawErrorCode === 11000, {
    directDuplicateCaught,
    rawErrorCode,
  });

  // 1.9: Scope isolation: Same raw key under different scopes does not collide
  const sharedKey = "TX-SHARED-CROSS-SCOPE-001";
  const resScope1 = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": sharedKey,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.1.9",
    },
    body: JSON.stringify({ ...payload1, emergencyType: "Scope Test 1" }),
  });

  const resScope2 = await fetch(`${API_BASE}/api/ambulances/book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": sharedKey,
      ...session1.authHeaders,
      "X-Forwarded-For": "10.0.1.10",
    },
    body: JSON.stringify({ ...ambPayload, patientName: "Scope Test Patient" }),
  });
  const passScope = resScope1.status === 201 && resScope2.status === 201;
  record("1.9", "Scope salting prevents cross-resource collision with identical Idempotency-Key", passScope, {
    emergStatus: resScope1.status,
    ambStatus: resScope2.status,
  });

  // 1.10: Key format validation
  const invalidKeys = [
    { key: "short", reason: "less than 8 chars" },
    { key: "a".repeat(205), reason: "greater than 200 chars" },
    { key: "bad key with spaces", reason: "illegal space character" },
    { key: "!invalid-start", reason: "must start with alphanumeric" },
  ];
  let invalidKeysPass = true;
  const invalidKeyResults = [];
  for (const item of invalidKeys) {
    const res = await fetch(`${API_BASE}/api/emergency-requests/emergency`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": item.key,
        ...session1.authHeaders,
        "X-Forwarded-For": "10.0.1.11",
      },
      body: JSON.stringify(payload1),
    });
    const data = await res.json();
    const ok = res.status === 400 && data.error === "Invalid Idempotency-Key";
    invalidKeyResults.push({ key: item.key, status: res.status, ok });
    if (!ok) invalidKeysPass = false;
  }
  record("1.10", "Malformed Idempotency-Key formats rejected with 400 Bad Request", invalidKeysPass, invalidKeyResults);

  results.completedAt = new Date().toISOString();
  writeFileSync(
    "/home/anonymous/medreach/research/results/transactional/exp1_duplicate_prevention.json",
    JSON.stringify(results, null, 2)
  );
  console.log(`[EXP-TX-01] Finished: ${results.passCount} passed, ${results.failCount} failed.`);
  return results;
}
