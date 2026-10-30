import { test, expect } from "@playwright/test";
const hospital = { _id: "111111111111111111111111", name: "Test Hospital", kind: "hospital" };
const bank = { _id: "222222222222222222222222", name: "Test Blood Bank", kind: "blood_bank" };
const draft = { _id: "333333333333333333333333", title: "Ward nurse draft", status: "draft", category: "Nurse", employmentType: "full_time", hospital: { _id: hospital._id, name: hospital.name } };
async function fixtures(page, role = "provider_admin") {
  const state = { reads: [], contact: null, submitted: null, job: { ...draft } };
  await page.route("**/api/**", async route => {
    const req = route.request(), url = new URL(req.url()); state.reads.push(url.pathname);
    let body = { data: [] };
    if (url.pathname === "/api/auth/me") body = { user: { _id: "444444444444444444444444", role, name: "Provider Reviewer", region: "Mumbai" } };
    if (url.pathname === "/api/hospitals") body = { data: [{ ...hospital, slug: "test-hospital" }] };
    if (url.pathname === "/api/providers/mine") body = { data: [hospital, bank] };
    if (url.pathname.endsWith("/report")) body = { data: { organizationId: url.pathname.split("/").at(-2), kind: url.pathname.includes("blood_bank") ? "blood_bank" : "hospital", generatedAt: new Date().toISOString(), requests: [], applications: 0, observations: 0 } };
    if (url.pathname === `/api/admin/resources/${bank._id}` && req.method() === "PATCH") { state.contact = req.postDataJSON(); body = { data: bank }; }
    if (url.pathname === "/api/jobs/manage") body = { data: [state.job, { ...draft, _id: "555555555555555555555555", title: "Published technician", status: "published" }] };
    if (url.pathname === `/api/jobs/${draft._id}/status`) { state.submitted = req.postDataJSON(); state.job = { ...state.job, status: "pending" }; body = { job: state.job }; }
    if (url.pathname === "/api/jobs" && req.method() === "POST") body = { job: { ...draft, ...req.postDataJSON() } };
    await route.fulfill({ json: body });
  });
  return state;
}
test.beforeEach(({}, info) => test.skip(info.project.name !== "bootstrap", "Bootstrap provider UI only"));

test("workspace shows only the selected service requests and saves that organisation's contact details", async ({ page }, info) => {
  const state = await fixtures(page);
  await page.goto("/provider");
  await expect(page.getByRole("heading", { name: "Patient requests", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bed requests", exact: true })).toBeVisible();
  expect(state.reads).not.toContain("/api/blood-requests"); expect(state.reads).not.toContain("/api/ambulances/bookings");
  await page.getByLabel("Assigned organisation", { exact: true }).selectOption(bank._id);
  await expect(page.getByRole("heading", { name: "Blood requests and donation pledges", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bed requests", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: `Reports · ${bank.name}`, exact: true })).toBeVisible();
  await page.getByLabel("Contact phone", { exact: true }).fill("+919876543210");
  await page.getByRole("button", { name: "Save contact information" }).click();
  await expect(page.getByText("Contact update confirmed.", { exact: true })).toBeVisible();
  expect(state.contact.phone).toBe("+919876543210");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("provider-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("provider-mobile.png"), fullPage: true });
});

test("provider can find drafts, submit for review and clear a successfully saved form", async ({ page }, info) => {
  const state = await fixtures(page);
  await page.goto("/provider/jobs");
  await expect(page.getByRole("navigation", { name: "Provider sections" })).toBeVisible();
  await page.getByLabel("Listing status", { exact: true }).selectOption("draft");
  await expect(page.getByRole("article", { name: "Published technician", exact: true })).toHaveCount(0);
  const card = page.getByRole("article", { name: draft.title, exact: true });
  await card.getByRole("button", { name: "Submit for review", exact: true }).click();
  expect(state.submitted).toEqual({ status: "published" });
  await page.getByLabel("Listing status", { exact: true }).selectOption("pending");
  await expect(card).toContainText("Awaiting review");
  await expect(card).toContainText("This role is not public yet");
  await page.getByLabel("Find a role or organisation").fill("no matching title");
  await expect(page.getByText("No listings match your filters.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Clear job filters" }).click();
  await page.getByLabel("Position Title", { exact: true }).fill("New laboratory role");
  await page.getByLabel("Role description", { exact: true }).fill("Provide laboratory services and maintain daily quality records.");
  await page.getByRole("button", { name: "Save Job Draft", exact: true }).click();
  await expect(page.getByText("Job draft created successfully.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Position Title", { exact: true })).toHaveValue("");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("provider-jobs-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("provider-jobs-mobile.png"), fullPage: true });
  await page.getByRole("navigation", { name: "On this jobs page" }).getByRole("link", { name: "Review your listings" }).click();
  await expect(page.getByRole("heading", { name: "Your job listings", exact: true })).toBeInViewport();
});

test("unavailable provider reports do not become zero activity counts", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/providers/*/*/report", route => route.fulfill({ status: 503, json: { error: "Report unavailable" } }));
  await page.goto("/provider");
  await expect(page.getByRole("button", { name: "Retry organisation report" })).toBeVisible();
  await expect(page.getByLabel("Organisation activity summary").getByText("Unavailable", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Save contact information" })).toBeVisible();
});

test("ordinary users cannot load provider job or assignment records", async ({ page }) => {
  const state = await fixtures(page, "user");
  for (const path of ["/provider", "/provider/jobs"]) {
    await page.goto(path);
    await expect(page.getByText("Provider administrator access is required.", { exact: false })).toBeVisible();
  }
  expect(state.reads).not.toContain("/api/providers/mine"); expect(state.reads).not.toContain("/api/jobs/manage");
});
