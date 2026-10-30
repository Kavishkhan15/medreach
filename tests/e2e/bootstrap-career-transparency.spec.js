import { test, expect } from "@playwright/test";

const hospitalId = "111111111111111111111111", jobId = "777777777777777777777777";
const job = { _id: jobId, __v: 2, title: "Ward Nurse", organizationName: "Synthetic Career Hospital", hospital: { _id: hospitalId, name: "Synthetic Career Hospital" }, description: "Care for patients in the general ward.", employmentType: "full_time", category: "Nurse", status: "published", vacancies: 5, filledPositions: 2, availability: { total: 5, filled: 2, remaining: 3, acceptingApplications: true, reportedAt: new Date().toISOString() } };
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "bootstrap", "Career transparency is Bootstrap only");
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let body = { data: [] };
    if (url.pathname === "/api/auth/me") body = { user: { _id: "333333333333333333333333", name: "Provider HR", role: "provider_admin", region: "Mumbai" } };
    if (url.pathname === "/api/organizations/careers") body = { data: [] };
    if (url.pathname === "/api/jobs") body = { data: [job], pagination: { hasMore: false } };
    if (url.pathname === `/api/jobs/${jobId}`) body = { job };
    if (url.pathname === "/api/jobs/manage") body = { data: [job] };
    if (url.pathname === "/api/providers/mine") body = { data: [{ _id: hospitalId, name: "Synthetic Career Hospital", kind: "hospital" }] };
    await route.fulfill({ json: body });
  });
});

test("careers shows published roles and distinguishes vacancies from general interest", async ({ page }, info) => {
  await page.goto("/careers");
  const roles = page.getByRole("region", { name: "Open roles", exact: true });
  await expect(roles).toContainText("3 positions open");
  await expect(roles).toContainText("2 filled · 5 total positions");
  await expect(page.getByRole("heading", { name: "General expressions of interest" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("careers-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("careers-mobile.png"), fullPage: true });
  const search = page.waitForRequest(request => request.url().includes("/api/jobs?") && request.url().includes("q=Nurse"));
  await roles.getByLabel("Search roles or locations").fill("Nurse");
  await roles.getByLabel("Employment type", { exact: true }).selectOption("part_time");
  await roles.getByRole("button", { name: "Find roles" }).click();
  expect(new URL((await search).url()).searchParams.get("employmentType")).toBe("part_time");
  await roles.getByRole("link", { name: "View role and apply" }).click();
  await expect(page.getByRole("heading", { name: "Ward Nurse", exact: true })).toBeVisible();
  await expect(page.getByLabel("Position availability")).toContainText("3 positions open");
});

test("unknown position counts stay unknown, and full roles block applications", async ({ page }) => {
  await page.route(`**/api/jobs/${jobId}`, route => route.fulfill({ json: { job: { ...job, availability: { total: null, filled: null, remaining: null, acceptingApplications: true } } } }));
  await page.goto(`/jobs/${jobId}`);
  await expect(page.getByLabel("Position availability")).toContainText("Position count not reported");
  await expect(page.getByLabel("Position availability")).not.toContainText("0 positions open");
  await page.route(`**/api/jobs/${jobId}`, route => route.fulfill({ json: { job: { ...job, availability: { total: 5, filled: 5, remaining: 0, acceptingApplications: false } } } }));
  await page.reload();
  await expect(page.getByLabel("Position availability")).toContainText("0 positions open");
  await expect(page.getByRole("button", { name: "Submit Application", exact: true })).toBeDisabled();
});

test("provider vacancy editor sends the version and preserves inputs on a conflict", async ({ page }) => {
  let sent;
  await page.route(`**/api/jobs/${jobId}/availability`, async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 409, json: { error: "This role changed. Refresh before saving vacancy counts." } });
  });
  await page.goto("/provider/jobs");
  const editor = page.getByRole("region", { name: "Vacancies for Ward Nurse" });
  await editor.locator("summary").click();
  await editor.getByLabel("Filled positions", { exact: true }).fill("3");
  await editor.getByRole("button", { name: "Update position counts" }).click();
  await expect(page.getByText("The record has changed or this action is no longer allowed. Refresh and check its current status.", { exact: true })).toBeVisible();
  expect(sent).toEqual({ vacancies: 5, filledPositions: 3, expectedVersion: 2 });
  await expect(editor.getByLabel("Filled positions", { exact: true })).toHaveValue("3");
});

test("provider can draft a role with positions, requirements, compensation and a Mumbai deadline", async ({ page }) => {
  let sent;
  await page.route("**/api/jobs", async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { job: { ...job, ...sent, status: "draft", filledPositions: 0 } } });
  });
  await page.goto("/provider/jobs");
  await page.getByLabel("Position Title", { exact: true }).fill("Laboratory Technician");
  await page.getByLabel("Total positions (optional)").fill("4");
  await page.getByLabel("Department", { exact: true }).fill("Pathology");
  await page.getByLabel("Role description", { exact: true }).fill("Prepare and process laboratory samples under clinical supervision.");
  await page.getByLabel("Qualifications and requirements").fill("DMLT with two years of experience");
  await page.getByLabel("Salary or compensation (optional)").fill("₹30,000 per month");
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Application deadline (optional)").fill(date);
  await page.getByRole("button", { name: "Save Job Draft", exact: true }).click();
  await expect(page.getByText("Job draft created successfully.", { exact: true })).toBeVisible();
  expect(sent.vacancies).toBe(4); expect(sent.hospital).toBe(hospitalId); expect(sent.provider).toBeUndefined();
  expect(sent.requirements).toBe("DMLT with two years of experience");
  expect(sent.deadline).toBe(`${date}T23:59:59+05:30`);
});
