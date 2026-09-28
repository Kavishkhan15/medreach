export default async function globalSetup() {
  if (!process.env.MEDREACH_E2E_MONGO_URI && !process.env.MONGO_URI) {
    throw new Error("Set MEDREACH_E2E_MONGO_URI to an isolated database whose name contains 'e2e'.");
  }
  await import("../../scripts/e2e-seed.mjs");
}
