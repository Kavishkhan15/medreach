// Model + constants tests. These validate schema shape and enum wiring WITHOUT
// a database connection — Mongoose validates documents in-memory via
// doc.validateSync(), so no MongoDB is required.
import test from "node:test";
import assert from "node:assert/strict";

import {
  ROLE_VALUES,
  ADMIN_ROLES,
  HOSPITAL_TYPES,
  FACILITY_TYPES,
  AVAILABILITY_STATUS,
  CRAWL_STATUS,
  SOURCE_RELIABILITY,
} from "../src/config/constants.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { HospitalFacility } from "../src/models/HospitalFacility.js";
import { AvailabilityObservation } from "../src/models/AvailabilityObservation.js";
import { DataSource } from "../src/models/DataSource.js";
import { CrawlJob } from "../src/models/CrawlJob.js";
import { CrawlResult } from "../src/models/CrawlResult.js";
import { AuditLog } from "../src/models/AuditLog.js";

test("constants: role families are consistent", () => {
  assert.ok(ROLE_VALUES.includes("user"));
  assert.ok(ROLE_VALUES.includes("system_admin"));
  assert.ok(ROLE_VALUES.includes("hospital_admin"));
  assert.ok(ROLE_VALUES.includes("admin"), "legacy admin retained for compat");
  assert.ok(ADMIN_ROLES.includes("system_admin") && !ADMIN_ROLES.includes("user"));
});

test("User: legacy admin role still validates (seed compat)", () => {
  const u = new User({ email: "a@x.io", name: "A", passwordHash: "x", role: "admin" });
  assert.equal(u.validateSync(), undefined);
  assert.equal(u.isAdmin, true);
});

test("User: new roles validate; unknown role rejected", () => {
  const ok = new User({ email: "b@x.io", name: "B", passwordHash: "x", role: "system_admin" });
  assert.equal(ok.validateSync(), undefined);
  const bad = new User({ email: "c@x.io", name: "C", passwordHash: "x", role: "wizard" });
  assert.ok(bad.validateSync()?.errors?.role, "invalid role should fail");
});

test("User: toJSON strips passwordHash", () => {
  const u = new User({ email: "d@x.io", name: "D", passwordHash: "secret" });
  assert.equal(JSON.parse(JSON.stringify(u)).passwordHash, undefined);
});

test("Hospital: specialties/departments mirror on validate", async () => {
  const h = new Hospital({ name: "Test Hosp", specialties: ["Cardiology"], hospitalType: "Private" });
  await h.validate(); // async validate runs pre('validate') middleware (mirror + slug)
  assert.deepEqual(h.departments, ["Cardiology"]);
  assert.ok(HOSPITAL_TYPES.includes(h.hospitalType));
});

test("Hospital: invalid hospitalType rejected", () => {
  const h = new Hospital({ name: "X", hospitalType: "Spaceship" });
  assert.ok(h.validateSync()?.errors?.hospitalType);
});

test("HospitalFacility: enum-gated status + facility", () => {
  const f = new HospitalFacility({ hospital: "507f1f77bcf86cd799439011", facility: "ICU", status: "available" });
  assert.equal(f.validateSync(), undefined);
  assert.ok(FACILITY_TYPES.includes("ICU") && AVAILABILITY_STATUS.includes("available"));
  const bad = new HospitalFacility({ hospital: "507f1f77bcf86cd799439011", facility: "Teleporter" });
  assert.ok(bad.validateSync()?.errors?.facility);
  const capability = new HospitalFacility({ hospital: "507f1f77bcf86cd799439011", facility: "ICU", capability: "yes" });
  assert.equal(capability.validateSync(), undefined);
  const invalidCapability = new HospitalFacility({ hospital: "507f1f77bcf86cd799439011", facility: "ICU", capability: "available" });
  assert.ok(invalidCapability.validateSync()?.errors?.capability);
});

test("AvailabilityObservation: defaults retrievedAt, gates status", () => {
  const o = new AvailabilityObservation({ hospital: "507f1f77bcf86cd799439011", facility: "Ventilator", status: "limited" });
  assert.equal(o.validateSync(), undefined);
  assert.ok(o.retrievedAt instanceof Date);
});

test("DataSource: reliability defaults from type", async () => {
  const s = new DataSource({ name: "X Gov Feed", type: "government" });
  await s.validate(); // pre('validate') sets reliability from type
  assert.equal(s.reliability, SOURCE_RELIABILITY.government);
});

test("CrawlJob: status enum-gated", () => {
  const j = new CrawlJob({ source: "507f1f77bcf86cd799439011", status: "rate_limited" });
  assert.equal(j.validateSync(), undefined);
  assert.ok(CRAWL_STATUS.includes("rate_limited"));
  const bad = new CrawlJob({ source: "507f1f77bcf86cd799439011", status: "exploded" });
  assert.ok(bad.validateSync()?.errors?.status);
});

test("CrawlResult + AuditLog: minimal valid documents", () => {
  const r = new CrawlResult({ job: "507f1f77bcf86cd799439011", source: "507f1f77bcf86cd799439012" });
  assert.equal(r.validateSync(), undefined);
  const a = new AuditLog({ action: "verify", entityType: "Hospital" });
  assert.equal(a.validateSync(), undefined);
});
