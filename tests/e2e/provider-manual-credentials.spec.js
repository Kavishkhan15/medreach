import { test, expect } from "@playwright/test";

// Browser fixtures only: never mutate the recovered dataset or send email.
const id = "111111111111111111111111", organizationId = "222222222222222222222222";
const email = `admin@isolated-hospital-${organizationId}.example`;
const password = "Aa9!browser-fixture-only-not-a-real-secret";
const account = () => ({ _id: id, name: "Isolated hospital", email, role: "provider_admin", accountStatus: "pending", credentialLabel: "Password status unknown", passwordSet: false, passwordStatus: "Not set", credentialRevision: 0, demoLoginId: true, organizations: [{ _id: "333333333333333333333333", organizationId, name: "Isolated hospital", kind: "hospital", active: true }], notificationEmail: "", notificationsEnabled: false });
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
async function fixtures(page, options = {}) {
  const state = { row: account(), reads: 0, writes: 0, prepare: 0, failRead: false, errors: [] };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/api/**", route => json(route, { data: [] }));
  await page.route("**/api/auth/me", route => json(route, { user: { _id: "555555555555555555555555", name: "Test System Admin", role: options.role || "system_admin", region: "Mumbai" } }));
  await page.route("**/api/admin/provider-approvals/organizations", route => json(route, { data: [{ _id: organizationId, name: "Isolated hospital", kind: "hospital", verificationStatus: "verified" }] }));
  await page.route("**/api/admin/provider-accounts", route => {
    state.reads++;
    return json(route, state.failRead ? { error: "Unavailable" } : { data: options.empty ? [] : [state.row], manualCredentialsEnabled: true }, state.failRead ? 503 : 200);
  });
  await page.route("**/api/admin/provider-accounts/manual-provision", route => { state.prepare++; return json(route, { ok: true, summary: { created: 0, awaitingPassword: 1, needsReview: 0 }, accounts: [state.row] }); });
  await page.route(`**/api/admin/provider-accounts/${id}/credentials`, async route => {
    state.writes++;
    if (options.gate) await options.gate;
    if (options.failure) return json(route, { error: "Unavailable" }, 503);
    state.row = { ...state.row, accountStatus: "active", passwordSet: true, passwordStatus: "Set (secure hash only)", credentialRevision: 1, credentialDelivery: "manual" };
    if (options.refreshFailure) state.failRead = true;
    return json(route, { ok: true, account: state.row, credentials: { accountId: id, email, password } });
  });
  await page.goto("/admin/provider-accounts");
  return state;
}

test("manual credentials reveal, hide and copy only newly generated passwords without persistence", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await fixtures(page);
  await expect(page.getByRole("heading", { name: "Isolated hospital" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show Password", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Copy Credentials", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Generate/Reset Password" }).click();
  const input = page.getByLabel("Newly generated password");
  await expect(input).toHaveAttribute("type", "text");
  // Compare booleans so failures never print a credential value.
  expect(await input.inputValue() === password).toBe(true);
  await page.getByRole("button", { name: "Hide Password", exact: true }).first().click();
  await expect(input).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show Password", exact: true }).first().click();
  await page.getByRole("button", { name: "Copy Credentials", exact: true }).first().click();
  expect(await page.evaluate(async p => (await navigator.clipboard.readText()).includes(p), password)).toBe(true);
  expect(await page.evaluate(p => !JSON.stringify({ ...localStorage, ...sessionStorage }).includes(p), password)).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show Password", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Newly generated password")).toHaveCount(0);
  expect(state.writes).toBe(1); expect(state.errors).toEqual([]);
});

test("generation blocks duplicate clicks and keeps confirmed credentials when refresh fails", async ({ page }) => {
  let resolve; const gate = new Promise(r => { resolve = r; });
  const state = await fixtures(page, { gate, refreshFailure: true });
  const button = page.getByRole("button", { name: "Generate/Reset Password" });
  await button.click(); await expect(button).toBeDisabled();
  await button.evaluate(element => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(state.writes).toBe(1); resolve();
  await expect(page.getByLabel("Newly generated password")).toBeVisible();
  await expect(page.getByText(/New password confirmed.*updated view could not be loaded/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry provider accounts" })).toBeVisible();
  state.failRead = false;
  await page.getByRole("button", { name: "Retry provider accounts" }).click();
  await expect(page.getByRole("heading", { name: "Isolated hospital" })).toBeVisible();
  expect(state.writes).toBe(1); expect(state.errors).toEqual([]);
});

test("uncertain generation offers status verification and never claims a password or email success", async ({ page }) => {
  const state = await fixtures(page, { failure: true });
  await page.getByRole("button", { name: "Generate/Reset Password" }).click();
  await expect(page.getByText(/result could not be confirmed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate/Reset Password" })).toBeDisabled();
  await expect(page.getByLabel("Newly generated password")).toHaveCount(0);
  expect(state.writes).toBe(1); expect(state.errors).toEqual([]);
});

test("existing provider preparation reports exact counts and does not repeatedly request accounts", async ({ page }) => {
  const state = await fixtures(page);
  await page.getByRole("button", { name: "Provision eligible providers" }).click();
  await expect(page.getByText(/Created: 0.*Awaiting password: 1.*Require manual review: 0/)).toBeVisible();
  await expect(page.getByText(/No email was sent/).first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(state.prepare).toBe(1); expect(state.reads).toBeLessThanOrEqual(3); expect(state.writes).toBe(0); expect(state.errors).toEqual([]);
});

test("a genuine empty account result remains distinct from failed reads", async ({ page }) => {
  const state = await fixtures(page, { empty: true });
  await expect(page.getByText("No Provider Admin accounts found.")).toBeVisible();
  await expect(page.getByText("Not provisioned; approval or ownership review may be required")).toBeVisible();
  state.failRead = true; await page.reload();
  await expect(page.getByRole("button", { name: "Retry provider accounts" })).toBeVisible();
  await expect(page.getByText("No Provider Admin accounts found.")).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test("regular users cannot see any credential actions", async ({ page }) => {
  const state = await fixtures(page, { role: "user" });
  await expect(page.getByRole("button", { name: "Generate/Reset Password" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Provision eligible providers" })).toHaveCount(0);
  expect(state.reads).toBe(0); expect(state.writes).toBe(0);
});
