import { expect, test } from "@playwright/test";

const API = process.env.MEDREACH_HOME_TEST_API_URL || "http://localhost:4000";
const links = [
  ["Home", "/"], ["Hospitals", "/hospitals"], ["Emergency", "/emergency"],
  ["Blood Banks", "/blood-banks"], ["Diagnostics", "/diagnostics"],
  ["Ambulances", "/ambulances"], ["Careers", "/careers"],
  ["Track request", "/track"], ["Login", "/login"],
];
const nav = (page) => page.getByRole("navigation", { name: "Primary" });

async function assertShieldLogo(page) {
  const logo = nav(page).getByRole("img", { name: "MedReach", exact: true });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", /logo\.png/);
  const bounds = await logo.boundingBox();
  expect(Math.abs(bounds.width - bounds.height)).toBeLessThan(1);
}

test.beforeEach(async ({ context }, testInfo) => {
  test.skip(testInfo.project.name !== "bootstrap", "The supplied navbar design is currently Bootstrap-only.");
  const client = [...testInfo.title].reduce((sum, char) => (sum + char.charCodeAt(0)) % 250, 1);
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.21.14.${client}` });
});

test("desktop navbar keeps the logo between icon links with no overlap", async ({ page }) => {
  for (const width of [1400, 1440, 1600, 1800, 1920, 2048]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await assertShieldLogo(page);
    await expect(nav(page).getByRole("button", { name: "Toggle navigation" })).toBeHidden();
    for (const [label, href] of links) {
      const link = nav(page).getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
      await expect(link.locator("svg")).toHaveCount(1);
    }
    await expect(nav(page).getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
    const bounds = await nav(page).evaluate((node) => {
      const left = node.querySelector(".medreach-nav-left").getBoundingClientRect();
      const logo = node.querySelector(".navbar-brand img").getBoundingClientRect();
      const right = node.querySelector(".medreach-nav-right").getBoundingClientRect();
      return { left: left.right, logoLeft: logo.left, logoRight: logo.right, right: right.left, pageWidth: document.documentElement.scrollWidth, width: innerWidth };
    });
    expect(bounds.logoLeft).toBeGreaterThanOrEqual(bounds.left);
    expect(bounds.logoRight).toBeLessThanOrEqual(bounds.right);
    expect(Math.abs((bounds.logoLeft + bounds.logoRight) / 2 - bounds.width / 2)).toBeLessThan(1);
    expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.width);
    await expect(nav(page).getByRole("link", { name: "Map", exact: true })).toHaveCount(0);
  }
});

test("mobile menu keeps every route usable and closes with Escape or navigation", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 375, 768, 1024, 1280, 1399]) {
    await page.setViewportSize({ width, height: 667 });
    await page.goto("/track");
    await assertShieldLogo(page);
    const toggle = nav(page).getByRole("button", { name: "Toggle navigation" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.press("Enter");
    for (const [label] of links) {
      const link = nav(page).getByRole("link", { name: label, exact: true });
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
    await toggle.press("Enter");
    await nav(page).getByRole("link", { name: "Blood Banks", exact: true }).click();
    await expect(page).toHaveURL(/\/blood-banks$/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
  expect(errors).toEqual([]);
});

test("all navigation links reach real routes and update the active item", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  for (const [label, href] of links) {
    await nav(page).getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${href === "/" ? "/" : href}$`));
    if (label !== "Login") await expect(nav(page).getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav(page).getByRole("img", { name: "MedReach", exact: true })).toBeVisible();
  }
  await page.goto("/");
  await page.getByRole("link", { name: "Full Map View →", exact: true }).click();
  await expect(page).toHaveURL(/\/map$/);
});

test("landing Login hides on downward scroll and returns on upward scroll or another route", async ({ page }) => {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/");
    const toggle = nav(page).getByRole("button", { name: "Toggle navigation" });
    if (width < 1400) await toggle.click();
    const login = nav(page).locator(".nav-login");
    await expect(login).toBeVisible();
    const logo = nav(page).locator(".navbar-brand img");
    const initial = await logo.boundingBox();
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
    await expect(login).toBeHidden();
    await expect(nav(page).getByRole("link", { name: "Hospitals", exact: true })).toBeVisible();
    expect((await logo.boundingBox()).x).toBe(initial.x);
    await page.evaluate(() => window.scrollTo({ top: 350, behavior: "instant" }));
    await expect(login).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
    await expect(login).toBeHidden();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(login).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
    await expect(login).toBeHidden();
    await nav(page).getByRole("link", { name: "Track request", exact: true }).click();
    await expect(page).toHaveURL(/\/track$/);
    if (width < 1400) await toggle.click();
    await expect(login).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await expect(login).toBeVisible();
    await expect(login).not.toHaveClass(/is-scroll-hidden/);
  }
});

test("signed-in patient, hospital staff and admin keep their account links and logout", async ({ page }) => {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [email, roleLink] of [["bootstrap.e2e@medreach.test", null], ["staff.e2e@medreach.test", "Hospital"], ["admin.e2e@medreach.test", "Admin"]]) {
      const response = await page.request.post(`${API}/api/auth/login`, { data: { email, password: "E2E_SafePassword_123!" } });
      expect(response.ok()).toBe(true);
      await page.goto("/");
      const toggle = nav(page).getByRole("button", { name: "Toggle navigation" });
      if (width < 1400) await toggle.click();
      const logout = nav(page).getByRole("button", { name: /^Logout \(/ });
      await expect(logout).toBeVisible();
      await expect(nav(page).getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
      await expect(nav(page).getByRole("link", { name: "Profile", exact: true })).toBeVisible();
      if (roleLink) await expect(nav(page).getByRole("link", { name: roleLink, exact: true })).toBeVisible();
      for (const label of ["Admin", "Hospital"].filter((name) => name !== roleLink)) await expect(nav(page).getByRole("link", { name: label, exact: true })).toHaveCount(0);
      await nav(page).getByRole("link", { name: "Profile", exact: true }).click();
      await expect(page).toHaveURL(/\/profile$/);
      if (width < 1400) await toggle.click();
      await logout.click();
      if (width < 1400) {
        await expect(nav(page).getByRole("link", { name: "Login", exact: true, includeHidden: true })).toHaveAttribute("href", "/login");
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await toggle.click();
      }
      await expect(nav(page).getByRole("link", { name: "Login", exact: true })).toBeVisible();
      expect((await page.request.get(`${API}/api/auth/me`)).status()).toBe(401);
    }
  }
});
