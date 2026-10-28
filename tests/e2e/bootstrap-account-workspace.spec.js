import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "bootstrap", "Bootstrap account theme only");
  await page.route((url) => url.pathname.startsWith("/api/"), (route) => {
    const path = new URL(route.request().url()).pathname;
    const user = { _id: "111111111111111111111111", name: "Test administrator", email: "fixture@example.test", role: "system_admin", region: "Mumbai", savedHospitals: [] };
    const body = path === "/api/auth/me" ? { user }
      : path === "/api/auth/sessions" ? { sessions: [], providers: { password: true } }
        : path === "/api/auth/mfa" ? { eligible: true, enabled: false }
          : path === "/api/admin/overview" ? { hospitals: 31, verified: 0, verificationQueue: 0 }
            : { data: [], total: 0 };
    return route.fulfill({ json: body });
  });
});

test("account theme persists across admin navigation, dashboard and profile", async ({ page }) => {
  for (const width of [1466, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/admin", "/admin/provider-approvals", "/admin/provider-accounts", "/dashboard", "/profile"]) {
      await page.goto(path);
      await expect(page.locator(".account-sidebar-logout")).toBeVisible();
      await expect(page.locator(".account-shell--workspace")).toBeVisible();
      await expect(page.locator(".account-sidebar")).toHaveCSS("border-radius", width < 992 ? "18px" : "22px");
      if (path.startsWith("/admin")) {
        await expect(page.locator(".admin-section-link svg")).toHaveCount(9);
        await expect(page.locator('.admin-section-link[aria-current="page"]')).toHaveAttribute("href", path);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("logout cancel and Escape preserve the session and return focus", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/auth/logout", (route) => { requests++; return route.fulfill({ json: { ok: true } }); });
  await page.goto("/admin");
  const trigger = page.getByRole("button", { name: "Log out", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Log out of MedReach?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Stay signed in" })).toBeFocused();
  expect(requests).toBe(0);
  await dialog.getByRole("button", { name: "Stay signed in" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(requests).toBe(0);
  await expect(page).toHaveURL(/\/admin$/);
});

test("profile logout requires confirmation and permits retry after failure", async ({ page }) => {
  let requests = 0;
  let fail = true;
  await page.route("**/api/auth/logout", async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 150));
    return route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: "Test outage" } : { ok: true } });
  });
  await page.goto("/profile");
  await page.getByRole("button", { name: "Log out this browser" }).click();
  const dialog = page.getByRole("dialog", { name: "Log out of MedReach?" });
  expect(requests).toBe(0);
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Could not log out. Please try again.");
  await expect(page).toHaveURL(/\/profile$/);
  expect(requests).toBe(1);
  fail = false;
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(requests).toBe(2);
});
