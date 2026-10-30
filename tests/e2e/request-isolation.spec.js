import { test, expect } from "@playwright/test";

const API = process.env.MEDREACH_HOME_TEST_API_URL || "http://localhost:4000";
const PASSWORD = "E2E_SafePassword_123!";

test.beforeEach(async ({ context, page }, info) => {
  const variant = ["bootstrap", "tailwind", "skeleton"].indexOf(info.project.name) + 1;
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.22.${variant}.240` });
  page.__requestErrors = [];
  page.on("pageerror", error => page.__requestErrors.push(error.message));
});
test.afterEach(async ({ page }) => expect(page.__requestErrors).toEqual([]));

async function login(page, email, destination) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
}

async function post(request, path, data) {
  const response = await request.post(`${API}${path}`, { data });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
  return response.json();
}

test("registered users see their own normal, emergency and donation history; other users cannot read private bed records", async ({ page, browser }, info) => {
  // Use the isolated, email-verified account prepared by the E2E setup.
  const email = `${info.project.name}.e2e@medreach.test`;
  await login(page, email, "/dashboard");
  const hospital = (await (await page.request.get(`${API}/api/hospitals`)).json()).data.find(row => row.slug === "medreach-e2e-hospital");
  const bank = (await (await page.request.get(`${API}/api/blood-banks`)).json()).data.find(row => row.name === "MedReach E2E Blood Bank");
  const ambulance = (await (await page.request.get(`${API}/api/ambulances`)).json()).data.find(row => row.name === "MedReach E2E Ambulance");
  const references = [], beds = [];
  for (const flow of ["standard", "emergency"]) {
    const result = await post(page.request, `/api/emergency-requests/${flow}`, { hospitalId: hospital._id, emergencyType: "General", requiredFacility: "ICU", contactPhone: "+919876543210" });
    expect(result.request.isEmergency).toBe(flow === "emergency");
    references.push(result.request.requestId); beds.push(result.request._id);
  }
  for (const [flow, type] of [["standard", "REQUEST"], ["urgent", "REQUEST"], ["standard", "DONATION"]]) {
    const result = await post(page.request, `/api/blood-requests/${flow}`, { providerId: bank._id, bloodBankName: bank.name, type, bloodGroup: "O+", urgency: flow === "urgent" ? "within 6 hours" : "3 days", patientOrDonorName: "Isolated history patient", contactPhone: "+919876543210" });
    expect(result.bloodRequest.isUrgent).toBe(flow === "urgent");
    references.push(result.reference);
  }
  for (const isEmergency of [false, true]) {
    const result = await post(page.request, "/api/ambulances/book", { providerId: ambulance._id, patientName: "Isolated history patient", patientAge: 30, contactPhone: "+919876543210", ambulanceRequired: true, bookingPickup: "Controlled test street", isEmergency });
    const stored = await page.request.get(`${API}/api/ambulances/bookings/${result.reference}`);
    expect(stored.status()).toBe(200);
    expect((await stored.json()).booking.isEmergency).toBe(isEmergency);
    references.push(result.reference);
  }
  await page.goto("/requests");
  for (const reference of references) await expect(page.locator("main").first()).toContainText(reference);
  await expect(page.getByRole("heading", { name: "Blood requests and donation pledges" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ambulance requests", exact: true })).toBeVisible();

  let bloodUnavailable = true;
  await page.route(`${API}/api/blood-requests`, route => bloodUnavailable
    ? route.fulfill({ status: 503, json: { error: "Controlled test outage" } })
    : route.continue());
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry blood request history", exact: true })).toBeVisible();
  await expect(page.locator("main").first()).not.toContainText("No blood requests or donation pledges recorded.");
  await expect(page.locator("main").first()).toContainText(references.at(-1));
  bloodUnavailable = false;
  await page.getByRole("button", { name: "Retry blood request history", exact: true }).click();
  for (const reference of references) await expect(page.locator("main").first()).toContainText(reference);

  const strangerContext = await browser.newContext({ baseURL: new URL(page.url()).origin, extraHTTPHeaders: { "X-Forwarded-For": "198.22.250.241" } });
  try {
    const stranger = await strangerContext.newPage();
    await login(stranger, "support.e2e@medreach.test", "/dashboard");
    for (const id of beds) expect((await stranger.request.get(`${API}/api/emergency-requests/${id}`)).status()).toBe(403);
    await stranger.goto("/requests");
    for (const reference of references) await expect(stranger.locator("main").first()).not.toContainText(reference);
    await expect(stranger.getByText("No blood requests or donation pledges recorded.", { exact: true })).toBeVisible();
    await expect(stranger.getByText("No ambulance requests recorded.", { exact: true })).toBeVisible();
  } finally { await strangerContext.close(); }
});

test("Provider Admin switches assigned organisations and cannot read reports or update contacts and bookings for unassigned providers", async ({ page }, info) => {
  await login(page, `${info.project.name}.provider.e2e@medreach.test`, "/provider");
  const assigned = (await (await page.request.get(`${API}/api/providers/mine`)).json()).data;
  expect(assigned.map(row => row.kind).sort()).toEqual(["blood_bank", "hospital"]);
  const bank = assigned.find(row => row.kind === "blood_bank"), hospital = assigned.find(row => row.kind === "hospital");
  await page.getByLabel(info.project.name === "bootstrap" ? "Assigned organisation" : "Organisation", { exact: true }).selectOption(hospital._id);
  await expect(page.getByRole("heading", { name: "Bed requests", exact: true })).toBeVisible();
  await page.getByLabel(info.project.name === "bootstrap" ? "Assigned organisation" : "Organisation", { exact: true }).selectOption(bank._id);
  await expect(page.getByRole("heading", { name: "Blood requests and donation pledges", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bed requests", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: `Reports · ${bank.name}`, exact: true })).toBeVisible();
  for (const [path, kind, name] of [["diagnostics", "diagnostic", "MedReach E2E Diagnostics"], ["ambulances", "ambulance", "MedReach E2E Ambulance"]]) {
    const other = (await (await page.request.get(`${API}/api/${path}`)).json()).data.find(row => row.name === name);
    expect((await page.request.get(`${API}/api/providers/${kind}/${other._id}/report`)).status()).toBe(403);
    expect((await page.request.patch(`${API}/api/admin/resources/${other._id}`, { data: { phone: "+919876543210" } })).status()).toBe(403);
    if (kind === "ambulance") {
      const result = await post(page.request, "/api/ambulances/book", { providerId: other._id, patientName: "Isolated scope test", patientAge: 30, contactPhone: "+919876543210", isEmergency: false });
      expect((await page.request.patch(`${API}/api/ambulances/bookings/${result.booking._id}/status`, { data: { status: "CONFIRMED" } })).status()).toBe(403);
    }
  }
  expect((await page.request.get(`${API}/api/admin/provider-approvals`)).status()).toBe(403);
});
