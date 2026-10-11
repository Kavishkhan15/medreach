import { test, expect } from "@playwright/test";
const API = process.env.MEDREACH_HOME_TEST_API_URL || "http://localhost:4000";

test.beforeEach(async ({ context }, testInfo) => {
  const variant = ["bootstrap", "tailwind", "skeleton"].indexOf(testInfo.project.name) + 1;
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.21.${variant}.1` });
});

test("frontend pages enforce framing and MIME protections without blocking their content", async ({ page }) => {
  for (const path of ["/", "/login", "/track"]) {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    await expect(page.locator("#main")).toBeVisible();
  }
});

test("staff cannot open unsafe legacy resume links while PDF downloads remain available", async ({ page }) => {
  await page.goto("/login?returnTo=%2Fhospital%2Fjobs");
  await page.locator("#email").fill("staff.e2e@medreach.test");
  await page.locator("#password").fill("E2E_SafePassword_123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/hospital\/jobs$/);
  const jobId = "507f1f77bcf86cd799439011";
  // These are explicit legacy security fixtures, never persisted as live provider data.
  await page.route(`${API}/api/jobs/manage`, (route) => route.fulfill({ json: { data: [{
    _id: jobId, title: "Resume security fixture", status: "published", category: "Nurse", employmentType: "full_time",
    hospital: { name: "Test hospital" },
  }] } }));
  await page.route(`${API}/api/jobs/${jobId}/applications`, (route) => route.fulfill({ json: { data: [
    { _id: "507f1f77bcf86cd799439012", candidateName: "Unsafe legacy document", status: "submitted", resume: { fileUrl: "data:text/html;base64,PHNjcmlwdD4=", fileName: "unsafe.html" } },
    { _id: "507f1f77bcf86cd799439013", candidateName: "Valid PDF document", status: "submitted", resume: { fileUrl: "data:application/pdf;base64,JVBERi0xLjQK", fileName: "cv.pdf" } },
  ] } }));
  await page.reload();
  await page.getByRole("button", { name: "Review Applicants", exact: true }).click();
  await expect(page.getByText("Unsafe legacy document", { exact: true })).toBeVisible();
  await expect(page.locator('a[href^="data:text/html"]')).toHaveCount(0);
  await expect(page.locator('a[href^="data:application/pdf"]')).toHaveCount(1);
});
