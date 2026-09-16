// Opt-in integration test against an isolated local MongoDB instance.
// Run with MEDREACH_TEST_MONGO_URI=mongodb://127.0.0.1:27019/medreach_fusion_integration
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signToken } from "../src/utils/token.js";
import { Hospital } from "../src/models/Hospital.js";
import { HospitalFacility } from "../src/models/HospitalFacility.js";
import { DataSource } from "../src/models/DataSource.js";
import { FacilitySourceClaim } from "../src/models/FacilitySourceClaim.js";
import { DataConflict } from "../src/models/DataConflict.js";
import { AvailabilityObservation } from "../src/models/AvailabilityObservation.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { CrawlJob } from "../src/models/CrawlJob.js";
import { CrawlResult } from "../src/models/CrawlResult.js";
import { createMongoRepo } from "../src/repos/crawlerMongoRepo.js";
import { backfillFacilityClaims } from "../src/services/backfillFacilityClaims.js";
import { HospitalFieldClaim } from "../src/models/HospitalFieldClaim.js";
import { HospitalFieldConflict } from "../src/models/HospitalFieldConflict.js";
import { backfillHospitalFieldClaims } from "../src/services/backfillHospitalFieldClaims.js";
import { User } from "../src/models/User.js";

const uri = process.env.MEDREACH_TEST_MONGO_URI;
const isolated = uri === "mongodb://127.0.0.1:27019/medreach_fusion_integration";

