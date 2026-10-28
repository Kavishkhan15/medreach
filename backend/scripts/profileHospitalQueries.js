import mongoose from "mongoose";
import { writeFile } from "node:fs/promises";
import { assertLocalAuditTarget } from "../src/services/dataQualityAudit.js";
import { profileHospitalQueries } from "../src/services/hospitalQueryProfile.js";
const uri = process.env.MEDREACH_AUDIT_MONGO_URI || "mongodb://127.0.0.1:27017/medreach";
let client;
try {
  const database = assertLocalAuditTarget(uri);
  if (process.argv.length !== 3) throw new Error("Supply a new output JSON path");
  client = new mongoose.mongo.MongoClient(uri, { maxPoolSize: 2, serverSelectionTimeoutMS: 4000, appName: "medreach-query-profile-read-only" });
  await client.connect();
  const report = await profileHospitalQueries(client.db(database));
  await writeFile(process.argv[2], JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ hospitalCount: report.hospitalCount, results: report.results.map(({ winningPlan, ...result }) => result) }));
} catch (error) { console.error(error.code || "PROFILE_FAILED"); process.exitCode = 1; }
finally { await client?.close(); }
