import { test, expect } from "@playwright/test";

test("Bootstrap sign-in has password only and one registration link preserving its destination", async ({ page }, info) => {
  test.skip(info.project.name !== "bootstrap", "Bootstrap login cleanup only");
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: null } }));
  await page.goto("/login?returnTo=%2Fcareers");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(main.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(main.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(main.getByText("Two-factor authentication", { exact: true })).toHaveCount(0);
  await expect(main.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
  await expect(main.getByText("Open the registration page", { exact: true })).toHaveCount(0);
  await expect(main.locator('a[href^="/register"]')).toHaveCount(1);
  const register = main.getByRole("link", { name: "Need an account? Register here", exact: true });
  await expect(register).toHaveAttribute("href", "/register?returnTo=%2Fcareers");
  await register.click();
  await expect(page).toHaveURL(/\/register\?returnTo=%2Fcareers$/);
});
