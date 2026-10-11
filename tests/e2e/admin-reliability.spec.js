import { test, expect } from "@playwright/test";

const hospital = { _id: "111111111111111111111111", slug: "admin-test-hospital", name: "Admin test hospital", verificationStatus: "unverified", hospitalType: "Private", facilities: [], lastUpdated: "2026-01-01T00:00:00Z" };
const audit = { _id: "222222222222222222222222", action: "verify", entityType: "Hospital", createdAt: "2026-01-01T00:00:00Z", user: { name: "Reviewer", role: "system_admin" } };
const user = { _id: "333333333333333333333333", name: "Example user", email: "example@medreach.test", role: "user", accountStatus: "active", providers: { password: true } };
const job = { _id: "444444444444444444444444", title: "Nurse role", status: "pending", category: "Nurse", description: "Test listing", hospital: { name: hospital.name } };
const analytics = { hospitals: { total: 23, verified: 12 }, conflicts: { facility: 2, field: 1 }, resources: [], emergencyRequests: [], jobs: [], applications: [] };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// Fixtures are confined to browser network interception. No production records
// or live admin mutations are used by these failure/recovery journeys.
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.__adminErrors = errors;
  await page.route("**/api/auth/me", (route) => json(route, { user: { _id: "555555555555555555555555", name: "Test admin", role: "system_admin", region: "Mumbai" } }));
  await page.route("**/api/auth/refresh", (route) => json(route, { error: "Session expired" }, 401));
  await page.route("**/api/admin/hospitals?**", (route) => json(route, { data: [hospital], total: 1, page: Number(new URL(route.request().url()).searchParams.get("page") || 1), perPage: 50 }));
});
test.afterEach(async ({ page }) => { expect(page.__adminErrors).toEqual([]); });

test("audit distinguishes loading, records, outage, malformed response, retry and genuine empty results", async ({ page }) => {
  const gate = deferred(); let state = "loading";
  await page.route("**/api/admin/audit", async (route) => {
    if (state === "loading") { await gate.promise; return json(route, { data: [audit] }); }
    if (state === "outage") return json(route, { error: "Internal secret stack trace" }, 503);
    if (state === "malformed") return json(route, {});
    return json(route, { data: [] });
  });
  await page.goto("/admin/audit");
  await expect(page.getByText("Loading audit log…", { exact: true })).toBeVisible();
  await expect(page.getByText(/Demo dataset|System Admin|Hospital Admin/)).toHaveCount(0);
  gate.resolve();
  await expect(page.getByRole("cell", { name: "Hospital", exact: true })).toBeVisible();
  state = "outage"; await page.reload();
  await expect(page.getByRole("button", { name: "Retry audit log" })).toBeVisible();
  await expect(page.getByText(/No audit records|Internal secret|Demo dataset/)).toHaveCount(0);
  state = "malformed"; await page.getByRole("button", { name: "Retry audit log" }).click();
  await expect(page.getByText("The service returned an unexpected response. Please retry.")).toBeVisible();
  state = "empty"; await page.getByRole("button", { name: "Retry audit log" }).click();
  await expect(page.getByText("No audit records found.")).toBeVisible();
});

test("overview keeps true totals independent of unavailable freshness and reads every directory page", async ({ page }) => {
  let unavailable = true; const pages = [];
  await page.route("**/api/admin/overview", (route) => json(route, { hospitals: 51, verified: 1, verificationQueue: 50 }));
  await page.route("**/api/admin/hospitals?**", (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get("page")); pages.push(pageNumber);
    if (unavailable) return json(route, { error: "Unavailable" }, 503);
    const rows = Array.from({ length: pageNumber === 1 ? 50 : 1 }, (_, i) => ({ ...hospital, _id: `${pageNumber}-${i}`, name: `Hospital ${pageNumber}-${i}` }));
    return json(route, { data: rows, total: 51, page: pageNumber, perPage: 50 });
  });
  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Hospital totals" }).getByText("51", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry data freshness" })).toBeVisible();
  unavailable = false; await page.getByRole("button", { name: "Retry data freshness" }).click();
  await expect(page.getByRole("region", { name: "Data freshness" }).getByText("51", { exact: true })).toBeVisible();
  expect(pages).toContain(2);
});

