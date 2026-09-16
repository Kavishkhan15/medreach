import { connectDB, disconnectDB } from "../src/config/db.js";
import { backfillFacilityClaims } from "../src/services/backfillFacilityClaims.js";

const apply = process.argv.includes("--apply");
await connectDB();
try {
  console.log(JSON.stringify(await backfillFacilityClaims({ dryRun: !apply }), null, 2));
} finally {
  await disconnectDB();
}
