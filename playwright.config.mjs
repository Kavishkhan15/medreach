import { defineConfig, devices } from "@playwright/test";

const mongoUri = process.env.MEDREACH_E2E_MONGO_URI || "mongodb://127.0.0.1:27017/medreach_e2e";
const apiUrl = "http://localhost:4000";
const commonEnv = {
  NODE_ENV: "test",
  MEDREACH_E2E_MONGO_URI: mongoUri,
  MONGO_URI: mongoUri,
  EMAIL_ENABLED: "false",
  JWT_SECRET: "medreach-e2e-only-secret-that-is-never-used-in-production",
  CORS_ORIGINS: "http://localhost:3000,http://localhost:3001,http://localhost:3002",
  PUBLIC_APP_URL: "http://localhost:3000",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/global-setup.mjs",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm --workspace @medreach/backend run start",
      url: `${apiUrl}/health/ready`,
      env: { ...commonEnv, PORT: "4000" },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    ...[
      ["@medreach/variant-bootstrap", 3000],
      ["@medreach/variant-tailwind", 3001],
      ["@medreach/variant-skeleton", 3002],
    ].map(([workspace, port]) => ({
      command: `npm --workspace ${workspace} run start`,
      url: `http://localhost:${port}`,
      env: { ...commonEnv, NEXT_PUBLIC_API_URL: apiUrl },
      reuseExistingServer: false,
      timeout: 60_000,
    })),
  ],
  projects: [
    { name: "bootstrap", use: { baseURL: "http://localhost:3000" } },
    { name: "tailwind", use: { baseURL: "http://localhost:3001" } },
    { name: "skeleton", use: { baseURL: "http://localhost:3002" } },
  ],
});
