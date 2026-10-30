import { test, expect } from "@playwright/test";

const hospitalId = "111111111111111111111111";
const centreId = "222222222222222222222222";
const reference = "DX-0123456789ABCDEF0123";
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "bootstrap", "Capacity form changes apply to Bootstrap only");
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let body = { data: [] };
    if (url.pathname === "/api/auth/me") body = { user: { _id: "333333333333333333333333", name: "Test Patient", role: "user", region: "Mumbai", email: "patient@example.test", emailVerifiedAt: new Date().toISOString() } };
    if (url.pathname === "/api/hospitals") body = { data: [{ _id: hospitalId, name: "Synthetic Capacity Hospital", locality: "Mumbai" }] };
    if (url.pathname === `/api/inventory/hospital/${hospitalId}`) body = { data: [
      { resourceKey: "general_beds", available: 23, capacity: 30, classification: "provider_confirmed", expiresAt: new Date(Date.now() + 60000).toISOString() },
      { resourceKey: "icu_beds", available: 4, capacity: 10, classification: "provider_confirmed", expiresAt: new Date(Date.now() + 60000).toISOString() },
    ] };
    if (url.pathname === "/api/diagnostics") body = { data: [{ _id: centreId, name: "Synthetic Diagnostic Centre", approvalStatus: "approved", services: ["Blood Test"] }] };
    if (url.pathname === `/api/diagnostics/${centreId}`) body = { data: { _id: centreId, name: "Synthetic Diagnostic Centre", approvalStatus: "approved" } };
    if (url.pathname === `/api/capacity/diagnostic/${centreId}/daily`) body = { data: [{ test: "CBC", date: url.searchParams.get("date"), capacity: 30, routineRemaining: 0, configured: true }] };
    await route.fulfill({ json: body });
  });
});

test("ordinary bed form shows verified General and ICU counts; emergency form hides them", async ({ page }) => {
  await page.goto(`/requests/new?hospital=${hospitalId}&flow=standard`);
  const capacity = page.getByRole("region", { name: "Current hospital bed availability" });
  await expect(capacity).toContainText("23 available");
  await expect(capacity).toContainText("4 available");
  await page.goto(`/requests/new?hospital=${hospitalId}&flow=emergency`);
  await expect(page.getByLabel("Target Hospital")).toHaveValue(hospitalId);
  await expect(page.getByRole("region", { name: "Current hospital bed availability" })).toHaveCount(0);
});

test("unknown or stale inventory never becomes a displayed zero", async ({ page }) => {
  await page.route(`**/api/inventory/hospital/${hospitalId}`, route => route.fulfill({ json: { data: [
    { resourceKey: "general_beds", available: 30, classification: "demo", expiresAt: new Date(Date.now() + 60000).toISOString() },
    { resourceKey: "icu_beds", available: 0, classification: "provider_confirmed", expiresAt: new Date(Date.now() - 1000).toISOString() },
  ] } }));
  await page.goto(`/requests/new?hospital=${hospitalId}&flow=standard`);
  const capacity = page.getByRole("region", { name: "Current hospital bed availability" });
  await expect(capacity.getByText("Availability unknown", { exact: true })).toHaveCount(2);
  await expect(capacity).not.toContainText("0 available");
});

test("diagnostic directory carries Emergency selection into each request link", async ({ page }) => {
  await page.goto("/diagnostics");
  await page.getByRole("button", { name: "Emergency tests", exact: true }).click();
  await expect(page.getByRole("link", { name: "Request emergency tests" })).toHaveAttribute("href", `/diagnostics/request?centre=${centreId}&urgency=URGENT`);
});

test("bed counts become unknown at their expiry while the form stays open", async ({ page }) => {
  await page.route(`**/api/inventory/hospital/${hospitalId}`, route => route.fulfill({ json: { data: [
    { resourceKey: "general_beds", available: 12, capacity: 30, classification: "provider_confirmed", expiresAt: new Date(Date.now() + 2000).toISOString() },
  ] } }));
  await page.goto(`/requests/new?hospital=${hospitalId}&flow=standard`);
  const capacity = page.getByRole("region", { name: "Current hospital bed availability" });
  await expect(capacity).toContainText("12 available");
  await expect(capacity.getByText("Availability unknown", { exact: true })).toHaveCount(2);
  await expect(capacity).not.toContainText("12 available");
});

test("a full routine date blocks submission but permits an emergency review request", async ({ page }) => {
  let sent;
  await page.route("**/api/diagnostics/requests", async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, reference, trackingToken: "private-test-token", request: {
      reference, tests: ["CBC"], urgency: "URGENT", status: "REQUESTED", capacityAllocation: { mode: "coordination", reason: "EMERGENCY_CAPACITY_REVIEW_REQUIRED" },
    } } });
  });
  await page.goto(`/diagnostics/request?centre=${centreId}`);
  await page.getByRole("checkbox", { name: "Complete Blood Count (CBC)", exact: true }).check();
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Preferred date", { exact: true }).fill(date);
  await expect(page.getByRole("button", { name: "Send Test Request", exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Daily test capacity" })).toContainText("Fully booked");
  await page.getByRole("button", { name: "Emergency", exact: true }).click();
  await page.getByLabel("Patient name", { exact: true }).fill("Synthetic Patient");
  await page.getByLabel("Contact number", { exact: true }).fill("+919876543210");
  await page.getByLabel("Preferred time", { exact: true }).selectOption("MORNING");
  await page.getByRole("checkbox", { name: /I agree to share/ }).check();
  await page.getByRole("button", { name: "Send Test Request", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your test request is recorded" })).toBeVisible();
  expect(sent.urgency).toBe("URGENT"); expect(sent.preferredDate).toBe(date);
  await expect(page.getByRole("status").filter({ hasText: "No test appointment has been reserved" })).toBeVisible();
});
