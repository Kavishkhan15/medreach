import { test, expect } from "@playwright/test";
test.beforeEach(async ({ context, page }, info) => {
  const variant = ["bootstrap", "tailwind", "skeleton"].indexOf(info.project.name) + 1;
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.18.${variant}.245` });
  page.__onboardingErrors = [];
  page.on("pageerror", (error) => page.__onboardingErrors.push(error.message));
});
test.afterEach(async ({ page }) => expect(page.__onboardingErrors).toEqual([]));

test("public landing application persists, prevents duplicate clicks and is approved with automatic account provisioning", async ({ page }, info) => {
  const name = `Onboarding ${info.project.name} ${Date.now()} Healthcare`;
  await page.goto("/#join-network");
  const section = page.locator("#join-network");
  await expect(section.getByRole("heading", { name: "Join the MedReach Network" })).toBeVisible();
  await section.getByRole("button", { name: "Submit Application" }).click();
  await expect(section.locator('[aria-invalid="true"]').first()).toBeVisible();
  await section.getByLabel("Organisation name", { exact: true }).fill(name);
  await section.getByLabel("Organisation type", { exact: true }).selectOption("diagnostic");
  await section.getByLabel("Contact person's name", { exact: true }).fill("Controlled E2E Contact");
  await section.getByLabel("Email address", { exact: true }).fill("medreachforyou@gmail.com");
  await section.getByLabel("Phone number", { exact: true }).fill("+919876543210");
  await section.getByLabel("Address", { exact: true }).fill("Isolated test street");
  await section.getByLabel("City", { exact: true }).fill("Mumbai");
  const submitted = page.waitForResponse((response) => response.url().endsWith("/api/providers/applications") && response.request().method() === "POST");
  await section.getByRole("button", { name: "Submit Application" }).click();
  expect((await submitted).status()).toBe(202);
  await expect(section.getByRole("status")).toContainText("Application recorded");
  await expect(section.getByRole("button", { name: "Submit Application" })).toHaveCount(0);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin.e2e@medreach.test");
  await page.getByLabel("Password", { exact: true }).fill("E2E_SafePassword_123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/provider-approvals");
  const card = page.locator("article").filter({ hasText: name });
  await expect(card).toContainText("pending");
  await card.getByRole("button", { name: "Approve and provision" }).click();
  await expect(card).toContainText("approved");
  await page.goto("/admin/provider-accounts");
  const account = page.locator("article").filter({ hasText: name });
  await expect(account).toContainText("Status: pending");
  await expect(account).toContainText(".example");
  await expect(account).toContainText("Activation email: disabled");
});

test("landing form, login and Careers fit mobile and desktop viewports", async ({ page }) => {
  for (const width of [360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/#join-network", "/login", "/careers"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(1);
      if (path === "/login") {
        const button = page.getByRole("button", { name: "Sign in", exact: true });
        await button.scrollIntoViewIfNeeded(); await expect(button).toBeInViewport();
      }
    }
  }
});

test("application failures and malformed receipts stay retryable without claiming success", async ({ page }, info) => {
  const api = process.env.MEDREACH_HOME_TEST_API_URL || "http://localhost:4000";
  let requests = 0;
  await page.route(`${api}/api/providers/applications`, async (route) => {
    requests += 1;
    if (requests === 1) return route.fulfill({ status: 503, json: { error: "Application service temporarily unavailable" } });
    if (requests === 2) return route.fulfill({ json: {} });
    return route.continue();
  });
  await page.goto("/#join-network");
  const section = page.locator("#join-network");
  for (const [label, value] of [["Organisation name", `Retry ${info.project.name} ${Date.now()} Centre`], ["Contact person's name", "Controlled Test"], ["Email address", "medreachforyou@gmail.com"], ["Phone number", "+919876543210"], ["Address", "Isolated retry test street"], ["City", "Mumbai"]]) {
    await section.getByLabel(label, { exact: true }).fill(value);
  }
  await section.getByLabel("Organisation type", { exact: true }).selectOption("diagnostic");
  await section.getByRole("button", { name: "Submit Application" }).click();
  await expect(section.getByRole("alert")).toBeVisible();
  await expect(section.getByRole("status")).toHaveCount(0);
  await section.getByRole("button", { name: "Retry Application" }).click();
  await expect(section.getByRole("alert")).toContainText("could not be confirmed");
  await expect(section.getByRole("status")).toHaveCount(0);
  await section.getByRole("button", { name: "Retry Application" }).click();
  await expect(section.getByRole("status")).toContainText("Application recorded");
  expect(requests).toBe(3);
});
