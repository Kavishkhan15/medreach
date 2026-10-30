import { test, expect } from "@playwright/test";

const centreId = "222222222222222222222222";
const hospitalId = "111111111111111111111111";
const dateInMumbai = offset => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86400000));

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "bootstrap", "Transparency UI is Bootstrap only");
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let body = { data: [] };
    if (url.pathname === "/api/auth/me") body = { user: null };
    if (url.pathname === "/api/diagnostics") body = { data: [{ _id: centreId, name: "Synthetic Transparency Centre", approvalStatus: "approved" }] };
    if (url.pathname === `/api/diagnostics/${centreId}`) body = { data: { _id: centreId, name: "Synthetic Transparency Centre", approvalStatus: "approved" } };
    if (url.pathname === `/api/capacity/diagnostic/${centreId}/daily`) body = { data: [
      { test: "CBC", date: url.searchParams.get("date"), capacity: 30, urgentCapacity: 0, held: 2, occupied: 8, routineRemaining: 20, configured: true },
      { test: "BLOOD_GLUCOSE", date: url.searchParams.get("date"), capacity: 30, urgentCapacity: 0, held: 0, occupied: 30, routineRemaining: 0, configured: true },
      { test: "LIPID_PROFILE", date: url.searchParams.get("date"), capacity: 30, urgentCapacity: 0, routineRemaining: null, configured: false },
    ] };
    if (url.pathname === "/api/hospitals/transparency-hospital") body = { hospital: { _id: hospitalId, name: "Synthetic Transparency Hospital", slug: "transparency-hospital" } };
    if (url.pathname.endsWith("/enriched")) body = { enriched: null };
    if (url.pathname === `/api/inventory/hospital/${hospitalId}`) body = { data: [
      { resourceKey: "general_beds", capacity: 30, available: 0, classification: "provider_confirmed", observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() },
      { resourceKey: "icu_beds", capacity: 10, available: null, classification: "unknown" },
    ] };
    await route.fulfill({ json: body });
  });
});

test("diagnostic transparency separates available, fully booked and unknown test slots", async ({ page }) => {
  let capacityReads = 0;
  page.on("request", request => { if (request.url().includes("/api/capacity/diagnostic/")) capacityReads += 1; });
  await page.goto("/diagnostics");
  const panel = page.getByRole("region", { name: "Diagnostic slot availability" });
  await expect(panel).toBeVisible();
  expect(capacityReads).toBe(0);
  await panel.getByLabel("Diagnostic centre for availability").selectOption(centreId);
  const cbc = panel.getByRole("row").filter({ hasText: "Complete Blood Count (CBC)" });
  await expect(cbc).toContainText("20 available");
  await expect(cbc.getByRole("cell", { exact: true, name: "10" })).toBeVisible();
  await expect(panel.getByRole("row").filter({ hasText: "Blood Glucose" })).toContainText("0 — Fully booked");
  await expect(panel.getByRole("row").filter({ hasText: "Lipid Profile" })).toContainText("Availability unknown");
  const date = dateInMumbai(3);
  await panel.getByLabel("Availability date").fill(date);
  await expect(panel.getByRole("link", { name: "Request tests at this centre" })).toHaveAttribute("href", `/diagnostics/request?centre=${centreId}&date=${date}`);
  await panel.getByRole("link", { name: "Request tests at this centre" }).click();
  await expect(page.getByLabel("Preferred date", { exact: true })).toHaveValue(date);
});

test("changing diagnostic date discards earlier counts and ignores a late prior response", async ({ page }) => {
  let completeOld;
  await page.route(`**/api/capacity/diagnostic/${centreId}/daily?**`, async route => {
    const date = new URL(route.request().url()).searchParams.get("date");
    if (date === dateInMumbai(1)) await new Promise(resolve => { completeOld = resolve; });
    await route.fulfill({ json: { data: [{ test: "CBC", date, capacity: 30, urgentCapacity: 0, configured: true, routineRemaining: date === dateInMumbai(1) ? 29 : 0 }] } }).catch(() => {});
  });
  await page.goto("/diagnostics");
  const panel = page.getByRole("region", { name: "Diagnostic slot availability" });
  await panel.getByLabel("Availability date").fill(dateInMumbai(1));
  await panel.getByLabel("Diagnostic centre for availability").selectOption(centreId);
  await expect.poll(() => typeof completeOld).toBe("function");
  await panel.getByLabel("Availability date").fill(dateInMumbai(2));
  await expect(panel.getByRole("row").filter({ hasText: "Complete Blood Count (CBC)" })).toContainText("0 — Fully booked");
  completeOld();
  await expect(panel).not.toContainText("29 available");
});

test("invalid diagnostic date query is not accepted as a preferred appointment date", async ({ page }) => {
  await page.goto(`/diagnostics/request?centre=${centreId}&date=2099-02-30`);
  await expect(page.getByLabel("Preferred date", { exact: true })).toHaveValue("");
});

test("diagnostic availability carries Emergency priority and date into the request", async ({ page }) => {
  await page.goto("/diagnostics");
  await page.getByRole("button", { name: "Emergency tests", exact: true }).click();
  const panel = page.getByRole("region", { name: "Diagnostic slot availability" });
  await panel.getByLabel("Diagnostic centre for availability").selectOption(centreId);
  await panel.getByLabel("Availability date").fill(dateInMumbai(2));
  const link = panel.getByRole("link", { name: "Request emergency review at this centre" });
  await expect(link).toHaveAttribute("href", `/diagnostics/request?centre=${centreId}&date=${dateInMumbai(2)}&urgency=URGENT`);
  await link.click();
  await expect(page.getByRole("button", { name: "Emergency", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Preferred date", { exact: true })).toHaveValue(dateInMumbai(2));
});

test("hospital details distinguish confirmed zero beds from unknown ICU inventory", async ({ page }) => {
  await page.goto("/hospitals/transparency-hospital");
  const panel = page.getByRole("region", { name: "Current hospital bed availability" });
  await expect(panel).toContainText("0 available");
  await expect(panel.getByText("Availability unknown", { exact: true })).toHaveCount(1);
  await expect(panel).toContainText("Operational capacity: 30");
  await expect(panel.getByRole("button", { name: "Refresh bed counts" })).toBeVisible();
});
