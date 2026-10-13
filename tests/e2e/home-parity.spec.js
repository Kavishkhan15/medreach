import { expect, test } from "@playwright/test";

const nav = (page) => page.getByRole("navigation", { name: "Primary" });
const directory = (page) => page.getByRole("complementary", { name: "Healthcare directory" });
const provider = (page, name) => directory(page).locator("article[data-provider-id]").filter({ has: page.getByRole("button", { name: new RegExp(name) }) });

test.beforeEach(async ({ context }, testInfo) => {
  const client = [...`${testInfo.project.name}:${testInfo.title}`].reduce((sum, char) => (sum + char.charCodeAt(0)) % 250, 1);
  const api = process.env.MEDREACH_HOME_TEST_API_URL || "http://localhost:4000";
  await context.route(`${api}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": `198.21.16.${client}` } }));
});

test("homepage keeps Bootstrap's section order, real data and working actions", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(provider(page, "MedReach E2E Hospital")).toBeVisible();
  const sectionIds = await page.locator("main section[id]").evaluateAll((sections) => sections.map((section) => section.id));
  expect(sectionIds).toEqual(["discover", "about", "services", "emergency", "blood", "ambulance", "careers", "insights", "join-network"]);
  await expect(page.getByRole("link", { name: "Explore healthcare", exact: true })).toHaveAttribute("href", "/hospitals");
  await expect(page.getByRole("main").getByRole("link", { name: "Emergency care", exact: true })).toHaveAttribute("href", "/emergency");
  await expect(page.getByRole("link", { name: "Full Map View →", exact: true })).toHaveAttribute("href", "/map");
  for (const [category, name] of [["Hospitals", "MedReach E2E Hospital"], ["Blood Banks", "MedReach E2E Blood Bank"], ["Diagnostics", "MedReach E2E Diagnostics"], ["Ambulances", "MedReach E2E Ambulance"]]) {
    await directory(page).getByRole("button", { name: category, exact: true }).click();
    await expect(provider(page, name)).toBeVisible();
    await expect(directory(page).getByRole("button", { name: category, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await directory(page).getByRole("button", { name: "Reset filters", exact: true }).click();
  const hospital = provider(page, "MedReach E2E Hospital");
  await hospital.getByRole("button").click();
  await expect(hospital.getByRole("link", { name: "Details", exact: true })).toHaveAttribute("href", "/hospitals/medreach-e2e-hospital");
  await expect(hospital.getByRole("link", { name: "Bed Request", exact: true })).toHaveAttribute("href", /\/requests\/new\?hospital=.*&flow=standard/);
  await directory(page).getByRole("button", { name: "Blood Banks", exact: true }).click();
  const blood = provider(page, "MedReach E2E Blood Bank");
  await blood.getByRole("button").click();
  await blood.getByRole("button", { name: "Request / Donate" }).click();
  await expect(page.getByRole("heading", { name: "Blood Services: MedReach E2E Blood Bank" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await directory(page).getByRole("button", { name: "Ambulances", exact: true }).click();
  const ambulance = provider(page, "MedReach E2E Ambulance");
  await ambulance.getByRole("button").click();
  await ambulance.getByRole("button", { name: "Book Ambulance" }).click();
  await expect(page.getByRole("dialog", { name: "Book Ambulance" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("navbar remains usable across desktop and mobile widths", async ({ page }) => {
  const links = [["Home", "/"], ["Hospitals", "/hospitals"], ["Emergency", "/emergency"], ["Blood Banks", "/blood-banks"], ["Diagnostics", "/diagnostics"], ["Ambulances", "/ambulances"], ["Careers", "/careers"], ["Track request", "/track"], ["Login", "/login"]];
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(nav(page).getByRole("img", { name: "MedReach" })).toHaveAttribute("src", /logo\.png/);
    await expect(nav(page).getByRole("link", { name: "About", exact: true })).toHaveCount(0);
    const toggle = nav(page).getByRole("button", { name: "Toggle navigation" });
    if (width < 1400) await toggle.click();
    for (const [label, href] of links) await expect(nav(page).getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
    await expect(nav(page).getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 1400) {
      await page.keyboard.press("Escape");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toBeFocused();
      if (width === 320) {
        await toggle.click();
        await nav(page).getByRole("link", { name: "Blood Banks", exact: true }).click();
        await expect(page).toHaveURL(/\/blood-banks$/);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/");
  const login = nav(page).getByRole("link", { name: "Login", exact: true });
  await expect(login).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
  await expect(login).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(login).toBeVisible();
});

test("provider filters, jobs search and the map use live listings", async ({ page }) => {
  await page.goto("/");
  await expect(provider(page, "MedReach E2E Hospital")).toBeVisible();
  const panel = directory(page);
  await panel.getByRole("searchbox", { name: "Search healthcare providers" }).fill("O+");
  await expect(provider(page, "MedReach E2E Blood Bank")).toBeVisible();
  await expect(panel.locator("article[data-provider-id]")).toHaveCount(1);
  await panel.getByRole("button", { name: "Reset filters" }).click();
  await panel.getByLabel("Specialty / service").selectOption("MRI");
  await expect(provider(page, "MedReach E2E Diagnostics")).toBeVisible();
  await panel.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByRole("region", { name: /^(Map|Map unavailable)$/ }).first()).toBeVisible();
  const jobs = page.locator('[class*="home-jobs-panel"]');
  await expect(jobs.getByRole("link").filter({ hasText: "E2E Emergency Nurse" })).toBeVisible();
  await jobs.getByRole("searchbox", { name: "Search healthcare jobs" }).fill("unlisted role");
  await expect(jobs.getByText("No jobs match your search.")).toBeVisible();
  await jobs.getByRole("button", { name: "Clear job search" }).click();
  await expect(jobs.getByRole("link").filter({ hasText: "E2E Emergency Nurse" })).toBeVisible();
});

test("a failed jobs request leaves the directory usable and a targeted retry recovers", async ({ page }) => {
  const api = process.env.MEDREACH_HOME_TEST_API_URL || "http://localhost:4000";
  await page.route(`${api}/api/jobs*`, (route) => route.abort("failed"));
  await page.goto("/");
  await expect(provider(page, "MedReach E2E Hospital")).toBeVisible();
  const jobs = page.locator('[class*="home-jobs-panel"]');
  await expect(jobs.getByText("Job listings could not be loaded.")).toBeVisible();
  await page.unroute(`${api}/api/jobs*`);
  await jobs.getByRole("button", { name: "Retry jobs" }).click();
  const listing = jobs.getByRole("link").filter({ hasText: "E2E Emergency Nurse" });
  await expect(listing).toHaveAttribute("href", /^\/jobs\/[a-f0-9]{24}$/);
  await listing.click();
  await expect(page.getByRole("heading", { name: "E2E Emergency Nurse" }).first()).toBeVisible();
});
