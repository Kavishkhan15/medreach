import { test, expect } from "@playwright/test";

test("login gives immediate feedback, prevents duplicates and shares the returned session", async ({ page }) => {
  let logins = 0;
  let reads = 0;
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  await page.route("**/api/auth/me", async (route) => {
    reads += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: null }) });
  });
  await page.route("**/api/auth/login", async (route) => {
    logins += 1;
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ user: { _id: "test-user", name: "Test", role: "user", region: "Mumbai", emergencyContact: "1234567890", onboardingCompleted: true } }) });
  });
  await page.goto("/login?returnTo=/careers");
  await page.locator("#email").fill("performance@medreach.test");
  await page.locator("#password").fill("ValidPassword123!");
  const before = reads;
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Signing in…", exact: true })).toBeDisabled();
  await page.locator("form").evaluate((form) => form.requestSubmit());
  expect(logins).toBe(1);
  finish();
  await expect(page).toHaveURL(/\/careers$/);
  expect(reads).toBe(before);
});

test("invalid credentials show the error without attempting a token refresh", async ({ page }) => {
  let refreshes = 0;
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"user":null}' }));
  await page.route("**/api/auth/refresh", (route) => {
    refreshes += 1;
    return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/auth/login", (route) => route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Invalid email or password"}' }));
  await page.goto("/login");
  await page.locator("#email").fill("performance@medreach.test");
  await page.locator("#password").fill("WrongPassword123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid email or password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  expect(refreshes).toBe(0);
});
