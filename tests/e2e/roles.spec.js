import { test, expect } from "@playwright/test";
test.beforeEach(async ({ context, page }, info) => {
  const variant = ["bootstrap", "tailwind", "skeleton"].indexOf(info.project.name) + 1;
  const journey = [...info.title].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) % 253, 0) + 1;
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.18.${variant}.${journey}` });
  page.__roleRuntimeErrors = [];
  page.on("pageerror", (error) => page.__roleRuntimeErrors.push(error.message));
});
test.afterEach(async ({ page }) => expect(page.__roleRuntimeErrors).toEqual([]));
const password = "E2E_SafePassword_123!";
async function signIn(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
test("System Admin retains the main dashboard and provisions a pending real provider account", async ({ page }, info) => {
  await signIn(page, "admin.e2e@medreach.test");
  await page.goto("/admin"); await expect(page.getByRole("link", { name: "Provider Accounts", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Provider Accounts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Provider Accounts", exact: true })).toBeVisible();
  await page.getByLabel("Organisation", { exact: true }).selectOption({ label: "MedReach E2E Hospital · hospital" });
  if (info.project.name === "bootstrap") await page.getByLabel("Credential delivery", { exact: true }).selectOption("invitation");
  const email = `${info.project.name}.${Date.now()}@provider-company.com`;
  await page.getByLabel("Login email", { exact: true }).fill(email);
  await page.getByLabel("Real notification / invitation email", { exact: true }).fill(`contact.${email}`);
  await page.getByRole("button", { name: "Create Provider Admin account", exact: true }).click();
  await expect(page.getByText(/Account provisioning confirmed/)).toBeVisible();
  const card = page.locator("article").filter({ hasText: email });
  if (info.project.name === "bootstrap") {
    await expect(card.locator(".status-pill")).toHaveText("pending");
    await expect(card.getByText("Invitation: disabled", { exact: true })).toBeVisible();
  } else {
    await expect(card.getByText(/[Ss]tatus: pending/)).toBeVisible();
    await expect(card.getByText(/Activation email(?: status)?: disabled/)).toBeVisible();
  }
  await expect(card.getByText(/Demo default:/)).toHaveCount(0);
});
test("Regular users cannot access administrative dashboards and retired support route is absent", async ({ page }) => {
  await signIn(page, "support.e2e@medreach.test");
  const missing = await page.goto("/user-admin");
  expect(missing.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /^(?:404(?: — Page not found)?|Page Not Found)$/i })).toBeVisible();
  for (const path of ["/admin/users", "/admin/provider-accounts", "/admin/security"]) {
    await page.goto(path); await expect(page.getByText(/Admin access required/)).toBeVisible();
  }
});
test("Provider Admin can use assigned hospital and blood workflows and provider Careers", async ({ page }, info) => {
  await signIn(page, `${info.project.name}.provider.e2e@medreach.test`);
  await page.goto("/provider"); await expect(page.getByRole("heading", { name: "Provider workspace", exact: true })).toBeVisible();
  await expect(page.getByLabel("Organisation", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Save contact information" })).toBeVisible();
  await page.getByRole("link", { name: "Manage provider jobs and applicants" }).click();
  await expect(page.getByRole("heading", { name: "Job Listings & Applications" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Assigned organisation", exact: true }).locator("option")).toHaveCount(2);
  await page.goto("/admin"); await expect(page.getByText(/Admin access required/)).toBeVisible();
});
test("Provider account failures remain errors and Retry can recover without fake accounts", async ({ page }) => {
  await signIn(page, "admin.e2e@medreach.test");
  let failed = true;
  await page.route("**/api/admin/provider-accounts", (route) => failed ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }) }) : route.continue());
  await page.goto("/admin/provider-accounts");
  await expect(page.getByRole("button", { name: "Retry provider accounts" })).toBeVisible();
  await expect(page.getByText("No Provider Admin accounts found.")).toHaveCount(0);
  failed = false; await page.getByRole("button", { name: "Retry provider accounts" }).click();
  await expect(page.getByRole("heading", { name: /MedReach E2E|E2E .* Provider/ }).first()).toBeVisible();
});

test("Legacy admin has no blood campaign publication or approval controls", async ({ page }) => {
  let protectedCalls = 0;
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: { _id: "111111111111111111111111", name: "Legacy", role: "admin" } }) }));
  await page.route("**/api/blood-banks/campaigns?**", (route) => {
    if (new URL(route.request().url()).searchParams.get("status") === "pending") protectedCalls += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });
  await page.goto("/blood-banks");
  await page.getByRole("button", { name: "Host a Blood Drive", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submit for Admin Approval", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish Campaign", exact: true })).toHaveCount(0);
  expect(protectedCalls).toBe(0);
});
