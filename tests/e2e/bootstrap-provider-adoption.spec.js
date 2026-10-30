import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, info) => { test.skip(Boolean(info.project.name) && info.project.name !== "bootstrap", "Bootstrap-specific provider UI"); page.on("pageerror", (error) => { throw error; }); });
const provider = { _id: "111111111111111111111111", id: "111111111111111111111111", name: "Fixture Provider", email: "fixture@example.test", role: "provider_admin", accountStatus: "active", region: "Mumbai" };
const org = { _id: "222222222222222222222222", name: "Fixture Hospital", kind: "hospital" };
async function mock(page, handler = () => null) {
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url());
    const custom = await handler(url.pathname, request);
    if (custom) return route.fulfill(custom);
    let json = { data: [] };
    if (url.pathname === "/api/auth/me") json = { user: provider };
    if (url.pathname === "/api/auth/sessions") json = { sessions: [], providers: { password: true } };
    if (url.pathname === "/api/auth/mfa") json = { enabled: false, required: false, eligible: true };
    if (url.pathname === "/api/providers/mine") json = { data: [org] };
    if (url.pathname === "/api/provider-imports/catalogue") json = { data: { hospital: [{ key: "general_beds", unit: "beds" }, { key: "icu_beds", unit: "beds" }] } };
    return route.fulfill({ json });
  });
}
test("Bootstrap password sign-in clears failed credentials without a second-factor field", async ({ page }) => {
  let submitted;
  await mock(page, async (path, request) => {
    if (path === "/api/auth/login") { submitted = request.postDataJSON(); return { status: 401, json: { error: "Invalid email or password" } }; }
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Password", { exact: true }).fill("ControlledFixturePass_123!");
  await expect(page.getByLabel("Authenticator code", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  expect(submitted.code).toBeUndefined();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("ControlledFixture");
});
test("Bootstrap profile keeps password and session controls without MFA enrollment", async ({ page }) => {
  let mfaReads = 0;
  await mock(page, path => { if (path.startsWith("/api/auth/mfa")) { mfaReads++; return { json: { enabled: false, required: false, eligible: false } }; } });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Profile & security", exact: true })).toBeVisible();
  await expect(page.locator("#multi-factor-authentication")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Active sessions", exact: true })).toBeVisible();
  expect(mfaReads).toBe(0);
});
test("Bootstrap inventory preserves unknowns and conflicted edits; CSV needs reviewed attestation", async ({ page }) => {
  let input, confirmation;
  const observedAt = new Date(Date.now() - 60000).toISOString();
  const stage = { id: "333333333333333333333333", digest: "fixture-digest", status: "preview", attempts: 0, expiresAt: new Date(Date.now() + 600000).toISOString(), rows: [{ resourceKey: "general_beds", input: { unit: "beds", capacity: 50, occupied: 10, blocked: 0, held: 0, observedAt, expectedVersion: 2 } }] };
  await mock(page, (path, request) => {
    if (path.endsWith("/history")) return { json: { data: [{ _id: "observation", version: 2, observedAt, classification: "provider_confirmed", snapshot: { capacity: 50, occupied: null, blocked: 0, held: 0, available: null, observedAt } }] } };
    if (path === `/api/inventory/hospital/${org._id}`) return { json: { data: [{ resourceKey: "general_beds", unit: "beds", version: 2, available: null, observedAt, freshness: "recent", classification: "provider_confirmed" }] } };
    if (request.method() === "PUT") { input = request.postDataJSON(); return { status: 409, json: { error: "Inventory changed", code: "INVENTORY_CONFLICT" } }; }
    if (path.endsWith("/preview")) return { json: stage };
    if (path.endsWith("/confirm")) { confirmation = request.postDataJSON(); return { json: { ...stage, status: "partial", rows: [{ ...stage.rows[0], state: "conflict", errorCode: "INVENTORY_CONFLICT" }] } }; }
  });
  await page.goto("/provider/inventory");
  await expect(page.getByLabel("Operational capacity", { exact: true })).toHaveValue("50");
  await expect(page.getByLabel("occupied", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("blocked", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Save observed counts", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your entries are preserved" })).toBeVisible();
  expect(input.occupied).toBeNull(); expect(input.blocked).toBe(0); expect(input.expectedVersion).toBe(2);
  await expect(page.getByLabel("Operational capacity", { exact: true })).toHaveValue("50");
  await expect(page.getByRole("button", { name: "Save observed counts", exact: true })).toBeDisabled();
  await page.getByLabel("Inventory CSV", { exact: true }).fill("resourceKey,unit,capacity,occupied,blocked,held,observedAt,expectedVersion\ngeneral_beds,beds,50,10,0,0," + observedAt + ",2");
  await page.getByRole("button", { name: "Validate and preview CSV" }).click();
  const confirm = page.getByRole("button", { name: "Confirm reviewed import" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("These are actual provider-observed values, not invented or demo capacities.", { exact: true }).check();
  await page.getByLabel("I reviewed this exact preview and its digest for Fixture Hospital.", { exact: true }).check();
  await confirm.click();
  await expect(page.getByRole("heading", { name: "Import preview · partial" })).toBeVisible();
  expect(confirmation).toEqual({ digest: "fixture-digest", attestProviderObserved: true });
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1); await page.screenshot({ path: `/tmp/medreach-provider-inventory-${width}.png`, fullPage: true }); }
});
