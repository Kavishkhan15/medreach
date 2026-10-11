import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";

import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { Job } from "../src/models/Job.js";
import { JobApplication } from "../src/models/JobApplication.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { signSessionToken } from "./helpers/session.js";
import { expireEmergencyRequests } from "../src/services/emergencyRequestExpiry.js";
import { getRoute } from "../src/services/routingService.js";

import { canAccessAdmin } from "../../packages/core/src/constants.js";

// Core package imports
import { validateRegister, validateLogin, sanitizeText, isEmail, minLen, nonEmpty } from "../../packages/core/src/validation.js";
import { distanceKm, localityToCoords } from "../../packages/core/src/location.js";
import { scoreHospital, rankHospitals } from "../../packages/core/src/ranking.js";

const uri = process.env.MEDREACH_WORKFLOW_TEST_MONGO_URI || "mongodb://127.0.0.1:27017/medreach_workflow_verification";

test("MedReach Workflows Verification Suite", async (t) => {
  await connectDB(uri);
  await mongoose.connection.dropDatabase();
  await Hospital.syncIndexes();
  const app = createApp();

  t.after(async () => {
    try {
      await mongoose.connection.dropDatabase();
      await disconnectDB();
    } catch {
      // ignore teardown errors
    }
  });

  // =========================================================================
  // 1. CORE VALIDATION AND API PACKAGES
  // =========================================================================
  await t.test("Core validation package (packages/core/src/validation.js)", () => {
    // validateRegister password strength rules (12+ chars, upper, lower, number)
    assert.equal(validateRegister({ name: "Alice", email: "alice@example.com", password: "short" }).valid, false);
    assert.equal(validateRegister({ name: "Alice", email: "alice@example.com", password: "alllowercase123" }).valid, false);
    assert.equal(validateRegister({ name: "Alice", email: "alice@example.com", password: "ALLUPPERCASE123" }).valid, false);
    assert.equal(validateRegister({ name: "Alice", email: "alice@example.com", password: "NoDigitsPasswordHere" }).valid, false);
    assert.equal(validateRegister({ name: "Alice", email: "alice@example.com", password: "ValidPassword123" }).valid, true);

    // Email & name requirements
    assert.equal(validateRegister({ name: "", email: "alice@example.com", password: "ValidPassword123" }).valid, false);
    assert.equal(validateRegister({ name: "Alice", email: "invalid-email", password: "ValidPassword123" }).valid, false);

    // validateLogin
    assert.equal(validateLogin({ email: "invalid", password: "password" }).valid, false);
    assert.equal(validateLogin({ email: "user@medreach.test", password: "" }).valid, false);
    assert.equal(validateLogin({ email: "user@medreach.test", password: "ValidPassword123" }).valid, true);

    // sanitizeText
    assert.equal(sanitizeText("<script>alert('xss')</script>hello"), "scriptalert('xss')/scripthello");
    assert.equal(sanitizeText("<b>bold text</b>"), "bbold text/b");
    assert.equal(sanitizeText("  clean text  "), "clean text");
    assert.equal(sanitizeText(12345), "");
  });

  await t.test("Core location and ranking package (packages/core/src/location.js, ranking.js)", () => {
    // Locality coords & distance
    const bandra = localityToCoords("Bandra");
    const andheri = localityToCoords("Andheri");
    assert.ok(bandra && bandra.lat && bandra.lng);
    assert.ok(andheri && andheri.lat && andheri.lng);
    // distanceKm expects [lng, lat] tuples
    const d = distanceKm([bandra.lng, bandra.lat], [andheri.lng, andheri.lat]);
    assert.ok(d > 0 && d < 20);

    // Safe proximity scoring: never invents travel time without routing provider
    const scored = scoreHospital(
      { name: "City Hospital", location: { coordinates: [bandra.lng, bandra.lat] }, facilities: [], specialties: [] },
      { origin: andheri }
    );
    assert.ok(scored.distanceKm > 0);
    assert.equal(scored.etaMinutes, null);
    assert.ok(scored.reasons.some((r) => r.includes("travel time unavailable")));
  });

  await t.test("Core API package auto-refresh retry behavior (packages/core/src/api.js)", async () => {
    // Test the 401 retry interceptor in packages/core/src/api.js
    const calls = [];
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, opts) => {
        calls.push({ url: String(url), opts });
        if (url.includes("/api/users/me/saved") && calls.length === 1) {
          // First call fails with 401
          return {
            status: 401,
            ok: false,
            json: async () => ({ error: "Token expired" }),
          };
        }
        if (url.includes("/api/auth/refresh")) {
          // Refresh call succeeds
          return {
            status: 200,
            ok: true,
            json: async () => ({ ok: true }),
          };
        }
        if (url.includes("/api/users/me/saved") && calls.length === 3) {
          // Retried call succeeds
          return {
            status: 200,
            ok: true,
            json: async () => ({ saved: ["hosp-1"] }),
          };
        }
        return originalFetch(url, opts);
      };

      const { getSaved } = await import("../../packages/core/src/api.js");
      const data = await getSaved();
      assert.deepEqual(data, { saved: ["hosp-1"] });
      assert.equal(calls.length, 3);
      assert.ok(calls[0].url.includes("/api/users/me/saved"));
      assert.ok(calls[1].url.includes("/api/auth/refresh"));
      assert.ok(calls[2].url.includes("/api/users/me/saved"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("concurrent core and product requests share one browser session refresh", async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    globalThis.window = {};
    let refreshCalls = 0;
    const resourceCalls = new Map();
    try {
      globalThis.fetch = async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/api/auth/refresh") {
          refreshCalls += 1;
          return { status: 200, ok: true, json: async () => ({ ok: true }) };
        }
        const count = (resourceCalls.get(path) || 0) + 1;
        resourceCalls.set(path, count);
        if (count === 1) return { status: 401, ok: false, json: async () => ({ error: "expired" }) };
        return { status: 200, ok: true, json: async () => ({ path }) };
      };
      const [{ getSaved }, { productApi }] = await Promise.all([
        import("../../packages/core/src/api.js"),
        import("../../variants/bootstrap/lib/productApi.js"),
      ]);
      const results = await Promise.all([getSaved(), productApi("/api/applications/mine")]);
      assert.equal(refreshCalls, 1);
      assert.equal(results[0].path, "/api/users/me/saved");
      assert.equal(results[1].path, "/api/applications/mine");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  });

  await t.test("guest tracking retries without an expired cookie after refresh fails", async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    globalThis.window = {};
    const calls = [];
    try {
      globalThis.fetch = async (url, options) => {
        calls.push({ path: new URL(String(url)).pathname, credentials: options.credentials });
        if (String(url).endsWith("/api/auth/refresh")) {
          return { status: 401, ok: false, json: async () => ({ error: "expired" }) };
        }
        if (options.credentials === "omit") {
          return { status: 200, ok: true, json: async () => ({ request: { status: "REQUESTED" } }) };
        }
        return { status: 401, ok: false, json: async () => ({ error: "Invalid or expired token" }) };
      };
      const { productApi } = await import("../../variants/bootstrap/lib/productApi.js");
      const result = await productApi("/api/emergency-requests/507f1f77bcf86cd799439011", {
        headers: { "X-MedReach-Tracking-Token": "private-test-token" },
      });
      assert.equal(result.request.status, "REQUESTED");
      assert.deepEqual(calls.map(({ credentials }) => credentials), ["include", "include", "omit"]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  });

  await t.test("Core hooks access rules (useAdminAccess in packages/core/src/hooks.js)", async () => {
    for (const role of ["user", "provider_admin", "hospital_admin", "admin", undefined]) {
      assert.equal(canAccessAdmin(role), false);
      assert.equal(canAccessAdmin(role, "users"), false);
    }
    assert.equal(canAccessAdmin("system_admin"), true);
    assert.equal(canAccessAdmin("user_admin"), false);
    assert.equal(canAccessAdmin("user_admin", "users"), false);

  });

  // =========================================================================
  // SETUP TEST ACTORS AND HOSPITALS
  // =========================================================================
  const patient = new User({ name: "Patient Zero", email: "patient@medreach.test", role: "user", accountStatus: "active" });
  await patient.setPassword("SecurePass123!");
  await patient.save();

  const hospitalStaff = new User({ name: "Staff Member", email: "staff@hospital.test", role: "hospital_admin", accountStatus: "active" });
  await hospitalStaff.setPassword("SecurePass123!");
  await hospitalStaff.save();

  const otherStaff = new User({ name: "Other Staff", email: "other@hospital.test", role: "hospital_admin", accountStatus: "active" });
  await otherStaff.setPassword("SecurePass123!");
  await otherStaff.save();

  const sysAdmin = new User({ name: "Sys Admin", email: "admin@medreach.test", role: "system_admin", accountStatus: "active" });
  await sysAdmin.setPassword("SecurePass123!");
  await sysAdmin.save();

  const patientToken = await signSessionToken(patient);
  const staffToken = await signSessionToken(hospitalStaff);
  const otherStaffToken = await signSessionToken(otherStaff);
  const adminToken = await signSessionToken(sysAdmin);

  const mainHospital = await Hospital.create({
    name: "Lilavati Hospital & Research Centre",
    slug: "lilavati-hospital-bandra",
    city: "Mumbai",
    locality: "Bandra",
    hospitalType: "Trust",
    address: "A-791, Bandra Reclamation, Bandra West",
    pincode: "400050",
    phone: "022-26751000",
    specialties: ["Cardiology", "Neurology", "Emergency Care"],
    departments: ["Cardiology", "Neurology", "Emergency Care"],
    location: { type: "Point", coordinates: [72.8258, 19.0522] },
    verificationStatus: "verified",
    admins: [hospitalStaff._id],
  });

  const secondaryHospital = await Hospital.create({
    name: "Kokilaben Dhirubhai Ambani Hospital",
    slug: "kokilaben-hospital-andheri",
    city: "Mumbai",
    locality: "Andheri",
    hospitalType: "Private",
    address: "Rao Saheb Achutrao Patwardhan Marg, Four Bungalows, Andheri West",
    pincode: "400053",
    phone: "022-30999999",
    specialties: ["Cardiology", "Oncology"],
    departments: ["Cardiology", "Oncology"],
    location: { type: "Point", coordinates: [72.8295, 19.1314] },
    verificationStatus: "verified",
    admins: [otherStaff._id],
  });

  // =========================================================================
  // 2. HOSPITAL RESOURCE QUERIES AND ENDPOINTS
  // =========================================================================
  await t.test("Hospital listing and filtering queries", async () => {
    // List all
    const resAll = await request(app).get("/api/hospitals");
    assert.equal(resAll.status, 200);
    assert.equal(resAll.body.total, 2);
    assert.equal(resAll.body.data.length, 2);

    // Filter by specialty
    const resSpecialty = await request(app).get("/api/hospitals?specialty=Neurology");
    assert.equal(resSpecialty.status, 200);
    assert.equal(resSpecialty.body.total, 1);
    assert.equal(resSpecialty.body.data[0].slug, "lilavati-hospital-bandra");

    // Filter by locality
    const resLocality = await request(app).get("/api/hospitals?city=Mumbai");
    assert.equal(resLocality.status, 200);
    assert.equal(resLocality.body.total, 2);

    // Filter by search query
    const resSearch = await request(app).get("/api/hospitals?q=Kokilaben");
    assert.equal(resSearch.status, 200);
  });

  await t.test("Hospital detail retrieval by slug", async () => {
    const res = await request(app).get(`/api/hospitals/${mainHospital.slug}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.hospital.name, mainHospital.name);
    assert.equal(res.body.hospital.phone, mainHospital.phone);
    assert.ok(Array.isArray(res.body.hospital.facilities));

    // 404 for missing hospital
    const notFound = await request(app).get("/api/hospitals/non-existent-hospital");
    assert.equal(notFound.status, 404);
  });

  await t.test("Hospital resource availability and staff isolation", async () => {
    // Staff from other hospital blocked (403)
    const forbidden = await request(app)
      .post(`/api/hospitals/${mainHospital._id}/availability`)
      .set("Authorization", `Bearer ${otherStaffToken}`)
      .send({ facility: "ICU", status: "available", quantity: 5 });
    assert.equal(forbidden.status, 403);

    // Assigned staff can post availability
    const allowed = await request(app)
      .post(`/api/hospitals/${mainHospital._id}/availability`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ facility: "ICU", status: "available", quantity: 5 });
    assert.equal(allowed.status, 201);
    assert.equal(allowed.body.observation.facility, "ICU");
    assert.equal(allowed.body.observation.status, "available");
    assert.equal(allowed.body.observation.quantity, 5);

    // Disallow fabricating quantity when status is unknown
    const invalidStatus = await request(app)
      .post(`/api/hospitals/${mainHospital._id}/availability`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ facility: "ICU", status: "unknown", quantity: 5 });
    assert.equal(invalidStatus.status, 400);

    // Verify hospital detail reflects updated availability
    const updatedView = await request(app).get(`/api/hospitals/${mainHospital.slug}`);
    const icu = updatedView.body.hospital.facilities.find((f) => f.facility === "ICU");
    assert.ok(icu);
    assert.equal(icu.status, "available");
    assert.equal(icu.count, 5);
  });

  // =========================================================================
  // 3. BLOOD BANKS AND CAREERS ENDPOINTS / CONTROLLERS
  // =========================================================================
  let bloodBankId = null;

  await t.test("Blood banks endpoints (/api/blood-banks) and admin management", async () => {
    // Admin creates blood bank
    const createRes = await request(app)
      .post("/api/admin/resources")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        kind: "blood_bank",
        name: "Bandra Red Cross Blood Centre",
        locality: "Bandra",
        city: "Mumbai",
        phone: "022-26400000",
        services: ["Whole Blood", "Platelets", "Packed Red Blood Cells"],
        listedBloodGroups: ["A+", "B+", "O+", "AB+", "O-"],
        sourceName: "Maharashtra State Blood Transfusion Council",
        verificationStatus: "verified",
        demo: true,
      });
    assert.equal(createRes.status, 201);
    bloodBankId = createRes.body.data._id;

    // Unauthorized user cannot create resource (403)
    const unauthCreate = await request(app)
      .post("/api/admin/resources")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ kind: "blood_bank", name: "Hacker Blood Bank", sourceName: "Fake" });
    assert.equal(unauthCreate.status, 403);

    // Public list blood banks
    await request(app).post(`/api/admin/provider-approvals/organizations/blood_bank/${createRes.body.data._id}/approve`).set("Authorization", `Bearer ${adminToken}`);
    const listRes = await request(app).get("/api/blood-banks");
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.currentInventory, "unknown"); // Discloses honest inventory status
    assert.ok(listRes.body.data.length >= 1);

    // Filter blood banks by bloodGroup
    const groupRes = await request(app).get("/api/blood-banks?bloodGroup=O-");
    assert.equal(groupRes.status, 200);
    assert.ok(groupRes.body.data.some((b) => b.name === "Bandra Red Cross Blood Centre"));

    // Blood bank detail by id
    const detailRes = await request(app).get(`/api/blood-banks/${bloodBankId}`);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.name, "Bandra Red Cross Blood Centre");
    assert.equal(detailRes.body.currentInventory, "unknown");

    // Also verify diagnostics and ambulance resource endpoints
    const diagCreate = await request(app)
      .post("/api/admin/resources")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        kind: "diagnostic",
        name: "Suburban Diagnostics Bandra",
        locality: "Bandra",
        city: "Mumbai",
        sourceName: "City Registry",
      });
    assert.equal(diagCreate.status, 201);

    assert.equal((await request(app).post(`/api/admin/provider-approvals/organizations/diagnostic/${diagCreate.body.data._id}/approve`).set("Authorization", `Bearer ${adminToken}`)).status, 200);
    const diagList = await request(app).get("/api/diagnostics");
    assert.equal(diagList.status, 200);
    assert.ok(diagList.body.data.some((d) => d.name === "Suburban Diagnostics Bandra"));

    const ambCreate = await request(app)
      .post("/api/admin/resources")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        kind: "ambulance",
        name: "Lifeline Cardiac Ambulance Service",
        locality: "Bandra",
        city: "Mumbai",
        sourceName: "EMS Registry",
      });
    assert.equal(ambCreate.status, 201);

    assert.equal((await request(app).post(`/api/admin/provider-approvals/organizations/ambulance/${ambCreate.body.data._id}/approve`).set("Authorization", `Bearer ${adminToken}`)).status, 200);
    const ambList = await request(app).get("/api/ambulances");
    assert.equal(ambList.status, 200);
    assert.equal(ambList.body.liveDispatch, false); // Discloses honest live dispatch status
    assert.ok(ambList.body.data.some((a) => a.name === "Lifeline Cardiac Ambulance Service"));
  });

  let jobId = null;
  let applicationId = null;

  await t.test("Careers and Job applications lifecycle (/api/jobs, /api/applications)", async () => {
    // Hospital staff posts a job
    const createJob = await request(app)
      .post("/api/jobs")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        hospital: mainHospital._id,
        title: "Critical Care Nurse",
        category: "Nurse",
        department: "ICU",
        description: "Experienced ICU nurse required for night and rotation shifts.",
        employmentType: "full_time",
      });
    assert.equal(createJob.status, 201);
    assert.equal(createJob.body.job.status, "draft");
    jobId = createJob.body.job._id;

    // Other hospital staff cannot post job for main hospital (403)
    const otherPost = await request(app)
      .post("/api/jobs")
      .set("Authorization", `Bearer ${otherStaffToken}`)
      .send({
        hospital: mainHospital._id,
        title: "Unauthorized Job",
        category: "Doctor",
        description: "Unauthorized listing",
        employmentType: "full_time",
      });
    assert.equal(otherPost.status, 403);

    // Hospital staff submits draft for publishing -> status becomes "pending"
    const submitJob = await request(app)
      .post(`/api/jobs/${jobId}/status`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "published" });
    assert.equal(submitJob.status, 200);
    assert.equal(submitJob.body.job.status, "pending");

    // System admin approves and publishes job
    const adminPublish = await request(app)
      .post(`/api/jobs/${jobId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "published" });
    assert.equal(adminPublish.status, 200);
    assert.equal(adminPublish.body.job.status, "published");
    assert.equal(adminPublish.body.job.verificationStatus, "verified");

    // Public can list published jobs
    const publicJobs = await request(app).get("/api/jobs?category=Nurse");
    assert.equal(publicJobs.status, 200);
    assert.ok(publicJobs.body.data.some((j) => j._id.toString() === jobId.toString()));

    // Public get single job
    const getJobRes = await request(app).get(`/api/jobs/${jobId}`);
    assert.equal(getJobRes.status, 200);
    assert.equal(getJobRes.body.job.title, "Critical Care Nurse");

    // Patient applies to job
    const applyRes = await request(app)
      .post(`/api/jobs/${jobId}/apply`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ statement: "I have 5 years experience in critical care nursing and emergency response." });
    assert.equal(applyRes.status, 201);
    applicationId = (await JobApplication.findOne({ reference: applyRes.body.application.reference })).id;
    assert.equal(applyRes.body.application.status, "submitted");

    // Duplicate application blocked (409)
    const dupRes = await request(app)
      .post(`/api/jobs/${jobId}/apply`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ statement: "Duplicate application" });
    assert.equal(dupRes.status, 409);

    // Hospital staff views applications
    const staffApps = await request(app)
      .get(`/api/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${staffToken}`);
    assert.equal(staffApps.status, 200);
    assert.equal(staffApps.body.data.length, 1);
    assert.equal(staffApps.body.data[0].applicant.email, "patient@medreach.test");

    // Other staff cannot view applications for this hospital (403)
    const otherStaffApps = await request(app)
      .get(`/api/jobs/${jobId}/applications`)
      .set("Authorization", `Bearer ${otherStaffToken}`);
    assert.equal(otherStaffApps.status, 403);

    // Hospital staff reviews and shortlists application
    const reviewRes = await request(app)
      .patch(`/api/applications/${applicationId}`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "shortlisted" });
    assert.equal(reviewRes.status, 200);
    assert.equal(reviewRes.body.application.status, "shortlisted");

    // Applicant views their own applications
    const myApps = await request(app)
      .get("/api/applications/mine")
      .set("Authorization", `Bearer ${patientToken}`);
    assert.equal(myApps.status, 200);
    assert.equal(myApps.body.data.length, 1);
    assert.equal(myApps.body.data[0].status, "shortlisted");
  });

  // =========================================================================
  // 4. EMERGENCY REQUESTS AND AMBULANCE ROUTING LOGIC
  // =========================================================================
  let emergencyRequestId = null;

  await t.test("Emergency requests lifecycle (/api/emergency-requests)", async () => {
    // Unauthenticated standard hospital bed request rejected (401)
    const unauth = await request(app)
      .post("/api/emergency-requests/standard")
      .send({ hospitalId: mainHospital._id, emergencyType: "Routine Bed", requiredFacility: "ICU", contactPhone: "9876543210" });
    assert.equal(unauth.status, 401);

    // Unauthenticated emergency bed request accepted (201) without login
    const guestEmergency = await request(app)
      .post("/api/emergency-requests/emergency")
      .send({
        hospitalId: mainHospital._id,
        emergencyType: "Cardiac Emergency",
        requiredFacility: "ICU",
        contactPhone: "9876543210",
        contactEmail: "guest@example.com",
        isEmergency: true,
      });
    assert.equal(guestEmergency.status, 201);
    assert.equal(guestEmergency.body.request.contactEmail, "guest@example.com");
    assert.equal(guestEmergency.body.request.user, null);

    // Patient submits emergency request
    const createRes = await request(app)
      .post("/api/emergency-requests/emergency")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({
        hospitalId: mainHospital._id,
        emergencyType: "Cardiac Emergency",
        requiredFacility: "ICU",
        contactPhone: "9876543210",
        patientAgeGroup: "adult",
        patientSummary: "Severe chest pain, suspected STEMI",
        locality: "Bandra",
      });
    assert.equal(createRes.status, 201);
    const emergency = createRes.body.request;
    emergencyRequestId = emergency._id;
    assert.ok(emergency.requestId.startsWith("MR-"));
    // Since hospital has connected active staff (hospitalStaff), status is SENT immediately
    assert.equal(emergency.status, "SENT");
    assert.equal(emergency.timeline.length, 2); // REQUESTED, SENT

    assert.equal(await mongoose.connection.collection("notifications").countDocuments(), 0);

    // Patient lists their requests
    const patientList = await request(app)
      .get("/api/emergency-requests")
      .set("Authorization", `Bearer ${patientToken}`);
    assert.equal(patientList.status, 200);
    assert.ok(patientList.body.data.some((r) => r._id.toString() === emergencyRequestId.toString()));

    // Assigned staff lists requests and sees this emergency
    const staffList = await request(app)
      .get("/api/emergency-requests")
      .set("Authorization", `Bearer ${staffToken}`);
    assert.equal(staffList.status, 200);
    assert.ok(staffList.body.data.some((r) => r._id.toString() === emergencyRequestId.toString()));

    // Other staff does not see this request
    const otherStaffList = await request(app)
      .get("/api/emergency-requests")
      .set("Authorization", `Bearer ${otherStaffToken}`);
    assert.equal(otherStaffList.status, 200);
    assert.ok(!otherStaffList.body.data.some((r) => r._id.toString() === emergencyRequestId.toString()));

    // Staff moves request to UNDER_REVIEW
    const underReview = await request(app)
      .patch(`/api/emergency-requests/${emergencyRequestId}`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "UNDER_REVIEW", note: "Triage doctor assessing ICU bed space" });
    assert.equal(underReview.status, 200);
    assert.equal(underReview.body.request.status, "UNDER_REVIEW");

    // Patient cannot arbitrarily mark request as ACCEPTED (403)
    const patientIllegalTransition = await request(app)
      .patch(`/api/emergency-requests/${emergencyRequestId}`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ status: "ACCEPTED" });
    assert.equal(patientIllegalTransition.status, 403);

    // Staff accepts request
    const acceptRes = await request(app)
      .patch(`/api/emergency-requests/${emergencyRequestId}`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "ACCEPTED", hospitalResponse: "ICU Bed 4 prepared. Dispatch ambulance immediately." });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.body.request.status, "ACCEPTED");
    assert.equal(acceptRes.body.request.hospitalResponse, "ICU Bed 4 prepared. Dispatch ambulance immediately.");

    // Complete request
    const completeRes = await request(app)
      .patch(`/api/emergency-requests/${emergencyRequestId}`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "COMPLETED", note: "Patient admitted to ICU" });
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.request.status, "COMPLETED");

    // Invalid transition after completion (e.g. back to UNDER_REVIEW) blocked (409)
    const invalidAfterComplete = await request(app)
      .patch(`/api/emergency-requests/${emergencyRequestId}`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "UNDER_REVIEW" });
    assert.equal(invalidAfterComplete.status, 409);
  });

  await t.test("Emergency request cancellation and background expiry", async () => {
    // Create a new request to test patient cancellation
    const cancelReq = await request(app)
      .post("/api/emergency-requests/emergency")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({
        hospitalId: secondaryHospital._id,
        emergencyType: "Orthopedic Injury",
        requiredFacility: "Emergency Department",
        contactPhone: "9876543210",
      });
    assert.equal(cancelReq.status, 201);
    const cancelId = cancelReq.body.request._id;

    // Patient can cancel their own request
    const cancelRes = await request(app)
      .patch(`/api/emergency-requests/${cancelId}`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ status: "CANCELLED", note: "Found private clinic closer" });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.request.status, "CANCELLED");

    // Create a stale request to test automated expiry
    const staleReq = await EmergencyRequest.create({
      requestId: "MR-EXPIRY-CHECK",
      user: patient._id,
      hospital: mainHospital._id,
      emergencyType: "General",
      requiredFacility: "Emergency Department",
      contactPhone: "9876543210",
      status: "REQUESTED",
      expiresAt: new Date(Date.now() - 10000), // Expired 10s ago
      timeline: [{ status: "REQUESTED", actor: patient._id }],
    });

    const expireResult = await expireEmergencyRequests();
    assert.ok(expireResult.expired >= 1);
    const expiredDoc = await EmergencyRequest.findById(staleReq._id);
    assert.equal(expiredDoc.status, "EXPIRED");
  });

  await t.test("Ambulance routing service and endpoint safety", async () => {
    // Test getRoute service with disabled routing provider
    const route = await getRoute({ lat: 19.0522, lng: 72.8258 }, { lat: 19.1314, lng: 72.8295 });
    assert.equal(route.configured, false);
    assert.equal(route.durationMinutes, null);
    assert.equal(route.routeDistanceKm, null);

    // Test routing endpoint /api/routing/hospital/:id
    const endpointRes = await request(app)
      .get(`/api/routing/hospital/${mainHospital._id}?lat=19.1314&lng=72.8295`);
    assert.equal(endpointRes.status, 200);
    assert.equal(endpointRes.body.configured, false);
    assert.equal(endpointRes.body.durationMinutes, null);
    assert.equal(endpointRes.body.routeDistanceKm, null);

    // Coordinates boundary validation
    const invalidCoords = await request(app)
      .get(`/api/routing/hospital/${mainHospital._id}?lat=95.0&lng=72.8295`);
    assert.equal(invalidCoords.status, 400);
  });
});