test("MongoDB/API: claims remain distinct; only assigned staff can make availability current", { skip: !isolated }, async () => {
  await mongoose.connect(uri);
  try {
    await mongoose.connection.dropDatabase();
    const [site, directory] = await DataSource.create([
      { name: "Mock site", sourceKey: "mock_site", type: "hospital_site" },
      { name: "Mock directory", sourceKey: "mock_directory", type: "government_directory" },
    ]);
    const hospital = await Hospital.create({ name: "Fusion Test Hospital", city: "Mumbai", sourceIds: [site._id, directory._id] });
    const repo = createMongoRepo();
    const metadata = { confidence: "HIGH", at: new Date(), sourcePageUrl: "https://example.org/hospital", evidenceText: "ICU listed on source page", parserVersion: "test-v1" };
    await repo.saveFacilityCapability(hospital._id, "ICU", { ...metadata, capability: "yes", source: "mock_site" });
    await repo.saveFacilityCapability(hospital._id, "ICU", { ...metadata, capability: "no", source: "mock_directory" });

    const conflicting = await HospitalFacility.findOne({ hospital: hospital._id, facility: "ICU" }).lean();
    assert.equal(conflicting.capability, "unknown");
    assert.equal(conflicting.capabilityConflict, true);
    assert.equal(await FacilitySourceClaim.countDocuments({ hospital: hospital._id, facility: "ICU" }), 2);
    const distinctClaims = await FacilitySourceClaim.find({ hospital: hospital._id, facility: "ICU" }).lean();
    assert.ok(distinctClaims.every((claim) => claim.source && claim.sourcePageUrl && claim.observedAt && claim.confidence && claim.verificationStatus));
    const openConflict = await DataConflict.findOne({ hospital: hospital._id, facility: "ICU" }).lean();
    assert.equal(openConflict.status, "open");
    assert.equal(openConflict.claims.length, 2);

    const before = await request(createApp()).get(`/api/hospitals/${hospital.slug}`);
    assert.equal(before.status, 200);
    assert.equal(before.body.hospital.facilities[0].status, "unknown");
    assert.equal(before.body.hospital.facilities[0].capabilityConflict, true);
    const beforeAvailable = await request(createApp()).get("/api/hospitals?status=available");
    assert.equal(beforeAvailable.body.total, 0, "legacy default must not pass a live-availability filter");

    const yesClaim = await FacilitySourceClaim.findOne({ hospital: hospital._id, source: site._id });
    const admin = await User.create({ email: "admin@example.org", name: "Test Admin", role: "system_admin" });
    const token = signToken(admin);
    const conflictList = await request(createApp()).get("/api/admin/data-conflicts")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(conflictList.status, 200);
    assert.equal(conflictList.body.data.length, 1);
    assert.equal(conflictList.body.data[0].claims[0].evidenceText, "ICU listed on source page");
    const evidence = await request(createApp()).get("/api/admin/facility-claims")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(evidence.status, 200);
    assert.ok(evidence.body.data[0].sourcePageUrl);
    assert.ok(evidence.body.data[0].observedAt);
    assert.ok(evidence.body.data[0].confidence);
    const review = await request(createApp())
      .post(`/api/admin/facility-claims/${yesClaim._id}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ decision: "approve" });
    assert.equal(review.status, 200);
    assert.equal(review.body.resolution.capability, "yes");
    assert.equal(review.body.resolution.conflict, true);
    const resolvedConflict = await DataConflict.findOne({ hospital: hospital._id, facility: "ICU" }).lean();
    assert.equal(resolvedConflict.status, "resolved");
    assert.equal(resolvedConflict.resolvedValue, "yes");
    assert.equal(resolvedConflict.history.length, 2);
    const retainedConflict = await request(createApp()).get("/api/admin/data-conflicts?status=all")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(retainedConflict.status, 200);
    assert.equal(retainedConflict.body.data[0].status, "resolved");
    assert.equal(retainedConflict.body.data[0].claims.length, 2);
    assert.equal(retainedConflict.body.data[0].history.length, 2);
    const approvalAudit = await AuditLog.findOne({ entityType: "FacilitySourceClaim", entityId: yesClaim._id, action: "verify" }).lean();
    assert.equal(approvalAudit.before.verificationStatus, "unverified");
    assert.equal(approvalAudit.after.verificationStatus, "verified");
    assert.equal((await FacilitySourceClaim.findById(yesClaim._id)).reviewHistory.length, 1);

    const after = await request(createApp()).get(`/api/hospitals/${hospital.slug}`);
    assert.equal(after.status, 200);
    assert.equal(after.body.hospital.facilities[0].capability, "yes");
    assert.equal(after.body.hospital.facilities[0].capabilityConflict, true);
    assert.equal(after.body.hospital.facilities[0].status, "unknown");
    assert.equal(after.body.hospital.bedsAvailable, null);

    const staffId = new mongoose.Types.ObjectId();
    await User.create({ _id: staffId, role: "hospital_admin", email: "staff@example.org", name: "Staff" });
    const staffToken = signToken({ _id: staffId, role: "hospital_admin", email: "staff@example.org", name: "Staff" });
    const globalSources = await request(createApp()).get("/api/sources")
      .set("Authorization", `Bearer ${staffToken}`);
    assert.equal(globalSources.status, 403, "hospital staff cannot manage the global source registry");
    const endpoint = `/api/hospitals/${hospital._id}/availability`;
    const requestBody = { facility: "ICU", status: "available", quantity: 2 };
    const unassigned = await request(createApp()).post(endpoint)
      .set("Authorization", `Bearer ${staffToken}`).send(requestBody);
    assert.equal(unassigned.status, 403);
    const unassignedEdit = await request(createApp()).put(`/api/hospitals/${hospital._id}`)
      .set("Authorization", `Bearer ${staffToken}`).send({ name: "Hijacked" });
    assert.equal(unassignedEdit.status, 403);
    await Hospital.findByIdAndUpdate(hospital._id, { $addToSet: { admins: staffId } });
    const cooper = await DataSource.create({ name: "Cooper", sourceKey: "cooper", type: "hospital_site" });
    const sourceChange = await request(createApp()).patch("/api/crawler/sources/cooper")
      .set("Authorization", `Bearer ${token}`).send({ enabled: false });
    assert.equal(sourceChange.status, 200);
    assert.equal((await AuditLog.findOne({ entityType: "DataSource", entityId: cooper._id, action: "update" })).after.enabled, false);
    const assignedEdit = await request(createApp()).put(`/api/hospitals/${hospital._id}`)
      .set("Authorization", `Bearer ${staffToken}`).send({ phone: "022-12345678", departments: ["Neurology"], name: "Hijacked" });
    assert.equal(assignedEdit.status, 200);
    assert.equal(assignedEdit.body.hospital.name, "Fusion Test Hospital", "staff cannot rewrite identity name");
    assert.equal(assignedEdit.body.hospital.phone, "022-12345678");
    assert.deepEqual(assignedEdit.body.hospital.departments, ["Neurology"]);
    assert.ok(await HospitalFieldClaim.findOne({ hospital: hospital._id, field: "specialties", assertedBy: staffId }));
    const staffClaim = await HospitalFieldClaim.findOne({ hospital: hospital._id, field: "phone", assertedBy: staffId }).lean();
    assert.equal(staffClaim.verificationStatus, "verified");
    assert.equal(staffClaim.evidenceKind, "manual_assertion");
    assert.ok(await AuditLog.findOne({ entityType: "Hospital", entityId: hospital._id, action: "update" }));
    const assigned = await request(createApp()).post(endpoint)
      .set("Authorization", `Bearer ${staffToken}`).send(requestBody);
    assert.equal(assigned.status, 201);
    const observationAudit = await AuditLog.findOne({ entityType: "AvailabilityObservation", entityId: assigned.body.observation._id }).lean();
    assert.equal(observationAudit.action, "create");
    assert.equal(String(observationAudit.user), String(staffId));
    const retiredBeds = await request(createApp()).patch(`/api/hospitals/${hospital._id}/beds`)
      .set("Authorization", `Bearer ${staffToken}`).send({ bedsAvailable: 42, emergencyStatus: "available" });
    assert.equal(retiredBeds.status, 410);
    assert.equal((await Hospital.findById(hospital._id)).bedsAvailable, 0, "retired route must not write a legacy count");
    const verifiedAvailability = await request(createApp()).get(`/api/hospitals/${hospital.slug}`);
    assert.equal(verifiedAvailability.body.hospital.facilities[0].status, "available");
    assert.equal(verifiedAvailability.body.hospital.facilities[0].count, 2);
    assert.equal(verifiedAvailability.body.hospital.facilities[0].availabilityMethod, "hospital_staff");
    const facilityResponse = await request(createApp()).get(`/api/hospitals/${hospital._id}/facilities`);
    assert.equal(facilityResponse.body.data[0].status, "available");
    const afterAvailable = await request(createApp()).get("/api/hospitals?status=available");
    assert.equal(afterAvailable.body.total, 0, "ICU availability does not imply emergency-department availability");

    const originalObservationAudit = AuditLog.create;
    AuditLog.create = async () => { throw new Error("audit storage unavailable"); };
    try {
      const countBefore = await AvailabilityObservation.countDocuments({ hospital: hospital._id });
      const unauditedObservation = await request(createApp()).post(endpoint)
        .set("Authorization", `Bearer ${staffToken}`).send(requestBody);
      assert.equal(unauditedObservation.status, 500);
      assert.equal(await AvailabilityObservation.countDocuments({ hospital: hospital._id }), countBefore);
    } finally {
      AuditLog.create = originalObservationAudit;
    }

    // A changed source excerpt invalidates the old approval, reopening review.
    await repo.saveFacilityCapability(hospital._id, "ICU", {
      ...metadata, evidenceText: "ICU wording changed on the source page",
      capability: "yes", source: "mock_site",
    });
    const reopened = await DataConflict.findOne({ hospital: hospital._id, facility: "ICU" }).lean();
    assert.equal(reopened.status, "open");
    assert.equal(reopened.history.length, 3);
    assert.equal((await FacilitySourceClaim.findById(yesClaim._id)).verificationStatus, "unverified");
    assert.equal((await FacilitySourceClaim.findById(yesClaim._id)).reviewHistory.length, 1, "source change must retain prior review history");
    const reject = await request(createApp()).post(`/api/admin/facility-claims/${yesClaim._id}/review`)
      .set("Authorization", `Bearer ${token}`).send({ decision: "reject", note: "Source wording changed" });
    assert.equal(reject.status, 200);
    const rejectionAudit = await AuditLog.findOne({ entityType: "FacilitySourceClaim", entityId: yesClaim._id, action: "reject" }).lean();
    assert.equal(rejectionAudit.before.verificationStatus, "unverified");
    assert.equal(rejectionAudit.after.verificationStatus, "rejected");
    assert.equal(rejectionAudit.after.reviewNote, "Source wording changed");
    const reviewedClaim = await FacilitySourceClaim.findById(yesClaim._id);
    assert.deepEqual(reviewedClaim.reviewHistory.map((entry) => entry.decision), ["approve", "reject"]);

    // Audit storage failure must not leave an unaudited approved claim.
    const originalAuditCreate = AuditLog.create;
    AuditLog.create = async () => { throw new Error("audit storage unavailable"); };
    try {
      const unaudited = await request(createApp()).post(`/api/admin/facility-claims/${yesClaim._id}/review`)
        .set("Authorization", `Bearer ${token}`).send({ decision: "approve" });
      assert.equal(unaudited.status, 500);
      assert.equal((await FacilitySourceClaim.findById(yesClaim._id)).verificationStatus, "rejected");
      assert.equal((await FacilitySourceClaim.findById(yesClaim._id)).reviewHistory.length, 2);
    } finally {
      AuditLog.create = originalAuditCreate;
    }

    // Even a faulty adapter cannot turn static capability into live capacity.
    const staticObservation = await repo.addObservation({ hospitalId: hospital._id, facility: "ICU", sourceId: "mock_site", status: "available", quantity: 42, verificationStatus: "verified" });
    assert.equal(staticObservation.status, "unknown");
    assert.equal(staticObservation.quantity, null);
    assert.equal(staticObservation.verificationStatus, "unverified");
    assert.equal((await AvailabilityObservation.findById(staticObservation._id)).quantity, null);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("MongoDB migration: legacy facilities gain source claims without losing directory provenance", { skip: !isolated }, async () => {
  await mongoose.connect(uri);
  try {
    await mongoose.connection.dropDatabase();
    const [site, secondSite, directory] = await DataSource.create([
      { name: "Site A", sourceKey: "site_a", type: "hospital_site", url: "https://a.example.org" },
      { name: "Site B", sourceKey: "site_b", type: "hospital_site", url: "https://b.example.org" },
      { name: "City directory", sourceKey: "directory", type: "government_directory", url: "https://city.example.org/hospitals" },
    ]);
    const hospital = await Hospital.create({ name: "Central Hospital", city: "Mumbai", pincode: "400001", address: "Main Road", sourceIds: [site._id, directory._id] });
    await HospitalFacility.create({ hospital: hospital._id, facility: "ICU", capability: "yes", status: "available", count: 42, source: site._id, confidence: "HIGH" });
    await HospitalFacility.create({ hospital: hospital._id, facility: "MRI", capability: "yes", status: "unknown", count: null });
    const [jobA, jobB, jobDirectory] = await CrawlJob.create([
      { source: site._id, status: "success" }, { source: secondSite._id, status: "success" }, { source: directory._id, status: "success" },
    ]);
    await CrawlResult.create([
      { job: jobA._id, source: site._id, hospital: hospital._id, valid: true, applied: true, payload: { facilities: [{ facility: "ICU", capability: "yes", evidenceText: "ICU service" }], provenance: { sourcePageUrl: "https://a.example.org/icu", parserVersion: "a-v1" }, retrievedAt: new Date().toISOString() } },
      { job: jobB._id, source: secondSite._id, hospital: hospital._id, valid: true, applied: true, payload: { facilities: [{ facility: "ICU", capability: "no" }], provenance: { sourcePageUrl: "https://b.example.org/icu", parserVersion: "b-v1" }, retrievedAt: new Date().toISOString() } },
      { job: jobDirectory._id, source: directory._id, hospital: hospital._id, valid: true, applied: true, payload: { directoryListing: { name: "Central Hospital", pincode: "400001" } } },
    ]);
    const preview = await backfillFacilityClaims({ dryRun: true });
    assert.equal(preview.created, 3);
    assert.equal(await FacilitySourceClaim.countDocuments(), 0);
    const applied = await backfillFacilityClaims({ dryRun: false });
    assert.equal(applied.created, 3);
    assert.equal((await backfillFacilityClaims({ dryRun: false })).created, 0);
    const claims = await FacilitySourceClaim.find({ hospital: hospital._id }).lean();
    assert.equal(claims.length, 3);
    assert.ok(claims.every((claim) => claim.source && claim.sourcePageUrl && claim.observedAt && claim.confidence && claim.verificationStatus));
    assert.equal(claims.find((claim) => String(claim.source) === String(site._id) && claim.facility === "ICU").confidence, "HIGH", "legacy source confidence must survive a default-UNKNOWN crawl result");
    assert.equal(claims.find((claim) => String(claim.source) === String(site._id) && claim.facility === "ICU").evidenceText, "ICU service");
    assert.match(claims.find((claim) => String(claim.source) === String(secondSite._id) && claim.facility === "ICU").evidenceText, /Historical normalized crawl record/);
    assert.equal(claims.find((claim) => claim.facility === "MRI").evidenceKind, "legacy_snapshot");
    const legacyFacility = await HospitalFacility.findOne({ hospital: hospital._id, facility: "ICU" }).lean();
    assert.equal(legacyFacility.status, "unknown");
    assert.equal(legacyFacility.count, null);
    assert.equal((await DataConflict.findOne({ hospital: hospital._id, facility: "ICU" })).status, "open");
    const migrated = await request(createApp()).get(`/api/hospitals/${hospital.slug}`);
    assert.equal(migrated.body.hospital.facilities.find((facility) => facility.facility === "ICU").capability, "unknown");
    assert.equal(migrated.body.hospital.facilities.find((facility) => facility.facility === "ICU").status, "unknown");
    assert.equal(migrated.body.hospital.bedsAvailable, null);
    const stillLinked = await Hospital.findById(hospital._id).lean();
    assert.ok(stillLinked.sourceIds.some((id) => String(id) === String(directory._id)));
    assert.equal(await CrawlResult.countDocuments({ source: directory._id, hospital: hospital._id }), 1);
    const repo = createMongoRepo();
    assert.equal((await repo.getPreviousRecord(hospital._id, "site_a")).provenance.parserVersion, "a-v1");
    assert.equal((await repo.getPreviousRecord(hospital._id, "site_b")).provenance.parserVersion, "b-v1");
    assert.equal(await repo.findHospitalByName({ name: "Central Hospital North", pincode: "400001" }, "directory"), null);
    assert.equal((await repo.findHospitalByName({ name: "Central Hospital", pincode: "400001", address: "Main Road" }, "directory"))._id.toString(), hospital._id.toString());
    const fieldPreview = await backfillHospitalFieldClaims({ dryRun: true });
    assert.ok(fieldPreview.created > 0);
    assert.equal(await HospitalFieldClaim.countDocuments(), 0);
    await backfillHospitalFieldClaims({ dryRun: false });
    assert.equal((await backfillHospitalFieldClaims({ dryRun: false })).created, 0);
    assert.ok(await HospitalFieldClaim.findOne({ hospital: hospital._id, field: "name", source: directory._id }));
    assert.ok((await Hospital.findById(hospital._id)).sourceIds.some((id) => String(id) === String(directory._id)));
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("MongoDB migration repairs old claim metadata without revoking its review", { skip: !isolated }, async () => {
  await mongoose.connect(uri);
  try {
    await mongoose.connection.dropDatabase();
    const source = await DataSource.create({ name: "Historic site", sourceKey: "historic_site", type: "hospital_site", url: "https://historic.example.org" });
    const hospital = await Hospital.create({ name: "Historic Hospital", city: "Mumbai", sourceIds: [source._id] });
    const claimId = new mongoose.Types.ObjectId();
    await FacilitySourceClaim.collection.insertOne({
      _id: claimId, hospital: hospital._id, facility: "ICU", source: source._id,
      capability: "yes", confidence: "MEDIUM", verificationStatus: "verified", createdAt: new Date("2025-01-01T00:00:00Z"),
    });
    const preview = await backfillFacilityClaims({ dryRun: true });
    assert.equal(preview.created, 0);
    assert.equal(preview.metadataRepaired, 1);
    await backfillFacilityClaims({ dryRun: false });
    const repaired = await FacilitySourceClaim.findById(claimId).lean();
    assert.equal(repaired.sourcePageUrl, "https://historic.example.org");
    assert.ok(repaired.observedAt);
    assert.equal(repaired.verificationStatus, "verified");
    assert.equal(repaired.confidence, "MEDIUM");
    assert.equal(await FacilitySourceClaim.countDocuments(), 1);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("MongoDB/API: conflicting contact and specialty claims retain both sources until review", { skip: !isolated }, async () => {
  await mongoose.connect(uri);
  try {
    await mongoose.connection.dropDatabase();
    const [siteA, siteB] = await DataSource.create([
      { name: "Site A", sourceKey: "site_a", type: "hospital_site", url: "https://a.example.org" },
      { name: "Site B", sourceKey: "site_b", type: "hospital_site", url: "https://b.example.org" },
    ]);
    const repo = createMongoRepo();
    const makeRecord = (sourceId, phone, specialties) => ({
      hospital: { name: "Bandra Hospital", address: "Main Road", pincode: "400050", city: "Mumbai", phone },
      specialties, confidence: "MEDIUM", retrievedAt: new Date().toISOString(),
      fieldEvidence: { phone: { sourcePageUrl: `https://${sourceId}.example.org/contact`,
        evidenceText: `Contact telephone ${phone}` } },
      provenance: { sourceId, sourcePageUrl: `https://${sourceId}.example.org/hospital`, parserVersion: "test-v1" },
    });
    const first = await repo.upsertHospital(makeRecord("site_a", "022-11111111", ["Cardiology"]));
    const second = await repo.upsertHospital(makeRecord("site_b", "022-22222222", ["Neurology"]));
    assert.equal(String(first._id), String(second._id));
    const snapshot = await Hospital.findById(first._id).lean();
    assert.equal(snapshot.phone, "022-11111111", "opposed unverified source cannot overwrite prior phone");
    assert.deepEqual(snapshot.specialties, ["Cardiology"]);
    assert.equal(await HospitalFieldClaim.countDocuments({ hospital: first._id, field: "phone" }), 2);
    assert.equal((await HospitalFieldConflict.findOne({ hospital: first._id, field: "phone" })).status, "open");
    const publicBefore = await request(createApp()).get(`/api/hospitals/${snapshot.slug}`);
    assert.equal(publicBefore.status, 200);
    assert.ok(publicBefore.body.hospital.fieldConflicts.some((c) => c.field === "phone" && c.status === "open"));
    const admin = await User.create({ email: "admin@example.org", name: "Test Admin", role: "system_admin" });
    const token = signToken(admin);
    const evidence = await request(createApp()).get("/api/admin/hospital-field-claims")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(evidence.status, 200);
    assert.equal(evidence.body.data.filter((c) => c.field === "phone").length, 2);
    assert.ok(evidence.body.data.every((c) => c.source && c.sourcePageUrl && c.evidenceText
      && c.observedAt && c.parserVersion && c.confidence && c.verificationStatus));
    assert.ok(evidence.body.data.filter((c) => c.field === "phone")
      .every((c) => c.evidenceKind === "source_excerpt" && c.sourcePageUrl.endsWith("/contact")));
    const staff = await User.create({ role: "hospital_admin", email: "staff@example.org", name: "Staff" });
    const staffToken = signToken(staff);
    const staffReview = await request(createApp()).post(`/api/admin/hospital-field-claims/${evidence.body.data[0]._id}/review`)
      .set("Authorization", `Bearer ${staffToken}`).send({ decision: "approve" });
    assert.equal(staffReview.status, 403);
    const conflictEvidence = await request(createApp()).get("/api/admin/hospital-field-conflicts")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(conflictEvidence.status, 200);
    assert.ok(conflictEvidence.body.data.some((c) => c.field === "phone" && c.claims.length === 2));
    const claimB = await HospitalFieldClaim.findOne({ hospital: first._id, field: "phone", source: siteB._id });
    const review = await request(createApp()).post(`/api/admin/hospital-field-claims/${claimB._id}/review`)
      .set("Authorization", `Bearer ${token}`).send({ decision: "approve", note: "Confirmed by hospital" });
    assert.equal(review.status, 200);
    assert.equal((await Hospital.findById(first._id)).phone, "022-22222222");
    const retained = await HospitalFieldConflict.findOne({ hospital: first._id, field: "phone" }).lean();
    assert.equal(retained.status, "resolved");
    assert.equal(retained.claims.length, 2);
    assert.equal(retained.history.length, 2);
    assert.equal((await AuditLog.findOne({ entityType: "HospitalFieldClaim", entityId: claimB._id })).after.reviewNote, "Confirmed by hospital");
    assert.equal((await HospitalFieldClaim.findById(claimB._id)).reviewHistory.length, 1);
    const publicAfter = await request(createApp()).get(`/api/hospitals/${snapshot.slug}`);
    assert.equal(publicAfter.body.hospital.phone, "022-22222222");
    assert.equal(publicAfter.body.hospital.fieldProvenance.phone.source.sourceKey, "site_b");
    assert.equal(publicAfter.body.hospital.fieldProvenance.phone.parserVersion, "test-v1");
    assert.equal(publicAfter.body.hospital.fieldProvenance.phone.evidenceKind, "source_excerpt");
    assert.equal(publicAfter.body.hospital.fieldProvenance.phone.confidence, "MEDIUM");
    assert.equal(publicAfter.body.hospital.fieldProvenance.phone.verificationStatus, "verified");
    assert.equal(publicAfter.body.hospital.fieldProvenance.phone.conflict, true);
    assert.ok(publicAfter.body.hospital.fieldConflicts.some((c) => c.field === "phone" && c.status === "resolved"));
    const rejection = await request(createApp()).post(`/api/admin/hospital-field-claims/${claimB._id}/review`)
      .set("Authorization", `Bearer ${token}`).send({ decision: "reject", note: "Evidence withdrawn" });
    assert.equal(rejection.status, 200);
    assert.equal((await Hospital.findById(first._id)).phone, "022-11111111");
    const rejectedClaim = await HospitalFieldClaim.findById(claimB._id).lean();
    assert.deepEqual(rejectedClaim.reviewHistory.map((item) => item.decision), ["approve", "reject"]);
    assert.equal((await AuditLog.findOne({ entityType: "HospitalFieldClaim", entityId: claimB._id, action: "reject" })).after.reviewNote, "Evidence withdrawn");
    assert.equal((await HospitalFieldConflict.findOne({ hospital: first._id, field: "phone" })).history.length, 3);
    assert.ok((await Hospital.findById(first._id)).sourceIds.some((id) => String(id) === String(siteA._id)));
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
