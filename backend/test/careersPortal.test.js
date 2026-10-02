import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { Job } from "../src/models/Job.js";
import { JobApplication } from "../src/models/JobApplication.js";
import { User } from "../src/models/User.js";
import { signToken } from "../src/utils/token.js";

const app = createApp();

describe("Careers Portal & Healthcare Job Application System", () => {
  let dbConnected = false;
  let testHospital;
  let testProvider;
  let publishedHospitalJob;
  let publishedProviderJob;
  let draftJob;
  let expiredJob;

  let candidateUser;
  let candidateToken;
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
      await User.deleteMany({ email: { $regex: /@medreach-career-test\.org$/ } });
      await Hospital.deleteMany({ slug: { $regex: /careers-portal-test/ } });
      await ResourceProvider.deleteMany({ name: { $regex: /Careers Test/ } });
      await Job.deleteMany({ title: { $regex: /Careers Test/ } });

      // Create users
      candidateUser = await User.create({
        name: "Dr. Aarti Kulkarni",
        email: "aarti.kulkarni@medreach-career-test.org",
        role: "user",
        accountStatus: "active",
        emergencyContact: "+91 98200 11223",
      });
      candidateToken = signToken(candidateUser);

      hospitalAdminUser = await User.create({
        name: "Admin KEM Care",
        email: "admin.kem@medreach-career-test.org",
        role: "hospital_admin",
        accountStatus: "active",
      });
      hospitalAdminToken = signToken(hospitalAdminUser);

      otherHospitalAdminUser = await User.create({
        name: "Admin Lilavati Care",
        email: "admin.lilavati@medreach-career-test.org",
        role: "hospital_admin",
        accountStatus: "active",
      });
      otherHospitalAdminToken = signToken(otherHospitalAdminUser);

      systemAdminUser = await User.create({
        name: "Super Administrator",
        email: "superadmin@medreach-career-test.org",
        role: "system_admin",
        accountStatus: "active",
      });
      systemAdminToken = signToken(systemAdminUser);

      // Create Hospital with assigned admin
      testHospital = await Hospital.create({
        name: "KEM Apex Trauma Centre Careers Test",
        slug: "kem-apex-trauma-careers-portal-test",
        hospitalType: "Municipal",
        locality: "Parel",
        city: "Mumbai",
        verificationStatus: "verified",
        admins: [hospitalAdminUser._id],
      });

      // Create ResourceProvider (Diagnostic Lab / Ambulance)
      testProvider = await ResourceProvider.create({
        name: "Suburban Reference Diagnostics Careers Test",
        kind: "diagnostic",
        locality: "Andheri East",
        city: "Mumbai",
        sourceName: "Automated Mumbai Crawler",
        verificationStatus: "verified",
      });

      // Create Published Hospital Job
      publishedHospitalJob = await Job.create({
        hospital: testHospital._id,
        organizationType: "hospital",
        organizationName: testHospital.name,
        title: "Careers Test - Senior Trauma Surgeon",
        category: "Doctor",
        department: "Accident & Emergency",
        description: "Lead emergency triage and surgery in high-volume trauma centre.",
        requirements: "MS/MCh in Surgery with 3+ years emergency surgical experience.",
        employmentType: "full_time",
        location: "Parel, Mumbai",
        salaryText: "₹2,20,000 / month",
        status: "published",
        verificationStatus: "verified",
        createdBy: hospitalAdminUser._id,
      });

      // Create Published Provider Job (Standalone healthcare provider)
      publishedProviderJob = await Job.create({
        provider: testProvider._id,
        organizationType: "diagnostic",
        organizationName: testProvider.name,
        title: "Careers Test - Senior Molecular Pathologist",
        category: "Technician",
        department: "Molecular Diagnostics",
        description: "Operate high-throughput PCR and genetic sequencing analyzers.",
        requirements: "M.Sc in Molecular Pathology or DMLT with 2+ years experience.",
        employmentType: "contract",
        location: "Andheri East, Mumbai",
        salaryText: "₹65,000 / month",
        status: "published",
        verificationStatus: "verified",
        createdBy: systemAdminUser._id,
      });

      // Create Draft Job (should NOT appear publicly)
      draftJob = await Job.create({
        hospital: testHospital._id,
        organizationType: "hospital",
        organizationName: testHospital.name,
        title: "Careers Test - Pediatric ICU Staff Nurse (Draft)",
        category: "Nurse",
        description: "Unpublished role currently undergoing hospital medical board review.",
        employmentType: "full_time",
        status: "draft",
        createdBy: hospitalAdminUser._id,
      });

      // Create Expired Job
      expiredJob = await Job.create({
        hospital: testHospital._id,
        organizationType: "hospital",
        organizationName: testHospital.name,
        title: "Careers Test - Emergency Radiographer (Expired)",
        category: "Technician",
        description: "Past deadline position.",
        employmentType: "full_time",
        deadline: new Date(Date.now() - 86400000), // 1 day ago
        status: "published",
        verificationStatus: "verified",
        createdBy: hospitalAdminUser._id,
      });
    } catch (err) {
      console.warn("MongoDB connection warning in tests:", err.message);
    }
  });

  after(async () => {
    if (dbConnected) {
      if (publishedHospitalJob) await JobApplication.deleteMany({ job: publishedHospitalJob._id });
      if (publishedProviderJob) await JobApplication.deleteMany({ job: publishedProviderJob._id });
      if (expiredJob) await JobApplication.deleteMany({ job: expiredJob._id });
      await Job.deleteMany({ title: { $regex: /Careers Test/ } });
      await Hospital.deleteMany({ slug: { $regex: /careers-portal-test/ } });
      await ResourceProvider.deleteMany({ name: { $regex: /Careers Test/ } });
      await User.deleteMany({ email: { $regex: /@medreach-career-test\.org$/ } });
      await disconnectDB();
    }
  });

  // ===========================================================================
  // 1. ORGANIZATIONS & JOBS DISCOVERY
  // ===========================================================================
  test("GET /api/jobs returns published jobs across hospitals and resource providers", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app).get("/api/jobs");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data), "Expected data array of jobs");

    // Must find published hospital job
    const hospJob = res.body.data.find((j) => j._id === String(publishedHospitalJob._id));
    assert.ok(hospJob, "Published hospital job must be present");
    assert.equal(hospJob.title, "Careers Test - Senior Trauma Surgeon");
    assert.equal(hospJob.hospital.name, testHospital.name);
    assert.equal(hospJob.hospital.locality, "Parel");

    // Must find published resource provider job
    const provJob = res.body.data.find((j) => j._id === String(publishedProviderJob._id));
    assert.ok(provJob, "Published resource provider job must be present");
    assert.equal(provJob.title, "Careers Test - Senior Molecular Pathologist");
    assert.equal(provJob.organizationType, "diagnostic");
    assert.equal(provJob.provider.name, testProvider.name);

    // Must NOT find draft job
    const draftFound = res.body.data.find((j) => j._id === String(draftJob._id));
    assert.equal(draftFound, undefined, "Draft jobs must not appear in public listing");
  });

  test("GET /api/jobs/organizations returns organizations grouped with their jobs", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app).get("/api/jobs/organizations");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.organizations), "Expected organizations array");

    const kemOrg = res.body.organizations.find((o) => o.name === testHospital.name);
    assert.ok(kemOrg, "Hospital organization must be returned");
    assert.equal(kemOrg.type, "hospital");
    assert.ok(kemOrg.jobs.some((j) => j.title === "Careers Test - Senior Trauma Surgeon"));

    const subOrg = res.body.organizations.find((o) => o.name === testProvider.name);
    assert.ok(subOrg, "Diagnostic provider organization must be returned");
    assert.equal(subOrg.type, "diagnostic");
    assert.ok(subOrg.jobs.some((j) => j.title === "Careers Test - Senior Molecular Pathologist"));
  });

  test("GET /api/jobs/:id returns single published job with full details", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app).get(`/api/jobs/${publishedHospitalJob._id}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.job);
    assert.equal(res.body.job.title, "Careers Test - Senior Trauma Surgeon");
    assert.equal(res.body.job.hospital.name, testHospital.name);
  });

  test("GET /api/jobs supports filtering by category and search keyword", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    // Filter by category
    const catRes = await request(app).get("/api/jobs?category=Doctor");
    assert.equal(catRes.status, 200);
    assert.ok(catRes.body.data.every((j) => j.category === "Doctor"));

    // Search query
    const searchRes = await request(app).get("/api/jobs?q=Molecular");
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.body.data.some((j) => j.title.includes("Molecular")));
  });

  // ===========================================================================
  // 2. CANDIDATE APPLICATION SUBMISSION
  // ===========================================================================
  test("candidate can apply with complete details (name, phone, email, qualification, experience, resume, SOP)", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const applicationPayload = {
      candidateName: "Dr. Aarti Kulkarni",
      candidatePhone: "+91 98200 11223",
      contactEmail: "aarti.kulkarni@medreach-career-test.org",
      qualifications: "MS General Surgery, Fellowship in Trauma Care",
      experienceYears: 4,
      currentOrganization: "KEM Emergency Care",
      sop: "I have four years of surgical experience in high-volume municipal emergency units and wish to contribute to the Trauma ICU casualty rotations.",
      resume: {
        fileName: "Dr_Aarti_Kulkarni_CV.pdf",
        fileType: "application/pdf",
        fileUrl: "https://storage.medreach.io/resumes/aarti_cv.pdf",
        fileSize: 184320,
      },
    };

    const res = await request(app)
      .post(`/api/jobs/${publishedHospitalJob._id}/apply`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send(applicationPayload);

    assert.equal(res.status, 201);
    assert.ok(res.body.application);
    const appDoc = res.body.application;
    assert.equal(appDoc.job, String(publishedHospitalJob._id));
    assert.equal(appDoc.applicant, String(candidateUser._id));
    assert.equal(appDoc.candidateName, "Dr. Aarti Kulkarni");
    assert.equal(appDoc.candidatePhone, "+91 98200 11223");
    assert.equal(appDoc.contactEmail, "aarti.kulkarni@medreach-career-test.org");
    assert.equal(appDoc.qualifications, "MS General Surgery, Fellowship in Trauma Care");
    assert.equal(appDoc.experienceYears, 4);
    assert.equal(appDoc.status, "submitted");
    assert.equal(appDoc.resume.fileName, "Dr_Aarti_Kulkarni_CV.pdf");

    // Check candidate can see application in /api/applications/mine
    const mineRes = await request(app)
      .get("/api/applications/mine")
      .set("Authorization", `Bearer ${candidateToken}`);
    assert.equal(mineRes.status, 200);
    assert.ok(Array.isArray(mineRes.body.data));
    const myApp = mineRes.body.data.find((a) => a.reference === appDoc.reference);
    assert.ok(myApp, "Application must appear in applicant's list");
    assert.equal(myApp.job.title, "Careers Test - Senior Trauma Surgeon");
  });

  // ===========================================================================
  // 3. HOSPITAL & SYSTEM ADMIN REVIEW
  // ===========================================================================
  test("hospital admin can fetch applications and view candidate details", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app)
      .get(`/api/jobs/${publishedHospitalJob._id}/applications`)
      .set("Authorization", `Bearer ${hospitalAdminToken}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 1);

    const appItem = res.body.data.find((a) => a.contactEmail === "aarti.kulkarni@medreach-career-test.org");
    assert.ok(appItem, "Application must be visible to hospital admin");
    assert.equal(appItem.candidateName, "Dr. Aarti Kulkarni");
    assert.equal(appItem.candidatePhone, "+91 98200 11223");
    assert.equal(appItem.qualifications, "MS General Surgery, Fellowship in Trauma Care");
    assert.equal(appItem.experienceYears, 4);
    assert.ok(appItem.sop.includes("four years of surgical experience"));
    assert.equal(appItem.resume.fileName, "Dr_Aarti_Kulkarni_CV.pdf");
  });

  test("other hospital admin cannot view applications (403 Forbidden)", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app)
      .get(`/api/jobs/${publishedHospitalJob._id}/applications`)
      .set("Authorization", `Bearer ${otherHospitalAdminToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error, "Not assigned to this hospital");
  });

  test("hospital admin can review and update application status (under_review, shortlisted, rejected)", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const existingApp = await JobApplication.findOne({
      job: publishedHospitalJob._id,
      applicant: candidateUser._id,
    });
    assert.ok(existingApp);

    const res = await request(app)
      .patch(`/api/applications/${existingApp._id}`)
      .set("Authorization", `Bearer ${hospitalAdminToken}`)
      .send({ status: "shortlisted" });

    assert.equal(res.status, 200);
    assert.equal(res.body.application.status, "shortlisted");
    assert.equal(String(res.body.application.reviewedBy), String(hospitalAdminUser._id));
  });

  // ===========================================================================
  // 4. VALIDATION & EDGE CASES
  // ===========================================================================
  test("rejects application without Statement of Purpose (SOP) with 400 Bad Request", async () => {
    const fakeJobId = "507f1f77bcf86cd799439011";
    const res = await request(app)
      .post(`/api/jobs/${fakeJobId}/apply`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({
        candidateName: "Dr. Aarti Kulkarni",
        contactEmail: "aarti.kulkarni@medreach-career-test.org",
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Validation failed");
  });

  test("rejects duplicate application by the same candidate with 409 Conflict", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app)
      .post(`/api/jobs/${publishedHospitalJob._id}/apply`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({
        sop: "Submitting a second application to test uniqueness constraint.",
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error, "Already applied");
  });

  test("rejects application when job deadline has passed with 409 Conflict", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const res = await request(app)
      .post(`/api/jobs/${expiredJob._id}/apply`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({
        sop: "Applying to expired position should trigger deadline validation.",
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error, "Applications closed");
  });

  test("rejects application to non-existent job with 404 Not Found", async (t) => {
    if (!dbConnected) return t.skip("MongoDB required");

    const nonExistentId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/jobs/${nonExistentId}/apply`)
      .set("Authorization", `Bearer ${candidateToken}`)
      .send({
        sop: "Statement of purpose submitted to non-existent job ID.",
      });

    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Job not found");
  });
});
