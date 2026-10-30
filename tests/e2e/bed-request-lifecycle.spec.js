import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";

const API = process.env.MEDREACH_HOME_TEST_API_URL || "http://localhost:4000";
const PASSWORD = "E2E_SafePassword_123!";
const execute = promisify(execFile);
test.setTimeout(100_000);
// Each isolated journey has its own client IP behind the configured proxy.
// Production rate limits remain enabled; the suite must not consume one shared
// loopback budget across unrelated patients and all three variants.
function clientHeaders(key) {
  const bytes = createHash("sha256").update(key).digest();
  return { "X-Forwarded-For": `198.18.${bytes[0]}.${bytes[1]}` };
}
test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders(clientHeaders(`${testInfo.project.name}:${testInfo.title}`));
});

function runtimeGuard(...pages) {
  const errors = [];
  for (const page of pages) {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
      if (/param property was accessed directly|params is now a Promise/i.test(message.text())) errors.push(message.text());
    });
  }
  return () => expect(errors).toEqual([]);
}
async function login(page, email, returnTo) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo}$`));
}
async function submit(page, guest, variant) {
  if (!guest) await login(page, `${variant}.e2e@medreach.test`, "/requests");
  await page.goto(`/requests/new?flow=${guest ? "emergency" : "standard"}`);
  await page.locator("#hospital").selectOption({ label: "MedReach E2E Hospital (Bandra West)" });
  await page.locator("#phone").fill("+91 98765 40808");
  if (guest) await page.locator("#email").fill(`guest.${variant}@medreach.test`);
  await page.getByRole("button", { name: guest ? "Submit Emergency Bed Request" : "Submit Hospital Bed Request" }).click();
  await expect(page).toHaveURL(/\/requests\/[a-f0-9]{24}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^MR-/);
  const reference = await page.getByRole("heading", { level: 1 }).innerText();
  const id = new URL(page.url()).pathname.split("/").at(-1);
  await expect(page.getByRole("heading", { name: "Available to hospital staff", exact: true })).toBeVisible();
  return { reference, id };
}
async function refresh(page, label) {
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
}
async function staffPage(browser, origin) {
  const context = await browser.newContext({ baseURL: origin, extraHTTPHeaders: clientHeaders(randomUUID()) });
  const page = await context.newPage();
  await login(page, `${test.info().project.name}.staff.e2e@medreach.test`, "/hospital");
  return { context, page };
}
async function staffAction(page, reference, label, response) {
  const card = page.getByRole("article", { name: reference, exact: true });
  await expect(card).toBeVisible();
  await card.getByLabel("Message to patient").fill(response);
  await card.getByRole("button", { name: label, exact: true }).click();
  await expect(card.getByRole("status").filter({ hasText: "Response recorded." })).toHaveText("Response recorded. Check email delivery history for delivery status.");
}

for (const guest of [false, true]) {
  test(`${guest ? "mobile guest emergency" : "standard patient"}: staff review, information reply, acceptance and completion`, async ({ page, browser }, testInfo) => {
    if (guest) await page.setViewportSize({ width: 390, height: 844 });
    const clean = runtimeGuard(page);
    const { reference, id } = await submit(page, guest, testInfo.project.name);
    const staff = await staffPage(browser, new URL(page.url()).origin);
    const staffClean = runtimeGuard(staff.page);
    try {
      expect((await staff.page.request.get(`${API}/api/notifications`)).status()).toBe(404);
      await staffAction(staff.page, reference, "Start review", "Review started by the hospital");
      await refresh(page, "Under review");
      await staffAction(staff.page, reference, "Request information", "Please describe mobility requirements");
      await refresh(page, "More information needed");
      await expect(page.getByText("Please describe mobility requirements", { exact: true })).toBeVisible();
      await page.getByLabel("Requested information").fill("Patient needs wheelchair assistance");
      if (guest) {
        await page.getByLabel("Requested information").press("Tab");
        await expect(page.getByRole("button", { name: "Send information", exact: true })).toBeFocused();
        await page.getByRole("button", { name: "Send information", exact: true }).press("Enter");
      } else {
        await page.getByRole("button", { name: "Send information", exact: true }).dblclick();
      }
      await expect(page.getByRole("heading", { name: "Under review", exact: true })).toBeVisible();
      await staff.page.getByRole("button", { name: "Refresh requests", exact: true }).click();
      await expect(staff.page.getByRole("article", { name: reference }).getByText("Patient: Patient needs wheelchair assistance", { exact: true })).toBeVisible();
      await staffAction(staff.page, reference, "Accept request", "Please call reception to confirm next steps");
      await refresh(page, "Accepted by hospital");
      await expect(page.getByRole("link", { name: "Call hospital", exact: true })).toHaveAttribute("href", /^tel:/);
      await expect(page.getByRole("link", { name: "Directions", exact: true })).toHaveAttribute("href", /destination=19\.0596/);
      await staffAction(staff.page, reference, "Complete request", "Coordination completed with the patient");
      await refresh(page, "Completed");
      const timeline = page.getByRole("region", { name: "Request lifecycle" }).locator("ol");
      await expect(timeline.locator("li")).toHaveCount(7);
      await expect(timeline).toContainText("Hospital: Please describe mobility requirements");
      await expect(timeline).toContainText("Patient: Patient needs wheelchair assistance");
      await expect(page.getByRole("button", { name: "Cancel request", exact: true })).toHaveCount(0);
      await expect(page.getByText(/Email delivery disabled/).first()).toBeVisible();
      if (guest) {
        expect((await page.getByRole("button", { name: "Refresh status", exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
        expect((await page.getByRole("link", { name: "Call hospital", exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
        await page.getByRole("button", { name: "Save private tracking link" }).click();
        const privateLink = await page.locator("#private-bed-link").inputValue();
        expect(privateLink).toContain(`#token=`);
        const privateContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
        const privatePage = await privateContext.newPage();
        await privatePage.goto(privateLink);
        await expect(privatePage.getByRole("heading", { name: "Completed", exact: true })).toBeVisible();
        expect(new URL(privatePage.url()).hash).toBe("");
        await privateContext.close();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      }
      clean(); staffClean();
    } finally { await staff.context.close(); }
  });
}

