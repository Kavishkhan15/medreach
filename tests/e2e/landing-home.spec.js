import { expect, test } from "@playwright/test";

const API = process.env.MEDREACH_HOME_TEST_API_URL || "http://localhost:4000";
const directory = (page) => page.getByRole("complementary", { name: "Healthcare directory" });
const card = (page, name) => page.locator(".home-provider-card").filter({ has: page.getByRole("button", { name: new RegExp(name) }) });

test.beforeEach(async ({ context }, testInfo) => {
  test.skip(testInfo.project.name !== "bootstrap", "The blue homepage is currently Bootstrap-only.");
  const client = [...testInfo.title].reduce((sum, char) => (sum + char.charCodeAt(0)) % 250, 1);
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.21.12.${client}` });
});

async function openHome(page) {
  await page.goto("/");
  await expect(directory(page).getByRole("button", { name: /MedReach E2E Hospital/ })).toBeVisible();
}

test("landing actions resolve to existing pages and hero actions navigate", async ({ page }) => {
  await openHome(page);
  const home = page.locator(".landing-home");
  await expect(home.getByRole("link", { name: "Full Map View →", exact: true })).toHaveAttribute("href", "/map");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Map", exact: true })).toHaveCount(0);
  const targets = await page.locator(".landing-home a, nav[aria-label='Primary'] a, .landing-footer-links a").evaluateAll((links) => [...new Set(links.filter((link) => link.getBoundingClientRect().width).map((link) => link.getAttribute("href")).filter((href) => href?.startsWith("/")))]);
  expect(targets).toEqual(expect.arrayContaining(["/hospitals", "/emergency", "/blood-banks", "/urgent-blood", "/diagnostics", "/ambulances", "/careers", "/map", "/track", "/login"]));
  await expect(page.locator('a[href="/about"]')).toHaveCount(0);
  for (const href of targets) {
    const response = await page.request.get(href);
    expect(response.status(), href).toBe(200);
  }
  await home.getByRole("link", { name: "Emergency care", exact: true }).click();
  await expect(page).toHaveURL(/\/emergency$/);
  await expect(page.getByRole("heading", { name: "Emergency mode", exact: true })).toBeVisible();
  await openHome(page);
  await home.getByRole("link", { name: "Explore healthcare", exact: true }).click();
  await expect(page).toHaveURL(/\/hospitals$/);
  await expect(page.getByText("MedReach E2E Hospital", { exact: true }).first()).toBeVisible();
});

test("directory categories, search, locality and services filter real API records", async ({ page }) => {
  await openHome(page);
  const panel = directory(page);
  const search = panel.getByRole("searchbox", { name: "Search healthcare providers" });
  for (const [label, name] of [["Hospitals", "MedReach E2E Hospital"], ["Blood Banks", "MedReach E2E Blood Bank"], ["Diagnostics", "MedReach E2E Diagnostics"], ["Ambulances", "MedReach E2E Ambulance"]]) {
    await panel.getByRole("button", { name: label, exact: true }).click();
    await expect(panel.locator(".home-provider-card")).toHaveCount(label === "Diagnostics" ? 2 : 1);
    await expect(panel.getByRole("button", { name: new RegExp(name) })).toBeVisible();
    await expect(panel.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await panel.getByRole("button", { name: "Reset filters", exact: true }).click();
  await search.fill("O+");
  await expect(panel.locator(".home-provider-card")).toHaveCount(1);
  await expect(panel.getByText("MedReach E2E Blood Bank", { exact: true })).toBeVisible();
  await search.fill("does not exist");
  await expect(panel.getByText("No matching providers.", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Clear filters", exact: true }).click();
  await panel.getByLabel("Locality", { exact: true }).selectOption("Andheri");
  await expect(panel.getByText("No matching providers.", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Reset filters", exact: true }).click();
  await panel.getByLabel("Specialty / service", { exact: true }).selectOption("MRI");
  await expect(panel.locator(".home-provider-card")).toHaveCount(1);
  await expect(panel.getByText("MedReach E2E Diagnostics", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Reset filters", exact: true }).click();
  await panel.getByLabel("Listed emergency capabilities").check();
  await expect(panel.getByText("MedReach E2E Hospital", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(panel.locator(".home-provider-card")).toHaveCount(5);
});

test("provider selection preserves contact, directions and standard bed route", async ({ page, request }) => {
  await openHome(page);
  const hospital = card(page, "MedReach E2E Hospital");
  await hospital.getByRole("button").click();
  await expect(hospital).toHaveClass(/is-selected/);
  await expect(hospital.getByRole("link", { name: "Call", exact: true })).toHaveAttribute("href", "tel:+91 22 4000 1000");
  await expect(hospital.getByRole("link", { name: "Directions", exact: true })).toHaveAttribute("href", /destination=19\.0596,72\.8295/);
  await expect(hospital.getByRole("link", { name: "Details", exact: true })).toHaveAttribute("href", "/hospitals/medreach-e2e-hospital");
  const response = await request.get(`${API}/api/hospitals`);
  const payload = await response.json();
  const record = payload.data.find((item) => item.slug === "medreach-e2e-hospital");
  await expect(hospital.getByRole("link", { name: "Bed Request", exact: true })).toHaveAttribute("href", `/requests/new?hospital=${record.hospitalId || record._id}&flow=standard`);
  await hospital.getByRole("link", { name: "Bed Request", exact: true }).click();
  await expect(page).toHaveURL(/\/requests\/new\?hospital=.*&flow=standard$/);
  await expect(page.getByRole("heading", { name: "Request hospital admission", exact: true })).toBeVisible();
});

test("blood and ambulance provider actions open the existing request modals", async ({ page }) => {
  await openHome(page);
  const panel = directory(page);
  await panel.getByRole("button", { name: "Blood Banks", exact: true }).click();
  const blood = card(page, "MedReach E2E Blood Bank");
  await blood.getByRole("button").click();
  await expect(blood.getByText(/Source: E2E controlled fixture/)).toHaveCount(0);
  await blood.getByRole("button", { name: "Request / Donate", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Blood Services: MedReach E2E Blood Bank", exact: true })).toBeVisible();
  await page.locator(".modal").getByRole("button", { name: "Close", exact: true }).click();
  await panel.getByRole("button", { name: "Ambulances", exact: true }).click();
  const ambulance = card(page, "MedReach E2E Ambulance");
  await ambulance.getByRole("button").click();
  await ambulance.getByRole("button", { name: "Book Ambulance", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /Book Ambulance/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Book Ambulance.*MedReach E2E Ambulance/ })).toBeVisible();
});

test("career search uses published API jobs and opens their existing application pages", async ({ page }) => {
  await openHome(page);
  await page.locator("#careers").scrollIntoViewIfNeeded();
  const jobs = page.locator(".home-jobs-panel");
  await expect(jobs.getByRole("link").filter({ hasText: "E2E Emergency Nurse" })).toBeVisible();
  await jobs.getByRole("searchbox", { name: "Search healthcare jobs" }).fill("unlisted job");
  await expect(jobs.getByText("No jobs match your search.", { exact: true })).toBeVisible();
  await jobs.getByRole("button", { name: "Clear job search", exact: true }).click();
  await jobs.getByRole("searchbox", { name: "Search healthcare jobs" }).fill("Nurse");
  const job = jobs.getByRole("link").filter({ hasText: "E2E Emergency Nurse" });
  await expect(job).toHaveAttribute("href", /^\/jobs\/[a-f0-9]{24}$/);
  await job.click();
  await expect(page.getByRole("heading", { name: "E2E Emergency Nurse", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit Application", exact: true })).toBeVisible();
});

test("partial failure retains directory results and targeted retries recover jobs", async ({ page }) => {
  await page.route(`${API}/api/jobs*`, (route) => route.abort("failed"));
  await openHome(page);
  await page.locator("#careers").scrollIntoViewIfNeeded();
  const jobs = page.locator(".home-jobs-panel");
  await expect(jobs.getByText("Job listings could not be loaded.", { exact: true })).toBeVisible();
  await expect(directory(page).locator(".home-provider-card")).toHaveCount(5);
  await page.unroute(`${API}/api/jobs*`);
  await jobs.getByRole("button", { name: "Retry jobs", exact: true }).click();
  await expect(jobs.getByRole("link").filter({ hasText: "E2E Emergency Nurse" })).toBeVisible();
  await page.route(`${API}/api/hospitals*`, (route) => route.abort("failed"));
  await page.goto("/");
  await expect(directory(page).getByRole("alert")).toContainText("Hospitals could not be loaded");
  await expect(directory(page).locator(".home-provider-card")).toHaveCount(4);
  await page.unroute(`${API}/api/hospitals*`);
  await directory(page).getByRole("button", { name: "Retry directory", exact: true }).click();
  await expect(directory(page).getByText("MedReach E2E Hospital", { exact: true })).toBeVisible();
});

test("homepage fits mobile and desktop and shared navigation and footer remain usable on other routes", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openHome(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const order = await page.locator(".landing-home").evaluate((node) => [...node.children].slice(0, 2).map((child) => child.className));
    expect(order).toEqual(["home-hero-wrap", "home-section home-directory"]);
    await page.locator(".home-directory-map").scrollIntoViewIfNeeded();
    await expect(page.getByRole("region", { name: /^(Map|Map unavailable)$/ }).first()).toBeVisible();
    if (width < 1200) {
      const nav = page.getByRole("navigation", { name: "Primary" });
      await nav.getByRole("button", { name: "Toggle navigation", exact: true }).press("Enter");
      await expect(nav.getByRole("link", { name: "Hospitals", exact: true })).toBeVisible();
      await nav.getByRole("button", { name: "Toggle navigation", exact: true }).press("Enter");
    }
  }
  const sharedLoginColour = await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Login", exact: true }).evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.goto("/track");
  await expect(page.getByRole("heading", { name: "Track a request", exact: true })).toBeVisible();
  await expect(page.locator(".landing-footer-links")).toBeVisible();
  await expect(page.locator(".landing-footer-links").getByRole("link", { name: "Healthcare map", exact: true })).toHaveAttribute("href", "/map");
  expect(await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Login", exact: true }).evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(sharedLoginColour);
  expect(errors).toEqual([]);
});
