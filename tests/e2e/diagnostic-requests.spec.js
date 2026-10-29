import { test, expect } from "@playwright/test";

const API = process.env.MEDREACH_HOME_TEST_API_URL || "http://localhost:4000";
const dateInIndia = date => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "bootstrap", "Diagnostic request frontend is Bootstrap only");
  page.__diagnosticErrors = [];
  page.on("pageerror", error => page.__diagnosticErrors.push(error.message));
});
test.afterEach(async ({ page }) => expect(page.__diagnosticErrors).toEqual([]));

async function fillRequest(page) {
  await page.getByLabel("Patient name", { exact: true }).fill("Diagnostic Browser Patient");
  await page.getByLabel("Contact number", { exact: true }).fill("+91 9876543210");
  await page.getByLabel("Preferred date", { exact: true }).fill(dateInIndia(new Date(Date.now() + 2 * 86400000)));
  await page.getByLabel("Preferred time", { exact: true }).selectOption("MORNING");
  await page.getByLabel(/I agree to share/).check();
}

test("legacy diagnostic listing requires explicit approval before provisioning", async ({ page }) => {
  const id = "111111111111111111111111";
  let approved = false;
  let approvalCalls = 0;
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    let body = { data: [] };
    if (path === "/api/auth/me") body = { user: { _id: id, name: "Test Admin", role: "system_admin", email: "admin@example.test", region: "Mumbai" } };
    if (path === "/api/admin/provider-accounts") body = { data: [], manualCredentialsEnabled: false };
    if (path === "/api/admin/provider-approvals/organizations") body = { data: [{ _id: id, name: "Legacy Diagnostic Centre", kind: "diagnostic", verificationStatus: "verified", ...(approved ? { approvalStatus: "approved" } : {}) }] };
    if (path === `/api/admin/provider-approvals/organizations/diagnostic/${id}/approve`) {
      expect(route.request().method()).toBe("POST");
      approved = true; approvalCalls += 1; body = { ok: true };
    }
    await route.fulfill({ json: body });
  });
  await page.goto("/admin/provider-accounts");
  await page.getByLabel("Organisation", { exact: true }).selectOption(id);
  await page.getByLabel("Credential delivery", { exact: true }).selectOption("invitation");
  await expect(page.getByRole("button", { name: "Create Provider Admin account", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Approve selected organisation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve selected organisation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Provider Admin account", exact: true })).toBeEnabled();
  expect(approvalCalls).toBe(1);
});

test("guest selects multiple tests, tracks a private request, and cancels it", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/diagnostics");
  const centre = page.getByRole("article").filter({ hasText: "MedReach E2E Diagnostics" });
  await centre.getByRole("link", { name: "Request tests", exact: true }).click();
  await expect(page.getByLabel("Diagnostic centre", { exact: true })).toHaveValue("MedReach E2E Diagnostics");
  await fillRequest(page);
  await page.getByRole("button", { name: "Send Test Request", exact: true }).click();
  await expect(page.locator(".diagnostic-request-page").getByRole("alert")).toHaveText("Select at least one test.");
  await page.getByLabel("Complete Blood Count (CBC)", { exact: true }).check();
  await page.getByLabel("Lipid Profile", { exact: true }).check();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: info.outputPath("diagnostic-form-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Send Test Request", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your test request is recorded" })).toBeVisible();
  await page.getByRole("link", { name: "Track test request", exact: true }).click();
  const status = page.getByRole("region", { name: "Request status", exact: true });
  await expect(status.getByText("Complete Blood Count (CBC) · Lipid Profile", { exact: false })).toBeVisible();
  await expect(status.getByRole("button", { name: "Cancel test request" })).toBeVisible();
  expect(page.url()).not.toContain("#token=");
  page.once("dialog", dialog => dialog.accept());
  await status.getByRole("button", { name: "Cancel test request" }).click();
  await expect(status.getByText("Status: Cancelled", { exact: true })).toBeVisible();
});

test("form remains usable on a small screen and handles missing centre selection", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/diagnostics/request");
  await expect(page.locator(".diagnostic-request-page").getByRole("alert")).toHaveText(/Choose a diagnostic centre/);
  await page.getByRole("link", { name: "← Diagnostic centres" }).click();
  await page.getByRole("article").filter({ hasText: "MedReach E2E Diagnostics" }).getByRole("link", { name: "Request tests", exact: true }).click();
  await expect(page.getByLabel("Diagnostic centre", { exact: true })).toHaveValue("MedReach E2E Diagnostics");
  await fillRequest(page);
  await page.getByLabel("Blood Glucose", { exact: true }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: info.outputPath("diagnostic-form-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Send Test Request", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your test request is recorded" })).toBeVisible();
});

test("assigned centre admin confirms a subset of tests and a patient sees the actual appointment", async ({ page, browser, request }) => {
  const centres = await (await request.get(`${API}/api/diagnostics`)).json();
  const centre = centres.data.find(row => row.name === "MedReach E2E Diagnostics");
  const created = await request.post(`${API}/api/diagnostics/requests`, { headers: { "Idempotency-Key": `browser-diagnostic-${Date.now()}` }, data: {
    providerId: centre._id, tests: ["CBC", "THYROID_PROFILE"], patientName: "Diagnostic Review Patient", contactPhone: "+91 9876543210",
    preferredDate: dateInIndia(new Date(Date.now() + 2 * 86400000)), preferredTime: "MORNING", consent: true,
  } });
  expect(created.status()).toBe(201);
  const saved = await created.json();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("diagnostic.provider.e2e@medreach.test");
  await page.getByLabel("Password", { exact: true }).fill("E2E_SafePassword_123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/provider$/);
  await page.getByLabel("Organisation", { exact: true }).selectOption(centre._id);
  const card = page.getByRole("article").filter({ hasText: saved.reference });
  await expect(card.getByText("Diagnostic Review Patient", { exact: false })).toBeVisible();
  await card.getByLabel("Thyroid Profile", { exact: true }).uncheck();
  await card.getByLabel("Appointment date and time (India time)", { exact: true }).fill(`${dateInIndia(new Date(Date.now() + 2 * 86400000))}T10:30`);
  await card.getByLabel("Message to patient", { exact: true }).fill("Only CBC can be arranged at this appointment.");
  await card.getByRole("button", { name: "Confirm appointment", exact: true }).click();
  await expect(card.getByRole("button", { name: "Mark completed", exact: true })).toBeVisible();
  const guest = await browser.newContext();
  try {
    const patient = await guest.newPage();
    await patient.goto(`${new URL(page.url()).origin}/track?type=diagnostic&reference=${saved.reference}#token=${saved.trackingToken}`);
    const detail = patient.getByRole("region", { name: "Request status", exact: true });
    await expect(detail.getByText("Status: Confirmed", { exact: true })).toBeVisible();
    await expect(detail.getByText("Accepted tests: Complete Blood Count (CBC)", { exact: true })).toBeVisible();
    await expect(detail.getByText("Tests not available in this appointment: Thyroid Profile", { exact: true })).toBeVisible();
    await expect(detail.getByText(/10:30/)).toBeVisible();
  } finally { await guest.close(); }
});
