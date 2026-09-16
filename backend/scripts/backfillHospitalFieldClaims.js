import { connectDB, disconnectDB } from "../src/config/db.js";
import { backfillHospitalFieldClaims } from "../src/services/backfillHospitalFieldClaims.js";

await connectDB();
try {
  console.log(JSON.stringify(await backfillHospitalFieldClaims({ dryRun: !process.argv.includes("--apply") }), null, 2));
} finally {
  await disconnectDB();
}
