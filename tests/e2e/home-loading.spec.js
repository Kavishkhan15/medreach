import { test, expect } from "@playwright/test";

test("directory results remain usable while jobs are unavailable; retries only reload jobs", async ({ page }) => {
  const calls = {};
  let failJobs = true;
  await page.route(url => url.hostname === "localhost" && url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    calls[path] = (calls[path] || 0) + 1;
    if (path === "/api/jobs") return route.fulfill({ status: failJobs ? 503 : 200,
      json: failJobs ? { error: "Controlled job outage" } : { data: [] } });
    return route.continue();
  });
  await page.goto("/");
  await expect(page.locator("article[data-provider-id]").first()).toBeVisible();
  expect(calls["/api/jobs"] || 0).toBe(0);
  await page.locator("#careers").scrollIntoViewIfNeeded();
  const retry = page.getByRole("button", { name: "Retry jobs", exact: true });
  await expect(retry).toBeVisible();
  const before = { ...calls };
  failJobs = false;
  await retry.click();
  await expect(page.getByText("No healthcare jobs are currently listed.", { exact: true })).toBeVisible();
  expect(calls["/api/jobs"]).toBe(before["/api/jobs"] + 1);
  for (const path of ["/api/hospitals", "/api/blood-banks", "/api/diagnostics", "/api/ambulances"]) {
    expect(calls[path]).toBe(before[path]);
  }
});

test("a slow directory category does not conceal other successful categories", async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(url => url.hostname === "localhost" && url.pathname === "/api/ambulances", async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/");
    const directory = page.getByRole("complementary", { name: "Healthcare directory" });
    await expect(directory.getByRole("button", { name: /MedReach E2E Blood Bank/ })).toBeVisible();
  } finally { release(); }
});
