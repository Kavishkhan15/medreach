import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { Job } from "../src/models/Job.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { DataConflict } from "../src/models/DataConflict.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { expireEmergencyRequests } from "../src/services/emergencyRequestExpiry.js";
import { signSessionToken } from "./helpers/session.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { digestToken } from "../src/services/authTokenService.js";

const uri = process.env.MEDREACH_PRODUCT_TEST_MONGO_URI;
const isolated = Boolean(uri && /\/medreach_product_integration(?:\?|$)/.test(uri));
test("product workflow: register, ownership, request response, emails, jobs, resources, analytics", {
  skip: !isolated,
  timeout: 60000,
}, async () => {
  await connectDB(uri);
  await mongoose.connection.dropDatabase();
  const app = createApp();
  try {
    const register = await request(app).post("/api/auth/register").send({ name: "Test Patient", email: "patient@medreach.test", password: "SafePassword123" });
    assert.equal(register.status, 202);
    assert.equal("verificationLink" in register.body, false);
    assert.equal("token" in register.body, false);
    const user = await User.findOne({ email: "patient@medreach.test" });
    assert.equal(await EmailDelivery.countDocuments({ status: "disabled" }) > 0, true);
    const verifyToken = "v".repeat(43);
    await AuthToken.updateOne({ purpose: "verify_email", user: user._id }, { $set: { tokenHash: digestToken(verifyToken) } });
    const verified = await request(app).post("/api/auth/verify-email").send({ token: verifyToken });
    assert.equal(verified.status, 200);
    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: "patient@medreach.test" });
    assert.equal(forgot.status, 200);
    const resetToken = "r".repeat(43);
    await AuthToken.updateOne({ purpose: "reset_password", user: user._id }, { $set: { tokenHash: digestToken(resetToken) } });
    const reset = await request(app).post("/api/auth/reset-password").send({ token: resetToken, password: "NewPassword123" });
    assert.equal(reset.status, 200);
    const login = await request(app).post("/api/auth/login").send({ email: "patient@medreach.test", password: "NewPassword123" });
    assert.equal(login.status, 200);
    const patientToken = await signSessionToken(await User.findById(user._id).select("+authVersion"));
    const staff = new User({ name: "Hospital Staff", email: "staff@medreach.test", role: "user" });
    await staff.setPassword("SafePassword123"); await staff.save();
    const admin = new User({ name: "System Admin", email: "admin@medreach.test", role: "system_admin" });
    await admin.setPassword("SafePassword123"); await admin.save();
    const staffToken = await signSessionToken(staff); const adminToken = await signSessionToken(admin);
    const hospital = await Hospital.create({ name: "Integration Hospital", city: "Mumbai", locality: "Bandra", hospitalType: "Private", address: "Demo Road", pincode: "400050" });
    const other = await Hospital.create({ name: "Other Integration Hospital", city: "Mumbai", locality: "Andheri", hospitalType: "Private", address: "Other Road", pincode: "400053" });
    const otherHospitalStaff = new User({ name: "Other Hospital Staff", email: "other@test.io", role: "hospital_admin" });
    await otherHospitalStaff.setPassword("SafePassword123"); await otherHospitalStaff.save();
    other.admins = [otherHospitalStaff._id]; await other.save();
    const otherHospitalStaffToken = await signSessionToken(otherHospitalStaff);
    const claim = await request(app).post("/api/hospital-admin/ownership-claims").set("Authorization", `Bearer ${staffToken}`)
      .send({ hospitalId: hospital.id, hospitalEmail: "staff@integration.example", explanation: "Hospital staff test" });
    assert.equal(claim.status, 201);
    const reviewed = await request(app).post(`/api/admin/ownership-claims/${claim.body.claim._id}/review`).set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve", note: "Verified for integration test" });
    assert.equal(reviewed.status, 200);
    const freshStaff = await User.findById(staff._id);
    const hospitalDoc = await Hospital.findById(hospital._id);
    assert.equal(freshStaff.role, "hospital_admin"); assert.equal(hospitalDoc.admins.some((id) => String(id) === String(staff._id)), true);
    const staffRoleToken = await signSessionToken(freshStaff);
    const forbidden = await request(app).post(`/api/hospitals/${other.id}/availability`).set("Authorization", `Bearer ${staffRoleToken}`)
      .send({ facility: "ICU", status: "available", quantity: 2 });
    assert.equal(forbidden.status, 403);
    const observation = await request(app).post(`/api/hospitals/${hospital.id}/availability`).set("Authorization", `Bearer ${staffRoleToken}`)
      .send({ facility: "ICU", status: "available", quantity: 2 });
    assert.equal(observation.status, 201);
    const invalidQuantity = await request(app).post(`/api/hospitals/${hospital.id}/availability`).set("Authorization", `Bearer ${staffRoleToken}`)
      .send({ facility: "ICU", status: "unknown", quantity: 2 });
    assert.equal(invalidQuantity.status, 400);
    const staffClaimForbidden = await request(app).post(`/api/hospital-admin/hospitals/${other.id}/facility-claims`)
      .set("Authorization", `Bearer ${staffRoleToken}`)
      .send({ facility: "Blood Bank", capability: "yes", evidenceText: "Hospital staff statement for testing" });
    assert.equal(staffClaimForbidden.status, 403);
    const staffClaim = await request(app).post(`/api/hospital-admin/hospitals/${hospital.id}/facility-claims`)
      .set("Authorization", `Bearer ${staffRoleToken}`)
      .send({ facility: "Blood Bank", capability: "yes", evidenceText: "Hospital staff statement for testing" });
    assert.equal(staffClaim.status, 201);
    assert.equal(staffClaim.body.claim.verificationStatus, "unverified");
    assert.equal(staffClaim.body.claim.evidenceText, "Hospital staff statement for testing");
    assert.equal(await AuditLog.countDocuments({ entityType: "FacilitySourceClaim", entityId: staffClaim.body.claim._id }), 1);
    const staffClaimList = await request(app).get(`/api/hospital-admin/hospitals/${hospital.id}/facility-claims`)
      .set("Authorization", `Bearer ${staffRoleToken}`);
    assert.equal(staffClaimList.body.data.length, 1);
    const publicHospital = await request(app).get(`/api/hospitals/${hospital.slug}`);
    const bloodBank = publicHospital.body.hospital.facilities.find((item) => item.facility === "Blood Bank");
    assert.equal(bloodBank.capability, "yes");
    assert.equal(bloodBank.status, "unknown");
    assert.equal(bloodBank.count, null);
    const secondStaff = new User({ name: "Second Hospital Staff", email: "second@medreach.test", role: "hospital_admin" });
    await secondStaff.setPassword("SafePassword123"); await secondStaff.save();
    await Hospital.updateOne({ _id: hospital._id }, { $addToSet: { admins: secondStaff._id } });
    const secondClaim = await request(app).post(`/api/hospital-admin/hospitals/${hospital.id}/facility-claims`)
      .set("Authorization", `Bearer ${await signSessionToken(secondStaff)}`)
      .send({ facility: "Blood Bank", capability: "no", evidenceText: "Second staff disputes this facility" });
    assert.equal(secondClaim.status, 201);
    assert.equal(secondClaim.body.resolution.conflict, true);
    assert.equal(secondClaim.body.resolution.capability, "unknown");
    const conflict = await DataConflict.findOne({ hospital: hospital._id, facility: "Blood Bank" });
    assert.equal(conflict.status, "open");
    assert.equal(conflict.claims.length, 2);
    const reviewedCapability = await request(app).post(`/api/admin/facility-claims/${staffClaim.body.claim._id}/review`)
      .set("Authorization", `Bearer ${adminToken}`).send({ decision: "approve", note: "Reviewed staff evidence" });
    assert.equal(reviewedCapability.status, 200);
    const resolvedConflict = await DataConflict.findById(conflict._id);
    assert.equal(resolvedConflict.status, "resolved");
    assert.equal(resolvedConflict.claims.length, 2);
    assert.equal(resolvedConflict.history.length >= 2, true);
    const created = await request(app).post("/api/emergency-requests/emergency").set("Authorization", `Bearer ${patientToken}`)
      .send({ hospitalId: hospital.id, emergencyType: "cardiac", requiredFacility: "ICU", contactPhone: "9999999999" });
    assert.equal(created.status, 201);
    const reqId = created.body.request._id;
    const staffList = await request(app).get("/api/emergency-requests").set("Authorization", `Bearer ${staffRoleToken}`);
    assert.equal(staffList.status, 200); assert.equal(staffList.body.data.length, 1);
    const noOtherStaffAccess = await request(app).get(`/api/emergency-requests/${reqId}`).set("Authorization", `Bearer ${otherHospitalStaffToken}`);
    assert.equal(noOtherStaffAccess.status, 403);
    const review = await request(app).patch(`/api/emergency-requests/${reqId}`).set("Authorization", `Bearer ${staffRoleToken}`).send({ status: "UNDER_REVIEW" });
    assert.equal(review.status, 200);
    const accepted = await request(app).patch(`/api/emergency-requests/${reqId}`).set("Authorization", `Bearer ${staffRoleToken}`).send({ status: "ACCEPTED" });
    assert.equal(accepted.status, 200);
    const ownerView = await request(app).get(`/api/emergency-requests/${reqId}`).set("Authorization", `Bearer ${patientToken}`);
    assert.equal(ownerView.body.request.status, "ACCEPTED"); assert.equal(ownerView.body.request.timeline.length, 4);
    assert.equal(await mongoose.connection.collection("notifications").countDocuments(), 0);
    assert.equal((await request(app).get("/api/notifications").set("Authorization", `Bearer ${patientToken}`)).status, 404);
    const job = await request(app).post("/api/jobs").set("Authorization", `Bearer ${staffRoleToken}`)
      .send({ hospital: hospital.id, title: "Emergency Nurse", category: "Nurse", description: "Support emergency care delivery", employmentType: "full_time" });
    assert.equal(job.status, 201);
    const pending = await request(app).post(`/api/jobs/${job.body.job._id}/status`).set("Authorization", `Bearer ${staffRoleToken}`).send({ status: "published" });
    assert.equal(pending.body.job.status, "pending");
    const published = await request(app).post(`/api/jobs/${job.body.job._id}/status`).set("Authorization", `Bearer ${adminToken}`).send({ status: "published" });
    assert.equal(published.body.job.status, "published");
    const applied = await request(app).post(`/api/jobs/${job.body.job._id}/apply`).set("Authorization", `Bearer ${patientToken}`).send({ statement: "I have relevant nursing experience." });
    assert.equal(applied.status, 201);
    const listed = await request(app).get(`/api/jobs/${job.body.job._id}/applications`).set("Authorization", `Bearer ${staffRoleToken}`);
    assert.equal(listed.body.data.length, 1);
    const shortlisted = await request(app).patch(`/api/applications/${listed.body.data[0]._id}`).set("Authorization", `Bearer ${staffRoleToken}`).send({ status: "shortlisted" });
    assert.equal(shortlisted.status, 200);
    const provider = await request(app).post("/api/admin/resources").set("Authorization", `Bearer ${adminToken}`)
      .send({ kind: "blood_bank", name: "Test Blood Bank", sourceName: "Integration fixture", demo: true });
    assert.equal(provider.status, 201);
    const blood = await request(app).get("/api/blood-banks");
    assert.equal(blood.status, 200); assert.equal(blood.body.currentInventory, "unknown"); assert.equal(blood.body.data.length, 1);
    for (const kind of ["diagnostic", "ambulance"]) {
      const createdProvider = await request(app).post("/api/admin/resources").set("Authorization", `Bearer ${adminToken}`)
        .send({ kind, name: `Test ${kind}`, sourceName: "Integration fixture", demo: true });
      assert.equal(createdProvider.status, 201);
    }
    assert.equal((await request(app).get("/api/diagnostics")).body.data.length, 1);
    assert.equal((await request(app).get("/api/ambulances")).body.liveDispatch, false);
    const noRouting = await request(app).get(`/api/routing/hospital/${hospital.id}?lat=19.1&lng=72.9`);
    assert.equal(noRouting.status, 200); assert.equal(noRouting.body.durationMinutes, null);
    const emailStatus = await request(app).get("/api/email/status").set("Authorization", `Bearer ${adminToken}`);
    assert.equal(emailStatus.status, 200); assert.equal(emailStatus.body.enabled, false);
    const geminiStatus = await request(app).get("/api/admin/refinement/status").set("Authorization", `Bearer ${adminToken}`);
    assert.equal(geminiStatus.status, 200); assert.equal(geminiStatus.body.configured, false);
    const analytics = await request(app).get("/api/analytics/overview").set("Authorization", `Bearer ${adminToken}`);
    assert.equal(analytics.status, 200); assert.equal(analytics.body.hospitals.total, 2);
    assert.equal(await AuditLog.countDocuments({ entityType: "EmergencyRequest" }) >= 3, true);
    assert.equal(await Job.countDocuments(), 1); assert.equal(await ResourceProvider.countDocuments(), 3);
    const expiring = await EmergencyRequest.create({ requestId: "MR-EXPIRY-TEST", user: user._id,
      hospital: hospital._id, emergencyType: "general", requiredFacility: "Emergency Department",
      contactPhone: "9999999999", status: "REQUESTED", expiresAt: new Date(Date.now() - 60000),
      timeline: [{ status: "REQUESTED", actor: user._id }] });
    assert.equal((await expireEmergencyRequests()).expired, 1);
    assert.equal((await EmergencyRequest.findById(expiring._id)).status, "EXPIRED");
  } finally { await mongoose.connection.dropDatabase(); await disconnectDB(); }
});