test("hospital rejection and patient cancellation close requests with real timeline and private access", async ({ page, browser }, testInfo) => {
  const clean = runtimeGuard(page);
  const { reference } = await submit(page, true, testInfo.project.name);
  const staff = await staffPage(browser, new URL(page.url()).origin);
  try {
    await staffAction(staff.page, reference, "Reject request", "Please contact another hospital; this request cannot be fulfilled");
    await refresh(page, "Declined by hospital");
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
    const created = await submit(page, true, testInfo.project.name);
    const token = await page.evaluate((id) => sessionStorage.getItem(`medreach:emergency-request-token:${id}`), created.id);
    expect((await page.request.get(`${API}/api/emergency-requests/${created.id}`)).status()).toBe(403);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByRole("region", { name: "Request updates" }).getByRole("alert")).toContainText("Access denied");
    await page.getByLabel("Private tracking token", { exact: true }).fill(token);
    await page.getByRole("button", { name: "Open private request" }).click();
    await expect(page.getByRole("heading", { name: "Available to hospital staff", exact: true })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancel request", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cancelled", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Request lifecycle" }).locator("ol li")).toHaveCount(3);
    clean();
  } finally { await staff.context.close(); }
});

test("staff verifies an unconfirmed response without repeating the write; patient status outage recovers", async ({ page, browser }, testInfo) => {
  const clean = runtimeGuard(page);
  const { reference } = await submit(page, false, testInfo.project.name);
  const staff = await staffPage(browser, new URL(page.url()).origin);
  try {
    const routePattern = `${API}/api/emergency-requests/*`;
    await staff.page.route(routePattern, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fetch();
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Response lost after save. Retry the same action." }) });
      await staff.page.unroute(routePattern);
    });
    const card = staff.page.getByRole("article", { name: reference });
    await card.getByLabel("Message to patient").fill("Review persisted once");
    await card.getByRole("button", { name: "Start review", exact: true }).click();
    await expect(card.getByRole("alert")).toContainText("The action may have completed");
    await expect(card.getByRole("alert")).not.toContainText("Response lost after save");
    await expect(card.getByRole("button", { name: "Start review", exact: true })).toBeDisabled();
    await card.getByRole("button", { name: "Refresh current status", exact: true }).click();
    await expect(card).toContainText("Under review");
    await expect(card.getByRole("button", { name: "Start review", exact: true })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Request information", exact: true })).toBeDisabled();
    await card.getByRole("button", { name: "I checked the current status", exact: true }).click();
    await expect(card.getByRole("button", { name: "Request information", exact: true })).toBeEnabled();
    await refresh(page, "Under review");
    await expect(page.getByRole("region", { name: "Request lifecycle" }).locator("ol li")).toHaveCount(3);
    await page.route(routePattern, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Status service temporarily unavailable" }) }));
    await page.getByRole("button", { name: "Refresh status", exact: true }).click();
    await expect(page.getByRole("region", { name: "Request updates" }).getByRole("alert")).toContainText("Status service temporarily unavailable");
    await expect(page.getByRole("button", { name: "Cancel request" })).toBeDisabled();
    await page.unroute(routePattern);
    await refresh(page, "Under review");
    await expect(page.getByRole("region", { name: "Request updates" }).getByRole("alert")).toHaveCount(0);
    clean();
  } finally { await staff.context.close(); }
});

test("expired guest request shows a closed timeline and recorded email delivery history", async ({ page }, testInfo) => {
  const clean = runtimeGuard(page);
  const { id } = await submit(page, true, testInfo.project.name);
  const uri = process.env.MEDREACH_E2E_MONGO_URI;
  expect(new URL(uri).pathname).toMatch(/e2e/);
  await execute(process.execPath, ["--input-type=module", "-e", `
    import { connectDB, disconnectDB } from './backend/src/config/db.js';
    import { EmergencyRequest } from './backend/src/models/EmergencyRequest.js';
    import { expireEmergencyRequests } from './backend/src/services/emergencyRequestExpiry.js';
    const uri = process.env.MEDREACH_E2E_MONGO_URI;
    if (!new URL(uri).pathname.toLowerCase().includes('e2e')) throw new Error('Isolated database required');
    await connectDB(uri);
    try {
      await EmergencyRequest.updateOne({ _id: process.argv[1] }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      await expireEmergencyRequests();
    } finally { await disconnectDB(); }
  `, id], { env: { ...process.env, NODE_ENV: "test", EMAIL_ENABLED: "false" } });
  await refresh(page, "Expired");
  await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Request lifecycle" }).locator("ol li")).toHaveCount(3);
  await expect(page.getByText(/Email delivery disabled/).first()).toBeVisible();
  clean();
});

test("visible patient tracking automatically refreshes a real staff update", async ({ page, browser }, testInfo) => {
  await page.clock.install();
  const clean = runtimeGuard(page);
  const { id } = await submit(page, true, testInfo.project.name);
  const staff = await staffPage(browser, new URL(page.url()).origin);
  try {
    await page.bringToFront();
    await expect(page.getByRole("button", { name: "Refresh status", exact: true })).toBeEnabled();
    const updated = await staff.page.request.patch(`${API}/api/emergency-requests/${id}`, {
      data: { status: "UNDER_REVIEW", hospitalResponse: "Review started for automatic tracking check" },
    });
    expect(updated.status()).toBe(200);
    await page.clock.fastForward(20_000);
    await expect(page.getByRole("heading", { name: "Under review", exact: true })).toBeVisible();
    await expect(page.getByText("Review started for automatic tracking check", { exact: true })).toBeVisible();
    clean();
  } finally { await staff.context.close(); }
});
