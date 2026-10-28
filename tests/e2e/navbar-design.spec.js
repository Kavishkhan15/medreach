import { expect, test } from "@playwright/test";

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

test.beforeEach(async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "bootstrap", "The supplied navbar design is currently Bootstrap-only.");
  const client = [...testInfo.title].reduce((sum, char) => (sum + char.charCodeAt(0)) % 250, 1);
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.21.14.${client}` });
  // Navbar journeys use isolated browser fixtures and never change live accounts.
  await page.route((url) => url.pathname.startsWith("/api/") || url.pathname.startsWith("/health"), (route) => {
    const path = new URL(route.request().url()).pathname;
    const unauthenticated = ["/api/auth/me", "/api/auth/refresh"].includes(path);
    return route.fulfill({ status: unauthenticated ? 401 : 200, json: unauthenticated ? { error: "Unauthenticated" } : { data: [], total: 0, ok: true } });
  });
});

test("desktop navbar keeps the logo between icon links with no overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  for (const width of [1400, 1440, 1600, 1800, 1920, 2048]) {
    await page.setViewportSize({ width, height: 900 });
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
    expect(bounds.logoRight - bounds.logoLeft).toBe(80);
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

test("landing Login stays available during scrolling and after navigation", async ({ page }) => {
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
    await expect(login).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Hospitals", exact: true })).toBeVisible();
    expect((await logo.boundingBox()).x).toBe(initial.x);
    await page.evaluate(() => window.scrollTo({ top: 350, behavior: "instant" }));
    await expect(login).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
    await expect(login).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(login).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
    await expect(login).toBeVisible();
    await nav(page).getByRole("link", { name: "Track request", exact: true }).click();
    await expect(page).toHaveURL(/\/track$/);
    if (width < 1400) await toggle.click();
    await expect(login).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await expect(login).toBeVisible();
    await expect(login).not.toHaveClass(/is-scroll-hidden/);
  }
});

test("signed-in accounts expose only their workspace links and confirm logout", async ({ page }) => {
  let signedIn = true, role = "user", logoutRequests = 0;
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: signedIn ? 200 : 401,
    json: signedIn ? { user: { _id: "111111111111111111111111", name: "Ada Example", email: "fixture@example.test", role } } : { error: "Unauthenticated" } }));
  await page.route("**/api/auth/sessions", (route) => route.fulfill({ json: { sessions: [], providers: { password: true } } }));
  await page.route("**/api/auth/mfa", (route) => route.fulfill({ json: { eligible: role !== "user", enabled: false } }));
  await page.route("**/api/auth/logout", (route) => { signedIn = false; logoutRequests++; return route.fulfill({ json: { ok: true } }); });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const currentRole of ["user", "hospital_admin", "provider_admin", "system_admin"]) {
      signedIn = true; role = currentRole;
      await page.goto("/");
      const toggle = nav(page).getByRole("button", { name: "Toggle navigation" });
      if (width < 1400) await toggle.click();
      const profile = nav(page).locator("summary.nav-profile");
      await expect(profile).toBeVisible();
      await expect(nav(page).getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);
      await profile.click();
      await expect(nav(page).getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
      await expect(nav(page).getByRole("link", { name: "Admin workspace", exact: true })).toHaveCount(role === "system_admin" ? 1 : 0);
      await expect(nav(page).getByRole("link", { name: "Provider workspace", exact: true })).toHaveCount(["provider_admin", "hospital_admin"].includes(role) ? 1 : 0);
      await page.keyboard.press("Escape");
      await expect(nav(page).locator("details")).not.toHaveAttribute("open", "");
      await expect(profile).toBeFocused();
      await profile.click();
      await nav(page).getByRole("link", { name: "Profile & security", exact: true }).click();
      await expect(page).toHaveURL(/\/profile$/);
      if (width < 1400) await toggle.click();
      await profile.click();
      await nav(page).getByRole("button", { name: "Log out", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Log out of MedReach?" });
      const previous = logoutRequests;
      await dialog.getByRole("button", { name: "Stay signed in" }).click();
      expect(logoutRequests).toBe(previous);
      await nav(page).getByRole("button", { name: "Log out", exact: true }).click();
      await dialog.getByRole("button", { name: "Log out", exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      expect(logoutRequests).toBe(previous + 1);
      if (width < 1400) { await expect(toggle).toHaveAttribute("aria-expanded", "false"); await toggle.click(); }
      await expect(nav(page).getByRole("link", { name: "Login", exact: true })).toBeVisible();
    }
  }
});
