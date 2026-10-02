import { expect, test } from "@playwright/test";

const TITLE = "MedReach Healthcare Assistant";
const panelFor = page => page.getByRole("dialog", { name: TITLE, exact: true });
const inputFor = page => page.getByRole("textbox", { name: `Message ${TITLE}` });

async function openAssistant(page) {
  await page.goto("/");
  await page.locator('button[aria-haspopup="dialog"]').filter({ hasText: "SOS" }).click();
  await page.getByRole("dialog", { name: "Emergency help" }).getByRole("button", { name: /MedReach Healthcare Assistant/ }).click();
  await expect(panelFor(page)).toBeVisible();
}

async function ask(page, question, enter = false) {
  const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/assistant/message") && response.request().method() === "POST");
  await inputFor(page).fill(question);
  if (enter) await inputFor(page).press("Enter");
  else await panelFor(page).getByRole("button", { name: "Send", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().message).toBe(question);
  await expect(inputFor(page)).toBeEnabled();
  return response.json();
}

function runtimeGuard(page, allowNetworkFailure = false) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (!["error", "warning"].includes(message.type())) return;
    // Guest session probes legitimately return 401; retain all other console failures.
    if (/\/api\/auth\/(me|refresh)$/.test(message.location().url) && /status of 401/.test(message.text())) return;
    if (allowNetworkFailure && /\/api\/assistant\/message$/.test(message.location().url) && /Failed to load resource: net::ERR_FAILED/.test(message.text())) return;
    errors.push(message.text());
  });
  return () => expect(errors).toEqual([]);
}

async function openOptions(page) {
  const summary = panelFor(page).getByText("Conversation options", { exact: true });
  if (await summary.locator("..").getAttribute("open") === null) await summary.click();
}

test.beforeEach(async ({ context }, testInfo) => {
  // Separate controlled test clients so the real assistant limiter stays enabled.
  const variant = ["bootstrap", "tailwind", "skeleton"].indexOf(testInfo.project.name) + 1;
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.19.${process.pid % 200 + 3}.${variant}` });
});

test("assistant has opaque fixed chrome and fits desktop and mobile without covering SOS", async ({ page }, testInfo) => {
  const clean = runtimeGuard(page);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await openAssistant(page);
    const panel = panelFor(page);
    const header = panel.locator("header");
    const footer = panel.locator("footer");
    const box = await panel.boundingBox();
    const headerBox = await header.boundingBox();
    const footerBox = await footer.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(headerBox.height).toBeGreaterThanOrEqual(68);
    expect(headerBox.height).toBeLessThanOrEqual(72);
    expect(await header.evaluate(node => getComputedStyle(node).backgroundColor)).toBe("rgb(255, 255, 255)");
    expect(await header.evaluate(node => {
      const r = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + 10));
    })).toBe(true);
    expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await header.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(box.y + box.height + 1);
    await expect(header.getByText("Mumbai Care Network", { exact: true })).toBeVisible();
    await expect(header.getByText("Online", { exact: true })).toBeVisible();
    await expect(header.getByRole("button")).toHaveCount(2);
    await expect(panel.getByRole("button", { name: "Emergency Care", exact: true })).toBeHidden();
    await expect(panel.getByRole("link", { name: "Browse All Mumbai Hospitals", exact: true })).toHaveAttribute("href", "/hospitals");
    await expect(panel.getByRole("link", { name: "Open Interactive Care Map", exact: true })).toHaveAttribute("href", "/map");
    const sos = page.locator('button[aria-haspopup="dialog"]').filter({ hasText: "SOS" });
    expect(await sos.evaluate(node => {
      const r = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`assistant-${viewport.width}.png`) });
    await sos.click();
    const emergency = page.getByRole("dialog", { name: "Emergency help" });
    const call = emergency.getByRole("link", { name: "Call 112 (Emergency)", exact: true });
    await expect(call).toBeVisible();
    expect(await call.evaluate(node => {
      const r = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })).toBe(true);
    await emergency.getByRole("button", { name: "Close", exact: true }).click();
    await header.getByRole("button", { name: "Minimize Assistant" }).click();
    await expect(inputFor(page)).toHaveCount(0);
    await header.getByRole("button", { name: "Restore Assistant" }).click();
    await expect(inputFor(page)).toBeVisible();
    await header.getByRole("button", { name: "Close Assistant" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open MedReach Healthcare Assistant", exact: true })).toHaveCount(0);
  }
  clean();
});

test("real hospital responses retain call, directions, bed, details and follow-up actions", async ({ page }, testInfo) => {
  const clean = runtimeGuard(page);
  await openAssistant(page);
  const reply = await ask(page, "Find hospitals", true);
  expect(reply.hospitals.length).toBeGreaterThan(0);
  const hospital = reply.hospitals[0];
  const results = panelFor(page).getByRole("region", { name: "Hospital matches", exact: true });
  await expect(results.getByRole("heading", { name: hospital.name })).toBeVisible();
  await expect(results.getByRole("link", { name: "Call", exact: true })).toHaveAttribute("href", `tel:${hospital.phone}`);
  await expect(results.getByRole("link", { name: "Directions", exact: true })).toHaveAttribute("href", `https://www.google.com/maps/dir/?api=1&destination=${hospital.coordinates[1]},${hospital.coordinates[0]}`);
  await expect(results.getByRole("link", { name: "Bed Request", exact: true })).toHaveAttribute("href", `/requests/new?hospital=${hospital.id}&flow=standard`);
  await expect(results.getByRole("link", { name: "Details ›", exact: true })).toHaveAttribute("href", `/hospitals/${hospital.slug}`);
  await page.screenshot({ path: testInfo.outputPath("assistant-hospital-result.png") });
  await panelFor(page).getByText("More ways to ask", { exact: true }).click();
  await expect(panelFor(page).getByRole("button", { name: "Emergency Care", exact: true })).toBeVisible();
  const followup = reply.suggestedPrompts[0];
  const nextResponse = page.waitForResponse(response => response.url().endsWith("/api/assistant/message") && response.status() === 200);
  await panelFor(page).getByRole("button", { name: followup, exact: true }).click();
  expect((await nextResponse).request().postDataJSON().message).toBe(followup);
  await expect(inputFor(page)).toBeEnabled();
  const body = panelFor(page).getByRole("log", { name: "Conversation" });
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const headerBefore = await panelFor(page).locator("header").boundingBox();
  const footerBefore = await panelFor(page).locator("footer").boundingBox();
  await body.evaluate(node => { node.scrollTop = 0; });
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(await panelFor(page).locator("header").boundingBox()).toEqual(headerBefore);
  expect(await panelFor(page).locator("footer").boundingBox()).toEqual(footerBefore);
  await results.getByRole("link", { name: "Details ›", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/hospitals/${hospital.slug}$`));
  clean();
});

test("blood, ambulance, diagnostics and career result actions remain available", async ({ page }) => {
  const clean = runtimeGuard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openAssistant(page);
  const blood = await ask(page, "Find blood banks");
  expect(blood.bloodBanks.length).toBeGreaterThan(0);
  await panelFor(page).getByRole("region", { name: "Blood banks", exact: true }).getByRole("button", { name: "Request Units", exact: true }).click();
  await expect(panelFor(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(panelFor(page)).toBeVisible();
  await expect(panelFor(page).getByRole("button", { name: "Request Units", exact: true })).toBeFocused();
  const ambulance = await ask(page, "Find ambulances");
  expect(ambulance.ambulances.length).toBeGreaterThan(0);
  await panelFor(page).getByRole("region", { name: "Ambulance providers", exact: true }).getByRole("button", { name: "Book Ambulance", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Book Ambulance/ })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panelFor(page)).toBeVisible();
  await expect(panelFor(page).getByRole("button", { name: "Book Ambulance", exact: true })).toBeFocused();
  const diagnostics = await ask(page, "Find diagnostics");
  expect(diagnostics.diagnostics.length).toBeGreaterThan(0);
  await expect(panelFor(page).getByRole("region", { name: "Diagnostics", exact: true }).getByRole("link", { name: "Directory ›", exact: true })).toHaveAttribute("href", "/diagnostics");
  const career = await ask(page, "Find jobs");
  expect(career.jobs.length).toBeGreaterThan(0);
  const apply = panelFor(page).getByRole("region", { name: "Healthcare jobs", exact: true }).getByRole("link", { name: "View & Apply", exact: true });
  await expect(apply).toHaveAttribute("href", `/jobs/${career.jobs[0].id}`);
  await apply.click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${career.jobs[0].id}$`));
  clean();
});

