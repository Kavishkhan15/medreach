// Isolated local benchmark: never uses configured production database variables.
import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { Hospital } from "../backend/src/models/Hospital.js";
import { AvailabilityObservation } from "../backend/src/models/AvailabilityObservation.js";
import { HospitalFieldClaim, HOSPITAL_CLAIM_FIELDS } from "../backend/src/models/HospitalFieldClaim.js";
import { DataSource } from "../backend/src/models/DataSource.js";
import { listHospitals } from "../backend/src/controllers/hospitalController.js";

const variant = process.argv[2];
if (!["full", "summary"].includes(variant)) throw Error("Choose full or summary; this benchmark uses only an isolated local fixture");
await mongoose.connect("mongodb://127.0.0.1:27017/medreach_latency_test", { monitorCommands: true });
try {
  await mongoose.connection.dropDatabase();
  const hospitals = await Hospital.create(Array.from({ length: 60 }, (_, index) => ({
    name: `Latency Clinic ${String(index).padStart(2, "0")}`, description: "Synthetic latency fixture", approvalStatus: "approved",
  })));
  await Hospital.init();
  const source = new mongoose.Types.ObjectId();
  await DataSource.collection.insertOne({ _id: source, name: "Synthetic source", type: "manual_verification" });
  await HospitalFieldClaim.collection.insertMany(hospitals.flatMap(hospital => HOSPITAL_CLAIM_FIELDS.map(field => ({
    hospital: hospital._id, field, value: field === "specialties" ? ["General medicine"] : "Synthetic value",
    source, observedAt: new Date(), verificationStatus: "verified", confidence: "HIGH", evidenceText: "Synthetic evidence. ".repeat(100),
  }))));
  await AvailabilityObservation.create(hospitals.flatMap(hospital => ["ICU", "Emergency Department"].map(facility => ({
    hospital: hospital._id, facility, status: "available", quantity: 3, verificationStatus: "verified", observedAt: new Date(),
  }))));
  const app = express();
  app.get("/hospitals", listHospitals);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  const samples = [];
  let commands = 0;
  const client = mongoose.connection.getClient();
  const listener = event => { if (["find", "aggregate", "getMore"].includes(event.commandName)) commands++; };
  // Discard four warm-up requests; measure ten requests over the same fixture.
  for (let index = 0; index < 14; index++) {
    commands = 0;
    client.on("commandStarted", listener);
    let response, elapsed;
    try {
      const start = performance.now();
      response = await request(app).get(`/hospitals?q=Latency&limit=12${variant === "summary" ? "&view=summary" : ""}`);
      elapsed = performance.now() - start;
    } finally { client.off("commandStarted", listener); }
    if (response.status !== 200 || response.body.data.length !== 12 || response.body.total !== 60) throw Error("Benchmark correctness gate failed");
    if (index >= 4) samples.push({ ms: +elapsed.toFixed(2), commands, bytes: Buffer.byteLength(response.text) });
  }
  const sorted = samples.map(sample => sample.ms).sort((left, right) => left - right);
  const result = { variant, medianMs: (sorted[4] + sorted[5]) / 2, p95Ms: sorted[9], commands: samples[0].commands, samples };
  console.log(JSON.stringify(result));
  await writeFile(`/tmp/medreach-search-${variant}.json`, JSON.stringify(result));
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
