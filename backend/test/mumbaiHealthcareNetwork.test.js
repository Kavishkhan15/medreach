import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { DataSource } from "../src/models/DataSource.js";
import { User } from "../src/models/User.js";
import { signToken } from "../src/utils/token.js";
import { mumbaiHospitals, mumbaiDiagnosticsAndBloodBanks } from "../src/data/seedData.js";
import { SOURCES } from "../src/_crawler/registry/sources.js";

const testDbUri = "mongodb://127.0.0.1:27017/medreach_mumbai_network_test";

test("Mumbai Healthcare and Diagnostic Network Test Suite", async (t) => {
  let app;
  let adminToken;

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
    app = createApp();

    const adminUser = await User.create({
      name: "Mumbai Admin",
      email: "mumbai.admin@medreach.test",
      role: "admin",
    });
    adminToken = signToken(adminUser);

    // Populate hospitals and diagnostic resources
    await Hospital.insertMany(mumbaiHospitals);
    await ResourceProvider.insertMany(mumbaiDiagnosticsAndBloodBanks);

    // Populate data sources
    for (const s of SOURCES) {
      await DataSource.findOneAndUpdate(
        { sourceKey: s.sourceId },
        {
          $set: {
            sourceKey: s.sourceId,
            name: s.name,
            type: s.sourceType,
            url: s.baseUrl,
            accessMethod: "http_html",
            reliability: s.reliability,
            enabled: s.enabled,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  });

  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  });

  await t.test("Seed data covers 28+ hospitals across all four Mumbai corridors", () => {
    assert.ok(mumbaiHospitals.length >= 28, `Expected >= 28 hospitals, got ${mumbaiHospitals.length}`);

    const regions = new Set(mumbaiHospitals.map((h) => h.region));
    assert.ok(regions.has("South Mumbai"), "South Mumbai corridor covered");
    assert.ok(regions.has("Western Suburbs"), "Western Suburbs corridor covered");
    assert.ok(regions.has("Central Suburbs"), "Central Suburbs corridor covered");
    assert.ok(regions.has("Navi Mumbai / Harbour"), "Navi Mumbai / Harbour corridor covered");

    // Check key anchor institutions
    const names = mumbaiHospitals.map((h) => h.name);
    assert.ok(names.some((n) => n.includes("King Edward Memorial") || n.includes("KEM")), "KEM Hospital present");
    assert.ok(names.some((n) => n.includes("Tata Memorial")), "Tata Memorial present");
    assert.ok(names.some((n) => n.includes("Lokmanya Tilak") || n.includes("Sion")), "Sion Hospital present");
    assert.ok(names.some((n) => n.includes("Nanavati")), "Nanavati Max present");
    assert.ok(names.some((n) => n.includes("Apollo")), "Apollo Navi Mumbai present");
  });

  await t.test("All hospital coordinates are valid GeoJSON points within the Mumbai boundary", () => {
    for (const h of mumbaiHospitals) {
      assert.equal(h.location.type, "Point", `${h.name} location must be GeoJSON Point`);
      const [lng, lat] = h.location.coordinates;
      assert.ok(typeof lng === "number" && typeof lat === "number", `${h.name} coords must be numbers`);
      assert.ok(lng >= 72.75 && lng <= 73.15, `${h.name} longitude ${lng} must be in Mumbai range [72.75, 73.15]`);
      assert.ok(lat >= 18.85 && lat <= 19.35, `${h.name} latitude ${lat} must be in Mumbai range [18.85, 19.35]`);
      assert.ok(h.emergencyPhone, `${h.name} must have emergency phone number`);
      assert.ok(h.pincode && /^\d{6}$/.test(h.pincode), `${h.name} must have valid 6-digit Mumbai pincode`);
    }
  });

  await t.test("Diagnostics and blood bank seed fixtures cover all corridors with required services", () => {
    assert.ok(mumbaiDiagnosticsAndBloodBanks.length >= 15, `Expected >= 15 resources, got ${mumbaiDiagnosticsAndBloodBanks.length}`);

    const diagnostics = mumbaiDiagnosticsAndBloodBanks.filter((r) => r.kind === "diagnostic");
    const bloodBanks = mumbaiDiagnosticsAndBloodBanks.filter((r) => r.kind === "blood_bank");

    assert.ok(diagnostics.length >= 10, "Multiple diagnostic centers present");
    assert.ok(bloodBanks.length >= 4, "Multiple blood banks present");

    // Verify diagnostic chains
    const diagNames = diagnostics.map((d) => d.name);
    assert.ok(diagNames.some((n) => n.includes("Suburban Diagnostics")), "Suburban Diagnostics covered");
    assert.ok(diagNames.some((n) => n.includes("Metropolis")), "Metropolis Healthcare covered");
    assert.ok(diagNames.some((n) => n.includes("NM Medical")), "NM Medical covered");
    assert.ok(diagNames.some((n) => n.includes("Agilus")), "Agilus Diagnostics covered");

    for (const r of mumbaiDiagnosticsAndBloodBanks) {
      assert.equal(r.location.type, "Point");
      const [lng, lat] = r.location.coordinates;
      assert.ok(lng >= 72.75 && lng <= 73.15, `${r.name} lng in range`);
      assert.ok(lat >= 18.85 && lat <= 19.35, `${r.name} lat in range`);
      assert.ok(Array.isArray(r.services) && r.services.length > 0, `${r.name} has non-empty services`);
    }
  });

  await t.test("GET /api/hospitals returns Mumbai hospitals filtered by region", async () => {
    const resSouth = await request(app).get("/api/hospitals?region=South Mumbai");
    assert.equal(resSouth.status, 200);
    assert.ok(resSouth.body.data.length >= 5);
    for (const h of resSouth.body.data) {
      assert.equal(h.region, "South Mumbai");
    }

    const resWestern = await request(app).get("/api/hospitals?region=Western Suburbs");
    assert.equal(resWestern.status, 200);
    assert.ok(resWestern.body.data.length >= 5);
    for (const h of resWestern.body.data) {
      assert.equal(h.region, "Western Suburbs");
    }
  });

  await t.test("GET /api/diagnostics returns verified diagnostic centres", async () => {
    const resDiag = await request(app).get("/api/diagnostics");
    assert.equal(resDiag.status, 200);
    assert.ok(resDiag.body.data.length >= 10);
    for (const r of resDiag.body.data) {
      assert.equal(r.kind, "diagnostic");
      assert.ok(r.services.length > 0);
    }
  });

  await t.test("GET /api/blood-banks returns verified blood banks", async () => {
    const resBlood = await request(app).get("/api/blood-banks");
    assert.equal(resBlood.status, 200);
    assert.ok(resBlood.body.data.length >= 4);
    for (const r of resBlood.body.data) {
      assert.equal(r.kind, "blood_bank");
    }
  });

  await t.test("GET /api/sources returns newly registered crawler sources with admin token", async () => {
    const res = await request(app)
      .get("/api/sources")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    const sources = res.body.data || res.body;
    const sourceKeys = (Array.isArray(sources) ? sources : sources.sources || []).map((s) => s.sourceKey);

    assert.ok(sourceKeys.includes("kem_mumbai"), "kem_mumbai source registered");
    assert.ok(sourceKeys.includes("sion_hospital"), "sion_hospital source registered");
    assert.ok(sourceKeys.includes("tata_memorial"), "tata_memorial source registered");
    assert.ok(sourceKeys.includes("nanavati_max"), "nanavati_max source registered");
    assert.ok(sourceKeys.includes("suburban_diagnostics"), "suburban_diagnostics source registered");
    assert.ok(sourceKeys.includes("metropolis_labs"), "metropolis_labs source registered");
    assert.ok(sourceKeys.includes("nm_medical"), "nm_medical source registered");
  });
});
