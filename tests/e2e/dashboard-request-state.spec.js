import { test, expect } from "@playwright/test";

const resources = {
  requests: { path: "/api/emergency-requests", title: "Emergency requests", empty: "No bed requests yet.", reference: "ER-ISOLATED-TEST", rows: [{ _id: "111111111111111111111111", requestId: "ER-ISOLATED-TEST", status: "BROADCAST", hospital: { name: "Test hospital" }, isEmergency: false }] },
  blood: { path: "/api/blood-requests", title: "Blood requests", empty: "No blood requests or donation pledges recorded.", reference: "BR-ISOLATED-TEST", rows: [{ _id: "222222222222222222222222", reference: "BR-ISOLATED-TEST", type: "REQUEST", status: "REQUESTED", bloodBankName: "Test bank", isUrgent: false }] },
  ambulance: { path: "/api/ambulances/bookings", title: "Ambulance requests", empty: "No ambulance requests recorded.", reference: "AMB-ISOLATED-TEST", rows: [{ _id: "333333333333333333333333", reference: "AMB-ISOLATED-TEST", status: "RECORDED", providerSnapshot: { name: "Test ambulance" }, isEmergency: true }] },
};

async function mockApi(page, handler) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { user: { _id: "444444444444444444444444", name: "Test user", role: "user", region: "Mumbai", savedHospitals: [] } } });
    const key = Object.keys(resources).find(key => resources[key].path === path);
    return key ? handler(route, key) : route.fulfill({ json: { data: [] } });
  });
}

test.beforeEach(async ({ page }) => {
  page.__dashboardErrors = [];
  page.on("pageerror", error => page.__dashboardErrors.push(error.message));
});
test.afterEach(async ({ page }) => expect(page.__dashboardErrors).toEqual([]));

for (const [failedKey, resource] of Object.entries(resources)) {
  test(`${resource.title} failures and malformed responses retain other history and retry only the failed resource`, async ({ page }) => {
    let mode = "failed";
    const calls = { requests: 0, blood: 0, ambulance: 0 };
    await mockApi(page, (route, key) => {
      calls[key]++;
      if (key === failedKey && mode === "failed") return route.fulfill({ status: 503, json: { error: "Controlled history outage" } });
      if (key === failedKey && mode === "malformed") return route.fulfill({ json: { data: null } });
      return route.fulfill({ json: { data: resources[key].rows } });
    });
    for (const failureMode of ["failed", "malformed"]) {
      mode = failureMode;
      await page.goto("/dashboard");
      const panel = page.getByRole("region", { name: "Emergency requests", exact: true });
      const retry = panel.getByRole("button", { name: `Retry ${resource.title.toLowerCase()}`, exact: true });
      await expect(retry).toBeVisible();
      await expect(panel).not.toContainText(resource.empty);
      for (const [key, healthy] of Object.entries(resources)) if (key !== failedKey) await expect(panel).toContainText(healthy.reference);
      const before = { ...calls };
      mode = "success";
      await retry.click();
      await expect(panel).toContainText(resource.reference);
      expect(calls[failedKey]).toBe(before[failedKey] + 1);
      for (const key of Object.keys(resources)) if (key !== failedKey) expect(calls[key]).toBe(before[key]);
    }
  });
}

test("pending blood history is loading, then a successful empty response becomes a genuine empty state", async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await mockApi(page, async (route, key) => {
    if (key === "blood") await gate;
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto("/dashboard");
  const panel = page.getByRole("region", { name: "Emergency requests", exact: true });
  await expect(panel.getByRole("status").filter({ hasText: "Loading blood requests" })).toBeVisible();
  await expect(panel).not.toContainText(resources.blood.empty);
  release();
  for (const resource of Object.values(resources)) await expect(panel).toContainText(resource.empty);
  await expect(panel.getByRole("status")).toHaveCount(0);
});