test("outage recovery, location selection, conversation reset and minimized history still work", async ({ page }) => {
  const clean = runtimeGuard(page, true);
  await openAssistant(page);
  await openOptions(page);
  await panelFor(page).getByRole("combobox", { name: "Mumbai locality" }).selectOption("Andheri");
  const response = await ask(page, "Find hospitals");
  expect(response.locality).toBe("Andheri");
  await panelFor(page).getByRole("button", { name: "Minimize Assistant" }).click();
  await panelFor(page).getByRole("button", { name: "Restore Assistant" }).click();
  await expect(panelFor(page).getByText(response.reply, { exact: true })).toBeVisible();
  await page.route("**/api/assistant/message", route => route.abort("failed"));
  await inputFor(page).fill("Find hospitals");
  await panelFor(page).getByRole("button", { name: "Send", exact: true }).click();
  await expect(panelFor(page).getByText(/AI assistant is temporarily unavailable/)).toBeVisible();
  await expect(panelFor(page).locator("header").getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(panelFor(page).getByRole("link", { name: "Call 112 (Emergency)", exact: true })).toHaveAttribute("href", "tel:112");
  await expect(inputFor(page)).toBeEnabled();
  await openOptions(page);
  await panelFor(page).getByRole("button", { name: "Clear chat", exact: true }).click();
  await expect(panelFor(page).getByText("How can I help you today?", { exact: true })).toBeVisible();
  await page.unroute("**/api/assistant/message");
  await openOptions(page);
  await panelFor(page).getByRole("combobox", { name: "Mumbai locality" }).selectOption("Bandra");
  await ask(page, "Find diagnostics");
  await expect(panelFor(page).getByRole("region", { name: "Diagnostics", exact: true })).toBeVisible();
  await inputFor(page).press("Escape");
  await expect(panelFor(page)).toHaveCount(0);
  clean();
});
