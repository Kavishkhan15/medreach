import { expect, test } from "@playwright/test";

const API = "http://localhost:4000";
test.beforeEach(async ({ context }, testInfo) => {
  const variant = ["bootstrap", "tailwind", "skeleton"].indexOf(testInfo.project.name) + 1;
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.20.${variant}.1` });
});

test("dashboard failures stay in their section and retries target only that section", async ({ page }, testInfo) => {
  await page.goto("/login?returnTo=%2Fdashboard");
  await page.locator("#email").fill(`${testInfo.project.name}.e2e@medreach.test`);
  await page.locator("#password").fill("E2E_SafePassword_123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const titles = { "/api/auth/me": "Saved hospitals", "/api/emergency-requests": "Emergency requests", "/api/applications/mine": "Applications" };
  const counts = Object.fromEntries(Object.keys(titles).map((path) => [path, 0]));
  let failed;
  await page.route(`${API}/api/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path in counts) counts[path] += 1;
    return path === failed
      ? route.fulfill({ status: 503, json: { error: "This section is temporarily unavailable." } })
      : route.continue();
  });
  for (const [path, title] of Object.entries(titles)) {
    failed = path;
    await page.goto("/dashboard");
    const section = page.getByRole("region", { name: title, exact: true });
    await expect(section.getByRole("alert")).toContainText("This section is temporarily unavailable.");
    for (const other of Object.values(titles).filter((name) => name !== title)) {
      const healthy = page.getByRole("region", { name: other, exact: true });
      await expect(healthy.getByText(/^Loading /)).toHaveCount(0);
      await expect(healthy.getByRole("alert")).toHaveCount(0);
      await expect(healthy).toBeVisible();
    }
    const before = { ...counts };
    failed = null;
    await section.getByRole("button", { name: `Retry ${title.toLowerCase()}`, exact: true }).click();
    await expect(section.getByRole("alert")).toHaveCount(0);
    await expect(section.getByText(/^Loading /)).toHaveCount(0);
    expect(counts[path]).toBe(before[path] + 1);
    for (const other of Object.keys(titles).filter((value) => value !== path)) expect(counts[other]).toBe(before[other]);
  }
});
