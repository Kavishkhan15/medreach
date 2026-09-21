import { connectDB, disconnectDB } from "../src/config/db.js";
import { seedCareersFromProviders } from "../src/services/careerJobSeeder.js";

async function main() {
  await connectDB();
  try {
    const jobs = await seedCareersFromProviders();
    console.log(`[seed:careers] Successfully populated ${jobs.length} jobs across Mumbai healthcare organizations.`);
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error("[seed:careers] Seeding failed:", err.message);
  process.exit(1);
});
