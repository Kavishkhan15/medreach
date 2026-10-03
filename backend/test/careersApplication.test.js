import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { User } from "../src/models/User.js";
import { Job } from "../src/models/Job.js";
import { JobApplication } from "../src/models/JobApplication.js";
import { signSessionToken } from "./helpers/session.js";

const testDbUri = "mongodb://127.0.0.1:27017/medreach_careers_test";

test("Careers Resume & Statement of Purpose (SOP) application test suite", async (t) => {
  let app;
  let applicantToken;
  let applicantUser;
  let staffToken;
  let staffUser;
  let hospital;
  let publishedJob;

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
    app = createApp();

    applicantUser = await User.create({
      name: "Nurse Priya Sharma",
      email: "priya.nurse@medreach.test",
      role: "user",
    });
    applicantToken = await signSessionToken(applicantUser);

    staffUser = await User.create({
      name: "Dr. Hospital HR",
      email: "hr@lilavati.test",
      role: "hospital_admin",
    });
    staffToken = await signSessionToken(staffUser);

    hospital = await Hospital.create({
      name: "Lilavati Hospital",
      slug: "lilavati-hospital",
      locality: "Bandra West",
      city: "Mumbai",
      admins: [staffUser._id],
      location: { type: "Point", coordinates: [72.8295, 19.0519] },
    });

    publishedJob = await Job.create({
      hospital: hospital._id,
      title: "Senior ICU Nurse",
      category: "Nurse",
      description: "Providing intensive nursing care in critical units.",
      employmentType: "full_time",
      status: "published",
      createdBy: staffUser._id,
      verificationStatus: "verified",
    });
  });

  t.after(async () => {
    try {
      if (mongoose.connection?.readyState === 1) {
        await mongoose.connection.dropDatabase();
      }
      await disconnectDB();
    } catch {
      // ignore
    }
  });

  await t.test("POST /api/jobs/:id/apply accepts resume and SOP of ~200 words", async () => {
    // Generate a ~200-word Statement of Purpose
    const sampleSop = `I am writing to express my strong interest in the Senior ICU Nurse position at Lilavati Hospital. With over seven years of intensive care and critical nursing experience at leading tertiary care centers in Mumbai, I have developed extensive expertise in managing mechanically ventilated patients, administering vasoactive infusions, and coordinating rapid response protocols during clinical emergencies.

Throughout my clinical tenure, I have demonstrated compassionate bedside care, strict adherence to infection control standards, and clear multidisciplinary communication with intensivists, surgeons, and patient families. My training includes advanced cardiac life support certification, arterial line management, continuous renal replacement therapy, and electronic health record documentation.

Lilavati Hospital is renowned for its clinical excellence and compassionate healthcare delivery. Joining your critical care team offers an exceptional opportunity to contribute my clinical background, mentor junior nursing staff, and uphold patient-first standards of care. I look forward to bringing my diligence, technical competence, and dedication to your emergency and critical care departments.`;

    const wordCount = sampleSop.trim().split(/\s+/).length;
    assert.ok(wordCount >= 150 && wordCount <= 250, `Word count should be around 200 (was ${wordCount})`);

    const resumePayload = {
      fileName: "Priya_Sharma_Resume.pdf",
      fileType: "application/pdf",
      fileUrl: "data:application/pdf;base64,JVBERi0xLjQK",
      fileSize: 245600,
    };

    const res = await request(app)
      .post(`/api/jobs/${publishedJob._id}/apply`)
      .set("Authorization", `Bearer ${applicantToken}`)
      .send({
        sop: sampleSop,
        resume: resumePayload,
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.application);
    assert.equal(res.body.application.sop, sampleSop);
    assert.equal(res.body.application.statement, sampleSop);
    assert.equal(res.body.application.resume.fileName, "Priya_Sharma_Resume.pdf");
    assert.equal(res.body.application.resume.fileSize, 245600);
    assert.equal(res.body.application.status, "submitted");
  });

  await t.test("GET /api/jobs/:id/applications returns resume and SOP to hospital staff", async () => {
    const res = await request(app)
      .get(`/api/jobs/${publishedJob._id}/applications`)
      .set("Authorization", `Bearer ${staffToken}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);

    const appRecord = res.body.data[0];
    assert.equal(appRecord.applicant.name, "Nurse Priya Sharma");
    assert.ok(appRecord.sop.includes("Senior ICU Nurse"));
    assert.equal(appRecord.resume.fileName, "Priya_Sharma_Resume.pdf");
    assert.equal(appRecord.resume.fileType, "application/pdf");
  });
});
