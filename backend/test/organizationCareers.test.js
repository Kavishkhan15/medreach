import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { OrganizationApplication } from "../src/models/OrganizationApplication.js";
import { User } from "../src/models/User.js";
import { signSessionToken } from "./helpers/session.js";

const app = createApp();

describe("Organization Direct Careers & Application System", () => {
  let dbConnected = false;
  let testHospital;
  let testBloodBank;
  let testDiagnostic;
  let testAmbulance;

  let candidateUser;
  let candidateToken;
  let secondCandidateUser;
  let secondCandidateToken;
  let hospitalAdminUser;
  let hospitalAdminToken;
  let otherHospitalAdminUser;
  let otherHospitalAdminToken;
  let systemAdminUser;
  let systemAdminToken;

  before(async () => {
    try {
      await connectDB();
      dbConnected = true;

      // Clean up previous test artifacts
      await User.deleteMany({ email: { $regex: /@medreach-org-career-test\.org$/ } });
      await Hospital.deleteMany({ slug: { $regex: /org-career-test/ } });
      await ResourceProvider.deleteMany({ name: { $regex: /Org Career Test/ } });
      await OrganizationApplication.deleteMany({});

      // Create users
      candidateUser = await User.create({
        name: "Dr. Ananya Sen",
        email: "ananya.sen@medreach-org-career-test.org",
        role: "user",
        accountStatus: "active",
        emergencyContact: "+91 98201 11222",
      });
      candidateToken = await signSessionToken(candidateUser);

      secondCandidateUser = await User.create({
        name: "Nurse Rajesh Verma",
        email: "rajesh.verma@medreach-org-career-test.org",
        role: "user",
        accountStatus: "active",
      });
      secondCandidateToken = await signSessionToken(secondCandidateUser);

      hospitalAdminUser = await User.create({
        name: "Admin KEM Care",
        email: "admin.kem@medreach-org-career-test.org",
        role: "hospital_admin",
        accountStatus: "active",
      });
      hospitalAdminToken = await signSessionToken(hospitalAdminUser);

      otherHospitalAdminUser = await User.create({
        name: "Admin Lilavati Care",
        email: "admin.lilavati@medreach-org-career-test.org",
        role: "hospital_admin",
        accountStatus: "active",
      });
      otherHospitalAdminToken = await signSessionToken(otherHospitalAdminUser);

      systemAdminUser = await User.create({
        name: "System Superadmin",
        email: "superadmin@medreach-org-career-test.org",
        role: "system_admin",
        accountStatus: "active",
      });
      systemAdminToken = await signSessionToken(systemAdminUser);

      // Create Hospital
      testHospital = await Hospital.create({
        name: "Apex Super Specialty Org Career Test Hospital",
        slug: "apex-super-specialty-org-career-test",
        hospitalType: "Private",
        locality: "Bandra West",
        city: "Mumbai",
        phone: "+91 22 2600 0000",
        verificationStatus: "verified",
        specialties: ["Cardiology", "Critical Care", "Neurology"],
        admins: [hospitalAdminUser._id],
      });

      // Create Blood Bank provider
      testBloodBank = await ResourceProvider.create({
        name: "Central Mumbai Blood Bank Org Career Test",
        kind: "blood_bank",
        locality: "Parel",
        city: "Mumbai",
        phone: "+91 22 2410 1122",
        sourceName: "Automated Crawler",
        verificationStatus: "verified",
        services: ["Whole Blood", "Platelet Apheresis", "Plasma"],
      });

      // Create Diagnostic Lab provider
      testDiagnostic = await ResourceProvider.create({
        name: "Precision Imaging Diagnostics Org Career Test",
        kind: "diagnostic",
        locality: "Andheri East",
        city: "Mumbai",
        phone: "+91 22 2830 3344",
        sourceName: "Automated Crawler",
        verificationStatus: "verified",
        services: ["MRI 3T", "CT Scan", "Pathology"],
      });

      // Create Ambulance Service provider
      testAmbulance = await ResourceProvider.create({
        name: "Rapid Metro EMS Org Career Test",
        kind: "ambulance",
        locality: "Dadar",
        city: "Mumbai",
        phone: "+91 22 2420 5566",
        sourceName: "Automated Crawler",
        verificationStatus: "verified",
        services: ["Advanced Life Support", "Ventilator Ambulance"],
      });
    } catch (err) {
      console.warn("DB connection warning in test suite:", err.message);
    }
  });

  after(async () => {
    try {
      if (dbConnected) {
        await User.deleteMany({ email: { $regex: /@medreach-org-career-test\.org$/ } });
        await Hospital.deleteMany({ slug: { $regex: /org-career-test/ } });
        await ResourceProvider.deleteMany({ name: { $regex: /Org Career Test/ } });
        await OrganizationApplication.deleteMany({});
      }
      await disconnectDB();
    } catch {
      // ignore
    }
  });

  // ===========================================================================
  // 1. PUBLIC ORGANIZATIONS LISTING FOR CAREERS
  // ===========================================================================
  test("GET /api/organizations/careers returns all healthcare organizations grouped by type", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app).get("/api/organizations/careers");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.totalOrganizations >= 4);

    // Verify grouped arrays
    assert.ok(Array.isArray(res.body.hospitals));
    assert.ok(Array.isArray(res.body.bloodBanks));
    assert.ok(Array.isArray(res.body.diagnostics));
    assert.ok(Array.isArray(res.body.ambulances));

    // Verify stats object
    assert.ok(res.body.stats);
    assert.ok(res.body.stats.hospitalCount >= 1);
    assert.ok(res.body.stats.bloodBankCount >= 1);
    assert.ok(res.body.stats.diagnosticCount >= 1);
    assert.ok(res.body.stats.ambulanceCount >= 1);

    // Verify our test hospital exists in hospitals
    const foundHosp = res.body.hospitals.find((h) => h._id.toString() === testHospital._id.toString());
    assert.ok(foundHosp);
    assert.equal(foundHosp.type, "hospital");
    assert.equal(foundHosp.name, testHospital.name);

    // Verify our test blood bank exists
    const foundBb = res.body.bloodBanks.find((b) => b._id.toString() === testBloodBank._id.toString());
    assert.ok(foundBb);
    assert.equal(foundBb.type, "blood_bank");

    // Verify diagnostic
    const foundDiag = res.body.diagnostics.find((d) => d._id.toString() === testDiagnostic._id.toString());
    assert.ok(foundDiag);
    assert.equal(foundDiag.type, "diagnostic");

    // Verify ambulance
    const foundAmb = res.body.ambulances.find((a) => a._id.toString() === testAmbulance._id.toString());
    assert.ok(foundAmb);
    assert.equal(foundAmb.type, "ambulance");
  });

  test("GET /api/organizations/careers supports search keyword filtering", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app).get("/api/organizations/careers?q=Apex");
    assert.equal(res.status, 200);
    assert.ok(res.body.data.some((o) => o.name.includes("Apex")));
  });

  test("GET /api/organizations/careers supports type filter", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app).get("/api/organizations/careers?type=hospital");
    assert.equal(res.status, 200);
    assert.ok(res.body.data.every((o) => o.type === "hospital"));
  });

  // ===========================================================================
  // 2. CANDIDATE DIRECT APPLICATION TO ORGANIZATIONS
  // ===========================================================================
  test("POST /api/organizations/:id/apply requires authentication (401)", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app)
      .post(`/api/organizations/${testHospital._id}/apply`)
      .send({
        organizationType: "hospital",
        roleInterested: "Doctor / Physician",
        sop: "Valid Statement of Purpose for clinical evaluation.",
      });

    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Authentication required");
  });

  test("candidate can apply directly to a hospital with role selection and credentials", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const payload = {
      organizationType: "hospital",
      roleInterested: "Doctor / Physician",
      candidateName: "Dr. Ananya Sen",
      contactEmail: "ananya.sen@medreach-org-career-test.org",
      contactPhone: "+91 98201 11222",
      qualifications: "MD Internal Medicine, DNB Cardiology",
      experienceYears: 6,
      sop: "I am an experienced cardiologist wishing to join the interventional cardiology and cardiac emergency team at Apex Super Specialty Hospital. My background includes high-volume cath lab procedures and acute myocardial infarction management.",
      resume: {
        fileName: "Dr_Ananya_Sen_CV.pdf",
        fileType: "application/pdf",
        fileUrl: "https://storage.medreach.io/resumes/ananya_cv.pdf",
        fileSize: 204800,
      },
    };

    const res = await request(app)
      .post(`/api/organizations/${testHospital._id}/apply`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send(payload);

    assert.equal(res.status, 201);
    assert.ok(res.body.application);
    assert.equal(res.body.application.organizationType, "hospital");
    assert.equal(res.body.application.hospital.toString(), testHospital._id.toString());
    assert.equal(res.body.application.roleInterested, "Doctor / Physician");
    assert.equal(res.body.application.candidateName, "Dr. Ananya Sen");
    assert.equal(res.body.application.status, "submitted");
    assert.equal(res.body.application.resume.fileName, "Dr_Ananya_Sen_CV.pdf");
  });

  test("duplicate application to the same hospital returns 409 Conflict", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const payload = {
      organizationType: "hospital",
      roleInterested: "Doctor / Physician",
      candidateName: "Dr. Ananya Sen",
      contactEmail: "ananya.sen@medreach-org-career-test.org",
      contactPhone: "+91 98201 11222",
      sop: "Second application attempt to the same hospital facility.",
    };

    const res = await request(app)
      .post(`/api/organizations/${testHospital._id}/apply`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send(payload);

    assert.equal(res.status, 409);
    assert.equal(res.body.error, "Already applied to this organization");
  });

  test("candidate can apply directly to a ResourceProvider (Blood Bank)", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const payload = {
      organizationType: "blood_bank",
      roleInterested: "Blood Bank Technician",
      candidateName: "Nurse Rajesh Verma",
      contactEmail: "rajesh.verma@medreach-org-career-test.org",
      contactPhone: "+91 98300 44556",
      qualifications: "B.Sc Medical Laboratory Technology (MLT)",
      experienceYears: 3,
      sop: "I have 3 years of clinical experience in blood component separation, antibody screening, and transfusion safety protocols. I wish to join the central apheresis donor drive team.",
      resume: {
        fileName: "Rajesh_Verma_MLT.pdf",
        fileType: "application/pdf",
        fileUrl: "https://storage.medreach.io/resumes/rajesh_cv.pdf",
        fileSize: 154000,
      },
    };

    const res = await request(app)
      .post(`/api/organizations/${testBloodBank._id}/apply`)
      .set("Authorization", `Bearer ${secondCandidateToken}`)
      .send(payload);

    assert.equal(res.status, 201);
    assert.ok(res.body.application);
    assert.equal(res.body.application.organizationType, "blood_bank");
    assert.equal(res.body.application.provider.toString(), testBloodBank._id.toString());
    assert.equal(res.body.application.roleInterested, "Blood Bank Technician");
  });

  // ===========================================================================
  // 3. ADMIN APPLICATION MANAGEMENT & REVIEW
  // ===========================================================================
  test("assigned hospital admin can view incoming applications for their hospital", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app)
      .get(`/api/organizations/${testHospital._id}/applications`)
      .set("Authorization", `Bearer ${hospitalAdminToken}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].candidateName, "Dr. Ananya Sen");
    assert.equal(res.body.data[0].roleInterested, "Doctor / Physician");
  });

  test("unassigned hospital admin cannot view applications (403 Forbidden)", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app)
      .get(`/api/organizations/${testHospital._id}/applications`)
      .set("Authorization", `Bearer ${otherHospitalAdminToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error, "Not assigned to this hospital");
  });

  test("system admin can view and update application review status", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    // Fetch the application
    const appRecord = await OrganizationApplication.findOne({
      contactEmail: "ananya.sen@medreach-org-career-test.org",
    });
    assert.ok(appRecord);

    const updateRes = await request(app)
      .patch(`/api/organization-applications/${appRecord._id}`)
      .set("Authorization", `Bearer ${systemAdminToken}`)
      .send({ status: "shortlisted" });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.application.status, "shortlisted");

    const reloaded = await OrganizationApplication.findById(appRecord._id);
    assert.equal(reloaded.status, "shortlisted");
    assert.equal(reloaded.reviewedBy.toString(), systemAdminUser._id.toString());
  });
});
