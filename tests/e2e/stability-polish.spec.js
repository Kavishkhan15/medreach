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

test("SOS has one label and retains emergency contact and hospital actions", async ({ page }) => {
  await page.goto("/track");
  const sos = page.locator('button[aria-haspopup="dialog"]').filter({ hasText: "SOS" });
  await expect(sos).toHaveText("SOS");
  await sos.click();
  const dialog = page.getByRole("dialog", { name: "Emergency help" });
  await expect(dialog.getByRole("link", { name: /Call 112/ })).toHaveAttribute("href", "tel:112");
  await expect(dialog.getByRole("link", { name: /Call 102/ })).toHaveAttribute("href", "tel:102");
  await expect(dialog.getByRole("link", { name: "Find nearest emergency hospital" })).toHaveAttribute("href", "/emergency");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("career tracking copies in Skeleton and leaves the other tracking cards unchanged", async ({ page }, testInfo) => {
  const reference = "CAR-OFFFFFFFFFFFFFF";
  await page.route(`${API}/api/tracking/career/${reference}`, (route) => route.fulfill({ json: { record: { reference, status: "submitted", updatedAt: "2026-10-03T00:00:00.000Z" } } }));
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/track?type=career&reference=${reference}`);
  const result = page.getByRole("region", { name: "Request status" });
  await expect(result.getByRole("heading", { name: reference, exact: true })).toBeVisible();
  if (testInfo.project.name !== "skeleton") {
    await expect(result.getByRole("button", { name: "Copy reference", exact: true })).toHaveCount(0);
    return;
  }
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(result.getByRole("heading", { name: reference, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await result.getByRole("button", { name: "Copy reference", exact: true }).click();
  await expect(result.getByRole("status")).toHaveText("Reference copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(reference);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Clipboard denied"); } } }));
  await page.setViewportSize({ width: 320, height: 900 });
  await result.getByRole("button", { name: "Copy reference", exact: true }).click();
  const fallback = result.getByRole("textbox", { name: "Application reference to copy" });
  await expect(fallback).toHaveValue(reference);
  await fallback.focus();
  expect(await fallback.evaluate((element) => element.selectionEnd - element.selectionStart)).toBe(reference.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
