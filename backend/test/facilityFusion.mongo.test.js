// Run only against the explicitly isolated integration database.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signSessionToken } from "./helpers/session.js";
import { Hospital } from "../src/models/Hospital.js";
import { HospitalFacility } from "../src/models/HospitalFacility.js";
import { DataSource } from "../src/models/DataSource.js";
import { FacilitySourceClaim } from "../src/models/FacilitySourceClaim.js";
import { DataConflict } from "../src/models/DataConflict.js";
import { User } from "../src/models/User.js";
import { fuseFacilityClaims } from "../src/services/facilityClaimFusion.js";
import { syncFacilityConflict } from "../src/services/facilityConflictService.js";

const uri = process.env.MEDREACH_TEST_MONGO_URI;
const isolated = Boolean(uri && /\/medreach_fusion_integration(?:\?|$)/.test(uri));

test("stored provider evidence remains readable and reviewable without ingestion", { skip: !isolated }, async () => {
  await mongoose.connect(uri);
  try {
    await mongoose.connection.dropDatabase();
    const [firstSource, secondSource] = await DataSource.create([
      { name: "Historical hospital source", type: "hospital_site", url: "https://example.org/hospital" },
      { name: "Historical directory", type: "government_directory", url: "https://example.org/directory" },
    ]);
    const hospital = await Hospital.create({ name: "Stored Evidence Hospital", city: "Mumbai", sourceIds: [firstSource._id, secondSource._id] });
    const claims = await FacilitySourceClaim.create([
      { hospital: hospital._id, source: firstSource._id, facility: "ICU", capability: "yes",
        sourcePageUrl: "https://example.org/hospital", evidenceText: "ICU is listed", observedAt: new Date(), confidence: "MEDIUM" },
      { hospital: hospital._id, source: secondSource._id, facility: "ICU", capability: "no",
        sourcePageUrl: "https://example.org/directory", evidenceText: "ICU is not listed", observedAt: new Date(), confidence: "MEDIUM" },
    ]);
    const resolution = fuseFacilityClaims(claims);
    await HospitalFacility.create({ hospital: hospital._id, facility: "ICU", capability: resolution.capability,
      capabilityConflict: resolution.conflict });
    await syncFacilityConflict({ hospital: hospital._id, facility: "ICU", claims, resolution });

    const publicView = await request(createApp()).get(`/api/hospitals/${hospital.slug}`);
    assert.equal(publicView.status, 200);
    assert.equal(publicView.body.hospital.facilities[0].capability, "unknown");
    assert.equal(publicView.body.hospital.facilities[0].capabilityConflict, true);
    assert.equal((await DataConflict.findOne({ hospital: hospital._id, facility: "ICU" })).claims.length, 2);

    const admin = await User.create({ email: "stored-evidence-admin@example.org", name: "Evidence Admin", role: "system_admin" });
    const token = await signSessionToken(admin);
    const evidence = await request(createApp()).get("/api/admin/facility-claims").set("Authorization", `Bearer ${token}`);
    assert.equal(evidence.status, 200);
    assert.equal(evidence.body.data.length, 2);
    assert.ok(evidence.body.data.every((claim) => claim.sourcePageUrl && claim.observedAt));

    const review = await request(createApp()).post(`/api/admin/facility-claims/${claims[0]._id}/review`)
      .set("Authorization", `Bearer ${token}`).send({ decision: "approve" });
    assert.equal(review.status, 200);
    assert.equal((await HospitalFacility.findOne({ hospital: hospital._id, facility: "ICU" })).capability, "yes");
    assert.equal(await FacilitySourceClaim.countDocuments({ hospital: hospital._id }), 2);
    assert.equal(await DataSource.countDocuments(), 2);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
