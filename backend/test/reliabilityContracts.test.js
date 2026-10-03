import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { BloodRequest } from "../src/models/BloodRequest.js";
import { AmbulanceBooking } from "../src/models/AmbulanceBooking.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { Job } from "../src/models/Job.js";
import { JobApplication } from "../src/models/JobApplication.js";
import { OrganizationApplication } from "../src/models/OrganizationApplication.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { HospitalFacility } from "../src/models/HospitalFacility.js";
import { AvailabilityObservation } from "../src/models/AvailabilityObservation.js";
import { searchHospitals, searchBloodBanks, searchAmbulances, getHospitalDetails } from "../src/services/assistantTools.js";
import { setEmailTransportFactoryForTests, sendEmailEvent } from "../src/services/emailService.js";
import { sendUserEmailSafely } from "../src/services/userEmailService.js";
import { signSessionToken } from "./helpers/session.js";

const uri = "mongodb://127.0.0.1:27017/medreach_reliability_contracts_test";

test("backend reliability contracts", async (t) => {
  const app = createApp();
  let user;
  let admin;
  let hospital;
  let ambulance;
  let bloodBank;
  const originalEmail = { enabled: env.emailEnabled, host: env.smtpHost, from: env.smtpFrom };

  t.before(async () => {
    await connectDB(uri);
    await mongoose.connection.dropDatabase();
    user = await User.create({ name: "Reliability User", email: "reliability@example.test", role: "user" });
    admin = await User.create({ name: "Reliability Admin", email: "reliability-admin@example.test", role: "system_admin" });
    hospital = await Hospital.create({ name: "Reliability Hospital", city: "Mumbai" });
    ambulance = await ResourceProvider.create({ kind: "ambulance", name: "Reliable Ambulance", sourceName: "Test registry", active: true });
    bloodBank = await ResourceProvider.create({ kind: "blood_bank", name: "Example Blood Bank", sourceName: "Test registry", active: true });
  });

  t.after(async () => {
    setEmailTransportFactoryForTests();
    Object.assign(env, { emailEnabled: originalEmail.enabled, smtpHost: originalEmail.host, smtpFrom: originalEmail.from });
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  });

  await t.test("optional authentication rejects a revoked or stale presented session", async () => {
    const staleToken = await signSessionToken({ ...user.toObject(), authVersion: Number(user.authVersion || 0) + 1 });
    const response = await request(app)
      .post("/api/blood-requests/standard")
      .set("Authorization", `Bearer ${staleToken}`)
      .send({
        type: "REQUEST",
        bloodBankName: "Example Blood Bank",
        bloodGroup: "O+",
        patientOrDonorName: "Patient",
        contactPhone: "+91-98200-10000",
        urgency: "3 days",
      });
    assert.equal(response.status, 401);
    assert.equal(await BloodRequest.countDocuments(), 0);
  });

  await t.test("provider type and application contact fields are validated server-side", async () => {
    const wrongBloodProvider = await request(app)
      .post("/api/blood-requests/standard")
      .send({
        type: "REQUEST",
        providerId: ambulance.id,
        bloodBankName: ambulance.name,
        bloodGroup: "A+",
        patientOrDonorName: "Patient",
        contactPhone: "+91-98200-10000",
        urgency: "3 days",
      });
    assert.equal(wrongBloodProvider.status, 400);

    const mismatch = await request(app)
      .post(`/api/organizations/${ambulance.id}/apply`)
      .set("Authorization", `Bearer ${await signSessionToken(user)}`)
      .send({
        organizationType: "blood_bank",
        roleInterested: "Technician",
        contactEmail: "invalid",
        contactPhone: "abc",
        experienceYears: 99,
        sop: "A sufficiently detailed statement of purpose.",
      });
    assert.equal(mismatch.status, 400);

    const invalidAmbulance = await request(app)
      .post("/api/ambulances/book")
      .send({
        providerId: ambulance.id,
        patientName: "Patient",
        patientAge: 40,
        ambulanceRequired: "sometimes",
        bookingPickup: "Bandra West",
        contactPhone: "abc",
      });
    assert.equal(invalidAmbulance.status, 400);
  });

  await t.test("idempotency keys prevent duplicate requests, bookings, and applications", async () => {
    const emergencyPayload = {
      hospitalId: hospital.id,
      emergencyType: "cardiac",
      requiredFacility: "Emergency Department",
      contactPhone: "+91-98200-10000",
    };
    const firstEmergency = await request(app).post("/api/emergency-requests/emergency")
      .set("Idempotency-Key", "emergency-retry-0001").send(emergencyPayload);
    const duplicateEmergency = await request(app).post("/api/emergency-requests/emergency")
      .set("Idempotency-Key", "emergency-retry-0001").send(emergencyPayload);
    assert.equal(firstEmergency.status, 201);
    assert.equal(duplicateEmergency.status, 200);
    assert.equal(duplicateEmergency.body.request._id, firstEmergency.body.request._id);
    assert.equal(duplicateEmergency.body.trackingToken, firstEmergency.body.trackingToken);
    assert.equal(await EmergencyRequest.countDocuments(), 1);

    const bloodPayload = {
      type: "REQUEST",
      providerId: bloodBank.id,
      bloodBankName: "Example Blood Bank",
      bloodGroup: "B+",
      patientOrDonorName: "Patient",
      contactPhone: "+91-98200-10000",
      urgency: "3 days",
    };
    const firstBlood = await request(app).post("/api/blood-requests/standard")
      .set("Idempotency-Key", "blood-retry-0001").send(bloodPayload);
    const duplicateBlood = await request(app).post("/api/blood-requests/standard")
      .set("Idempotency-Key", "blood-retry-0001").send(bloodPayload);
    assert.equal(firstBlood.status, 201);
    assert.equal(duplicateBlood.status, 200);
    assert.equal(duplicateBlood.body.reference, firstBlood.body.reference);
    assert.equal(duplicateBlood.body.trackingToken, firstBlood.body.trackingToken);
    assert.equal(await BloodRequest.countDocuments(), 1);

    const ambulancePayload = {
      providerId: ambulance.id,
      patientName: "Patient",
      patientAge: 40,
      ambulanceRequired: true,
      bookingPickup: "Bandra West",
      contactPhone: "+91-98200-10000",
    };
    const firstAmbulance = await request(app).post("/api/ambulances/book")
      .set("Idempotency-Key", "ambulance-retry-0001").send(ambulancePayload);
    const duplicateAmbulance = await request(app).post("/api/ambulances/book")
      .set("Idempotency-Key", "ambulance-retry-0001").send(ambulancePayload);
    assert.equal(firstAmbulance.status, 201);
    assert.equal(duplicateAmbulance.status, 200);
    assert.equal(duplicateAmbulance.body.reference, firstAmbulance.body.reference);
    assert.equal(duplicateAmbulance.body.trackingToken, firstAmbulance.body.trackingToken);
    assert.equal(await AmbulanceBooking.countDocuments(), 1);

    const job = await Job.create({
      hospital: hospital._id,
      organizationName: hospital.name,
      title: "Reliability Nurse",
      category: "Nurse",
      description: "Provide reliable patient care and clinical support.",
      employmentType: "full_time",
      status: "published",
      createdBy: admin._id,
    });
    const applicationPayload = { contactPhone: "+91-98200-10101", sop: "A sufficiently detailed statement of purpose for this role." };
    assert.equal((await request(app).post(`/api/jobs/${job.id}/apply`)
      .set("Authorization", `Bearer ${await signSessionToken(user)}`)
      .set("Idempotency-Key", "job-application-retry-0001").send(applicationPayload)).status, 201);
    assert.equal((await request(app).post(`/api/jobs/${job.id}/apply`)
      .set("Authorization", `Bearer ${await signSessionToken(user)}`)
      .set("Idempotency-Key", "job-application-retry-0001").send(applicationPayload)).status, 200);
    assert.equal(await JobApplication.countDocuments(), 1);
    assert.equal((await JobApplication.findOne()).candidatePhone, applicationPayload.contactPhone);

    const organizationPayload = {
      organizationType: "hospital",
      roleInterested: "Staff Nurse",
      contactEmail: user.email,
      contactPhone: "+91-98200-10202",
      sop: "A sufficiently detailed statement of purpose for this hospital.",
    };
    assert.equal((await request(app).post(`/api/organizations/${hospital.id}/apply`)
      .set("Authorization", `Bearer ${await signSessionToken(user)}`)
      .set("Idempotency-Key", "organization-application-retry-0001").send(organizationPayload)).status, 201);
    assert.equal((await request(app).post(`/api/organizations/${hospital.id}/apply`)
      .set("Authorization", `Bearer ${await signSessionToken(user)}`)
      .set("Idempotency-Key", "organization-application-retry-0001").send(organizationPayload)).status, 200);
    assert.equal(await OrganizationApplication.countDocuments(), 1);
    assert.equal((await OrganizationApplication.findOne()).candidatePhone, organizationPayload.contactPhone);
    const mine = await request(app).get("/api/applications/mine")
      .set("Authorization", `Bearer ${await signSessionToken(user)}`);
    assert.equal(mine.status, 200);
    assert.deepEqual(new Set(mine.body.data.map((item) => item.applicationType)), new Set(["job", "organization"]));
  });

  await t.test("a failed audit write does not hide a saved guest emergency request or its private token", async () => {
    const originalCreate = AuditLog.create;
    AuditLog.create = async () => { throw new Error("test audit store failure"); };
    let response;
    try {
      response = await request(app).post("/api/emergency-requests/emergency")
        .set("Idempotency-Key", "audit-failure-retry-0001")
        .send({ hospitalId: hospital.id, emergencyType: "general", requiredFacility: "Emergency Department", contactPhone: "+91-98200-10303" });
    } finally {
      AuditLog.create = originalCreate;
    }
    assert.equal(response.status, 201);
    assert.equal(typeof response.body.trackingToken, "string");
    assert.ok(await EmergencyRequest.exists({ _id: response.body.request._id }));
    const replay = await request(app).post("/api/emergency-requests/emergency")
      .set("Idempotency-Key", "audit-failure-retry-0001")
      .send({ hospitalId: hospital.id, emergencyType: "general", requiredFacility: "Emergency Department", contactPhone: "+91-98200-10303" });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.trackingToken, response.body.trackingToken);
  });

  await t.test("assistant respects filters and never promotes stale or unverified availability", async () => {
    hospital.locality = "Bandra West";
    hospital.specialties = ["Cardiology"];
    await hospital.save();
    await HospitalFacility.create({ hospital: hospital.id, facility: "Emergency Department", capability: "yes", status: "available" });
    await AvailabilityObservation.create({ hospital: hospital.id, facility: "Emergency Department", status: "available",
      observedAt: new Date(Date.now() - 60 * 60 * 1000), retrievedAt: new Date(Date.now() - 60 * 60 * 1000), verificationStatus: "unverified" });
    const filteredOut = await searchHospitals({ locality: "Bandra West", specialty: "Oncology" });
    assert.deepEqual(filteredOut, []);
    const matches = await searchHospitals({ locality: "Bandra West", specialty: "Cardiology", emergencyOnly: true });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].facilityDetail.status, "unknown");
    const detail = await getHospitalDetails({ idOrSlug: hospital.id });
    assert.equal(detail.facilities.find((facility) => facility.facility === "Emergency Department").status, "unknown");
    assert.equal(detail.coordinates, null);
    assert.equal((await searchBloodBanks({ locality: "No Such Locality" })).length, 0);
    const [listedAmbulance] = await searchAmbulances({});
    assert.equal(listedAmbulance.phone, null);
    assert.equal(listedAmbulance.operatingHours, null);
    const noLocation = await Hospital.create({ name: "No Location Hospital" });
    assert.equal((await getHospitalDetails({ idOrSlug: noLocation.id })).locality, null);
  });

  await t.test("the advertised 4 MiB resume reaches a saved job application", async () => {
    const job = await Job.create({
      hospital: hospital._id, organizationName: hospital.name, title: "Resume Upload Nurse",
      category: "Nurse", description: "Provide patient care and clinical support.",
      employmentType: "full_time", status: "published", createdBy: admin._id,
    });
    const fileSize = 4 * 1024 * 1024;
    const fileUrl = `data:application/pdf;base64,${Buffer.alloc(fileSize).toString("base64")}`;
    const response = await request(app).post(`/api/jobs/${job.id}/apply`)
      .set("Authorization", `Bearer ${await signSessionToken(user)}`)
      .send({ resume: { fileName: "resume.pdf", fileType: "application/pdf", fileSize, fileUrl },
        sop: "A sufficiently detailed statement of purpose for this role." });
    assert.equal(response.status, 201);
    const stored = await JobApplication.findOne({ reference: response.body.application.reference });
    assert.equal(stored.resume.fileSize, fileSize);
    assert.equal(stored.resume.fileUrl.length, fileUrl.length);
  });

  await t.test("a post-save recipient email failure leaves the primary record recoverable", async () => {
    const existing = await EmergencyRequest.findOne();
    assert.ok(existing);
    const result = await sendUserEmailSafely({
      eventKey: `invalid-email:${existing._id}`,
      recipient: "invalid-user-id",
      emailTemplate: "emergency_updated",
      emailData: { reference: existing.requestId, status: existing.status },
    });
    assert.equal(result.status, "failed");
    assert.ok(await EmergencyRequest.exists({ _id: existing._id }));
  });

  await t.test("system administrators can retry a persisted failed non-sensitive email", async () => {
    env.emailEnabled = true;
    env.smtpHost = "smtp.example.test";
    env.smtpFrom = "sender@example.test";
    setEmailTransportFactoryForTests(() => ({ sendMail: async () => {
      const error = new Error("delivery failed");
      error.code = "ETIMEDOUT";
      throw error;
    } }));
    const booking = await AmbulanceBooking.create({
      reference: "AMB-RETRY-0001",
      provider: ambulance._id,
      providerSnapshot: { name: ambulance.name },
      requestSnapshot: {
        patientName: "Retry Patient",
        patientAge: 40,
        ambulanceRequired: true,
        pickupAddress: "Bandra West",
      },
      delivery: {
        user: { status: "not_available" },
        admin: { status: "not_available" },
        provider: { status: "pending" },
      },
      trackingTokenHash: "test-only-tracking-hash",
    });
    const failed = await sendEmailEvent({
      eventKey: "reliability-admin-email",
      to: "recipient@example.test",
      template: "admin_security",
      data: { message: "Review the saved request." },
      source: { model: "AmbulanceBooking", id: booking._id, channel: "provider" },
    });
    assert.equal(failed.status, "failed");
    booking.delivery.provider.status = "failed";
    booking.delivery.provider.attempted = true;
    booking.delivery.provider.emailDelivery = failed._id;
    await booking.save();

    setEmailTransportFactoryForTests(() => ({ sendMail: async () => ({ messageId: "retry-ok" }) }));
    const denied = await request(app)
      .post(`/api/email/deliveries/${failed._id}/retry`)
      .set("Authorization", `Bearer ${await signSessionToken(user)}`);
    assert.equal(denied.status, 403);

    const retried = await request(app)
      .post(`/api/email/deliveries/${failed._id}/retry`)
      .set("Authorization", `Bearer ${await signSessionToken(admin)}`);
    assert.equal(retried.status, 200, JSON.stringify(retried.body));
    assert.equal(retried.body.delivery.status, "sent");
    assert.equal(retried.body.delivery.attempts, 2);

    const stored = await EmailDelivery.findById(failed._id);
    assert.equal(stored.status, "sent");
    const recoveredBooking = await AmbulanceBooking.findById(booking._id);
    assert.equal(recoveredBooking.delivery.provider.status, "sent");
    assert.equal(recoveredBooking.delivery.provider.emailDelivery.toString(), failed._id.toString());

    const duplicateRetry = await request(app)
      .post(`/api/email/deliveries/${failed._id}/retry`)
      .set("Authorization", `Bearer ${await signSessionToken(admin)}`);
    assert.equal(duplicateRetry.status, 409);
    assert.equal((await EmailDelivery.findById(failed._id)).attempts, 2);
  });
});