for (const [path, label, empty] of [["hospitals", "hospitals", "No hospitals found."], ["verification", "verification queue", "Nothing awaiting verification."]]) {
  test(`${path} never reports empty on failed or malformed reads`, async ({ page }) => {
    let mode = "error";
    await page.route("**/api/admin/hospitals?**", (route) => json(route, mode === "error" ? { error: "Failure" } : mode === "malformed" ? { data: null } : { data: [], total: 0, page: 1, perPage: 50 }, mode === "error" ? 503 : 200));
    await page.goto(`/admin/${path}`);
    await expect(page.getByRole("button", { name: `Retry ${label}` })).toBeVisible();
    await expect(page.getByText(empty, { exact: true })).toHaveCount(0);
    mode = "malformed"; await page.getByRole("button", { name: `Retry ${label}` }).click();
    await expect(page.getByText("The service returned an unexpected response. Please retry.")).toBeVisible();
    mode = "empty"; await page.getByRole("button", { name: `Retry ${label}` }).click();
    await expect(page.getByText(empty, { exact: true })).toBeVisible();
  });
}

test("verification prevents duplicate writes and keeps confirmed success when refresh fails", async ({ page }) => {
  let readsFail = false, writes = 0; const gate = deferred();
  await page.route("**/api/admin/hospitals?**", (route) => json(route, readsFail ? { error: "Failure" } : { data: [hospital], total: 1, page: 1, perPage: 50 }, readsFail ? 503 : 200));
  await page.route("**/api/admin/hospitals/*/verify", async (route) => { writes++; await gate.promise; readsFail = true; return json(route, { hospital: { ...hospital, verificationStatus: "verified" } }); });
  await page.goto("/admin/verification");
  const approve = page.getByRole("button", { name: "Approve", exact: true });
  await approve.click(); await expect(approve).toBeDisabled();
  await approve.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(writes).toBe(1); gate.resolve();
  await expect(page.getByText(/Verification decision confirmed\. The updated view could not be loaded/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry verification queue" })).toBeVisible();
  expect(writes).toBe(1);
});

for (const [status, expected] of [[401, "Your session has expired"], [403, "You do not have permission"], [400, "The submitted information was not accepted"], [409, "The record has changed"]]) {
  test(`admin mutation handles ${status} without exposing server details`, async ({ page }) => {
    await page.route("**/api/admin/users", (route) => json(route, { data: [user] }));
    await page.route("**/api/admin/users/*/revoke-sessions", (route) => json(route, { error: "Secret connection string and stack trace" }, status));
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Revoke sessions" }).click();
    await expect(page.getByText(new RegExp(expected))).toBeVisible();
    await expect(page.getByText(/Secret connection|string and stack|Session revocation confirmed/)).toHaveCount(0);
  });
}

test("users has loading, unavailable and empty states and blocks unconfirmed mutation resubmission", async ({ page }) => {
  const gate = deferred(); let mode = "loading", writes = 0;
  await page.route("**/api/admin/users", async (route) => {
    if (mode === "loading") { await gate.promise; return json(route, { data: [user] }); }
    return json(route, mode === "error" ? {} : { data: [] }, mode === "error" ? 503 : 200);
  });
  await page.route("**/api/admin/users/*/trigger-reset", (route) => { writes++; return route.abort("failed"); });
  await page.goto("/admin/users");
  await expect(page.getByText("Loading users…", { exact: true })).toBeVisible();
  await expect(page.getByText("No users found.")).toHaveCount(0); gate.resolve();
  await page.getByRole("button", { name: "Send reset" }).click();
  await expect(page.getByText(/The action may have completed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset" })).toBeDisabled();
  expect(writes).toBe(1);
  mode = "error"; await page.getByRole("button", { name: "Refresh current status" }).click();
  await expect(page.getByRole("button", { name: "Retry users" })).toBeVisible();
  await expect(page.getByText("No users found.")).toHaveCount(0);
  mode = "empty"; await page.getByRole("button", { name: "Retry users" }).click();
  await expect(page.getByText("No users found.")).toBeVisible();
});

test("security panels recover independently and never report no events during an outage", async ({ page }) => {
  let auditFails = true, emails = 0;
  await page.route("**/api/email/status", (route) => { emails++; return json(route, { configured: false, mode: "disabled" }); });
  await page.route("**/api/admin/audit", (route) => json(route, auditFails ? {} : { data: [] }, auditFails ? 503 : 200));
  await page.goto("/admin/security");
  await expect(page.getByText("disabled · not configured")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry authentication events" })).toBeVisible();
  await expect(page.getByText("No recent authentication events.")).toHaveCount(0);
  auditFails = false; await page.getByRole("button", { name: "Retry authentication events" }).click();
  await expect(page.getByText("No recent authentication events.")).toBeVisible();
  expect(emails).toBe(1);
});

const operationPanels = [
  ["/api/admin/provider-accounts", "provider accounts", { data: [] }],
  ["/api/analytics/overview", "analytics", analytics],
  ["/api/admin/ownership-claims", "ownership requests", { data: [] }],
  ["/api/jobs/manage", "job moderation", { data: [job] }],
  ["/api/emergency-requests", "request outcomes", { data: [] }],
  ["/api/admin/refinement/status", "refinement configuration", { configured: false }],
  ["/api/admin/facility-claims", "source evidence", { data: [] }],
  ["/api/admin/refinement/candidates", "refinement suggestions", { data: [] }],
];
async function mockOperations(page, failedPath, counts = {}) {
  let failing = true;
  for (const [path, , body] of operationPanels) await page.route(`**${path}`, (route) => {
    counts[path] = (counts[path] || 0) + 1;
    return json(route, failing && path === failedPath ? {} : body, failing && path === failedPath ? 503 : 200);
  });
  return () => { failing = false; };
}
for (const [path, label] of operationPanels) {
  test(`Operations isolates ${label} failures and retries only that resource`, async ({ page }) => {
    const counts = {}; const recover = await mockOperations(page, path, counts);
    await page.goto("/admin/operations");
    await expect(page.getByRole("button", { name: `Retry ${label}`, exact: true })).toBeVisible();
    if (label !== "analytics") await expect(page.getByRole("region", { name: "Operational analytics" }).getByText("23", { exact: true })).toBeVisible();
    if (label !== "job moderation") await expect(page.getByText("Nurse role", { exact: true })).toBeVisible();
    await expect.poll(() => Object.keys(counts).length).toBe(operationPanels.length);
    await page.waitForTimeout(1200);
    for (const [panel] of operationPanels) expect(counts[panel]).toBe(1);
    const before = { ...counts };
    recover(); await page.getByRole("button", { name: `Retry ${label}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Retry ${label}`, exact: true })).toHaveCount(0);
    for (const [other] of operationPanels) expect(counts[other]).toBe(before[other] + (other === path ? 1 : 0));
  });
}

test("provider creation confirms its response and prevents duplicate submits", async ({ page }) => {
  await mockOperations(page, "none"); const gate = deferred(); let writes = 0;
  await page.route("**/api/admin/resources", async (route) => { writes++; await gate.promise; return json(route, { data: { _id: "provider", name: "Test provider", kind: "blood_bank" } }); });
  await page.goto("/admin/operations");
  await page.getByLabel("Provider name", { exact: true }).fill("Test provider");
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add provider", exact: true })).toBeDisabled();
  await page.locator("form").evaluate((form) => form.requestSubmit()); expect(writes).toBe(1);
  gate.resolve(); await expect(page.getByText("Provider creation confirmed.", { exact: true })).toBeVisible();
});

test("workspace assignment failures do not masquerade as no hospitals and independent access history survives", async ({ page }) => {
  let failed = true;
  await page.route("**/api/hospital-admin/hospitals", (route) => json(route, failed ? {} : { data: [] }, failed ? 503 : 200));
  await page.route("**/api/hospital-admin/ownership-claims", (route) => json(route, { data: [] }));
  await page.goto("/hospital");
  await expect(page.getByRole("button", { name: "Retry assigned hospitals" })).toBeVisible();
  await expect(page.getByText("No hospital assigned yet. Request access below.")).toHaveCount(0);
  await expect(page.getByText("No access requests submitted.")).toBeVisible();
  failed = false; await page.getByRole("button", { name: "Retry assigned hospitals" }).click();
  await expect(page.getByText("No hospital assigned yet. Request access below.")).toBeVisible();
});

test("workspace evidence and availability outages retain working contact actions", async ({ page }) => {
  let fail = true;
  await page.route("**/api/hospital-admin/hospitals", (route) => json(route, { data: [hospital] }));
  await page.route("**/api/hospital-admin/ownership-claims", (route) => json(route, { data: [] }));
  await page.route("**/api/emergency-requests", (route) => json(route, { data: [] }));
  await page.route("**/api/hospital-admin/hospitals/*/facility-claims", (route) => json(route, fail ? {} : { data: [] }, fail ? 503 : 200));
  await page.route("**/api/hospitals/*/availability", (route) => json(route, fail ? { latest: null } : { latest: [], observations: 0 }));
  await page.goto("/hospital");
  await expect(page.getByRole("button", { name: "Save verified contact" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry facility evidence" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry recorded availability" })).toBeVisible();
  await expect(page.getByText("No facility evidence recorded.")).toHaveCount(0);
  fail = false; await page.getByRole("button", { name: "Retry facility evidence" }).click();
  await page.getByRole("button", { name: "Retry recorded availability" }).click();
  await expect(page.getByText("No facility evidence recorded.")).toBeVisible();
  await expect(page.getByText("No availability observations recorded.")).toBeVisible();
});

test("hospital careers applicant failures and rapid selection cannot show the wrong applicants", async ({ page }) => {
  const second = { ...job, _id: "666666666666666666666666", title: "Second role" };
  await page.route("**/api/hospital-admin/hospitals", (route) => json(route, { data: [hospital] }));
  await page.route("**/api/jobs/manage", (route) => json(route, { data: [job, second] }));
  const gate = deferred(); let fail = true;
  await page.route(`**/api/jobs/${job._id}/applications`, async (route) => { await gate.promise; await json(route, { data: [{ _id: "old", status: "submitted", candidateName: "Old applicant" }] }).catch(() => {}); });
  await page.route(`**/api/jobs/${second._id}/applications`, (route) => json(route, fail ? {} : { data: [] }, fail ? 503 : 200));
  await page.goto("/hospital/jobs");
  await page.getByRole("button", { name: "Review Applicants" }).nth(0).click();
  await expect(page.getByText("Loading applicants…")).toBeVisible();
  await page.getByRole("button", { name: "Review Applicants" }).click();
  await expect(page.getByRole("button", { name: "Retry applicants" })).toBeVisible();
  gate.resolve(); await expect(page.getByText("Old applicant")).toHaveCount(0);
  await expect(page.getByText("No candidates have applied for this listing yet.")).toHaveCount(0);
  fail = false; await page.getByRole("button", { name: "Retry applicants" }).click();
  await expect(page.getByText("No candidates have applied for this listing yet.")).toBeVisible();
});

test("unauthorized roles do not fetch protected admin resources", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/auth/me", (route) => json(route, { user: { _id: "user", name: "User", role: "user", region: "Mumbai" } }));
  await page.route("**/api/admin/users", (route) => { reads++; return json(route, { data: [] }); });
  await page.goto("/admin/users");
  await expect(page.getByText(/Admin access required/)).toBeVisible();
  expect(reads).toBe(0);
});

test("every Operations panel distinguishes loading, malformed responses and real empty responses", async ({ page }) => {
  const gate = deferred(); let mode = "loading";
  for (const [path, , body] of operationPanels) await page.route(`**${path}`, async (route) => {
    if (mode === "loading") { await gate.promise; return json(route, {}); }
    const empty = path === "/api/analytics/overview" ? { ...analytics, hospitals: { total: 0, verified: 0 }, conflicts: { facility: 0, field: 0 } }
      : path === "/api/admin/refinement/status" ? body : { data: [] };
    return json(route, empty);
  });
  await page.goto("/admin/operations");
  for (const [, label] of operationPanels) await expect(page.getByText(`Loading ${label}…`, { exact: true })).toBeVisible();
  await expect(page.getByText("No pending jobs.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Operational analytics" }).getByText("0", { exact: true })).toHaveCount(0);
  gate.resolve();
  for (const [, label] of operationPanels) await expect(page.getByRole("button", { name: `Retry ${label}`, exact: true })).toBeVisible();
  await expect(page.getByText("The service returned an unexpected response. Please retry.", { exact: true })).toHaveCount(8);
  mode = "empty";
  for (const [, label] of operationPanels) await page.getByRole("button", { name: `Retry ${label}`, exact: true }).click();
  for (const message of ["No pending requests.", "No pending jobs.", "No requests yet.", "No source excerpts available.", "No refinement suggestions."]) await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Operational analytics" }).getByText("0", { exact: true })).toHaveCount(4);
});

test("unconfirmed applicant review refreshes applicants before the admin enables further changes", async ({ page }) => {
  const applicant = { _id: "applicant", candidateName: "Review candidate", status: "submitted" };
  let reviewed = false, jobsRead = 0, applicationsRead = 0;
  await page.route("**/api/hospital-admin/hospitals", (route) => json(route, { data: [hospital] }));
  await page.route("**/api/jobs/manage", (route) => { jobsRead++; return json(route, { data: [job] }); });
  await page.route(`**/api/jobs/${job._id}/applications`, (route) => { applicationsRead++; return json(route, { data: [{ ...applicant, status: reviewed ? "shortlisted" : "submitted" }] }); });
  await page.route("**/api/applications/applicant", (route) => { reviewed = true; return json(route, { error: "Private server details" }, 503); });
  await page.goto("/hospital/jobs");
  await page.getByRole("button", { name: "Review Applicants", exact: true }).click();
  await page.getByRole("button", { name: "Shortlisted", exact: true }).click();
  await expect(page.getByText(/The action may have completed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Under Review", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Refresh current status", exact: true }).click();
  await expect(page.getByRole("button", { name: "Shortlisted", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(jobsRead).toBe(1);
  expect(applicationsRead).toBe(2);
  await page.getByRole("button", { name: "I checked the current status", exact: true }).click();
  await expect(page.getByRole("button", { name: "Under Review", exact: true })).toBeEnabled();
});

test("a stalled authentication refresh cannot leave an admin panel loading forever", async ({ page }) => {
  await page.clock.install();
  const gate = deferred(); let stalled = true, refreshStarted = false;
  await page.route("**/api/admin/audit", (route) => json(route, stalled ? {} : { data: [] }, stalled ? 401 : 200));
  await page.route("**/api/auth/refresh", async (route) => { refreshStarted = true; await gate.promise; return json(route, {}, 401); });
  await page.goto("/admin/audit");
  await expect(page.getByText("Loading audit log…", { exact: true })).toBeVisible();
  await expect.poll(() => refreshStarted).toBe(true);
  await page.clock.fastForward(20001);
  await expect(page.getByRole("button", { name: "Retry audit log", exact: true })).toBeVisible();
  await expect(page.getByText("No audit records found.", { exact: true })).toHaveCount(0);
  stalled = false; gate.resolve();
  await page.getByRole("button", { name: "Retry audit log", exact: true }).click();
  await expect(page.getByText("No audit records found.", { exact: true })).toBeVisible();
});

test("malformed bed-request assignments show a retryable error instead of no assigned requests", async ({ page }) => {
  let malformed = true;
  await page.route("**/api/hospital-admin/hospitals", (route) => json(route, { data: [hospital] }));
  await page.route("**/api/hospital-admin/ownership-claims", (route) => json(route, { data: [] }));
  await page.route("**/api/hospital-admin/hospitals/*/facility-claims", (route) => json(route, { data: [] }));
  await page.route("**/api/hospitals/*/availability", (route) => json(route, { latest: [], observations: 0 }));
  await page.route("**/api/emergency-requests", (route) => json(route, { data: malformed ? [{ _id: "request", requestId: "MR-TEST", status: "SENT", timeline: [], expiresAt: "2026-10-12T00:00:00Z", hospital: {} }] : [] }));
  await page.goto("/hospital");
  await expect(page.getByRole("button", { name: "Retry bed requests", exact: true })).toBeVisible();
  await expect(page.getByText("No requests assigned.", { exact: true })).toHaveCount(0);
  malformed = false;
  await page.getByRole("button", { name: "Retry bed requests", exact: true }).click();
  await expect(page.getByText("No requests assigned.", { exact: true })).toBeVisible();
});


test("protected hospital views include pending and rejected records without public dead links", async ({ page }) => {
  const rows = [{ ...hospital, _id: "pending", name: "Pending admin hospital", approvalStatus: "pending" }, { ...hospital, _id: "rejected", name: "Rejected admin hospital", approvalStatus: "rejected" }];
  await page.route("**/api/admin/hospitals?**", (route) => json(route, { data: rows, total: 2, page: 1, perPage: 50 }));
  await page.goto("/admin/hospitals");
  for (const status of ["pending", "rejected"]) {
    const row = page.getByRole("row").filter({ hasText: `${status[0].toUpperCase() + status.slice(1)} admin hospital` });
    await expect(row.getByText(`Unpublished · ${status}`, { exact: true })).toBeVisible();
    await expect(row.getByRole("link", { name: "View" })).toHaveCount(0);
  }
  await page.goto("/admin/verification");
  await expect(page.getByText("Pending admin hospital", { exact: true })).toBeVisible();
  await expect(page.getByText("Rejected admin hospital", { exact: true })).toHaveCount(0);
});
