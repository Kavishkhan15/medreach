import { test, expect } from "@playwright/test";

const hospital = { _id: "111111111111111111111111", slug: "admin-test-hospital", name: "Admin test hospital", verificationStatus: "unverified", hospitalType: "Private", facilities: [], lastUpdated: "2026-01-01T00:00:00Z" };
const job = { _id: "777777777777777777777777", title: "Test clinical role", hospital: { ...hospital }, organizationName: hospital.name, category: "Nurse", status: "published", employmentType: "full_time" };
const audit = { _id: "222222222222222222222222", action: "verify", entityType: "Hospital", createdAt: "2026-01-01T00:00:00Z", user: { name: "Reviewer", role: "system_admin" } };
const user = { _id: "333333333333333333333333", name: "Example user", email: "example@medreach.test", role: "user", accountStatus: "active", providers: { password: true } };


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
  await expect(page.locator(".admin-page-body").getByText(/Demo dataset|System Admin|Hospital Admin/)).toHaveCount(0);
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

test("overview keeps true totals without fetching retired scraping freshness panels", async ({ page }) => {
  let directoryReads = 0;
  await page.route("**/api/admin/overview", (route) => json(route, { hospitals: 51, verified: 1, verificationQueue: 50 }));
  await page.route("**/api/admin/hospitals?**", (route) => { directoryReads++; return json(route, { error: "Unavailable" }, 503); });
  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Hospital totals" }).getByText("51", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Data freshness" })).toHaveCount(0);
  await expect(page.getByText("Verified hospitals", { exact: true })).toHaveCount(0);
  expect(directoryReads).toBe(0);
});

for (const [path, label, empty] of [["hospitals", "hospitals", "No hospitals found."], ["verification", "hospitals", "No hospitals found."]]) {
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

test("provider approvals prevent duplicate writes and keep confirmed success when refresh fails", async ({ page }) => {
  let readsFail = false, writes = 0; const gate = deferred();
  const submission = { _id: "666666666666666666666666", name: "Provider application", kind: "hospital", status: "pending", contactEmail: "controlled@example.com", address: "Test street" };
  await page.route("**/api/admin/provider-approvals", (route) => json(route, readsFail ? { error: "Failure" } : { data: [submission] }, readsFail ? 503 : 200));
  await page.route("**/api/admin/provider-approvals/*/review", async (route) => { writes++; await gate.promise; readsFail = true; return json(route, { ok: true }); });
  await page.goto("/admin/provider-approvals");
  const approve = page.getByRole("button", { name: /^Approve and provision/ });
  await approve.click(); await expect(approve).toBeDisabled();
  await approve.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(writes).toBe(1); gate.resolve();
  await expect(page.getByText(/Provider review confirmed.*The updated view could not be loaded/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry provider submissions" })).toBeVisible();
  expect(writes).toBe(1);
});

for (const [status, expected] of [[401, "Your session has expired"], [403, "You do not have permission"], [400, "The submitted information was not accepted"], [409, "The record has changed"]]) {
  test(`admin mutation handles ${status} without exposing server details`, async ({ page }) => {
    await page.route(/\/api\/admin\/users(?:\?.*)?$/, (route) => json(route, { data: [user] }));
    await page.route("**/api/admin/users/*/revoke-sessions", (route) => json(route, { error: "Secret connection string and stack trace" }, status));
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Revoke sessions" }).click();
    await expect(page.getByText(new RegExp(expected))).toBeVisible();
    await expect(page.getByText(/Secret connection|string and stack|Session revocation confirmed/)).toHaveCount(0);
  });
}

test("users has loading, unavailable and empty states and blocks unconfirmed mutation resubmission", async ({ page }) => {
  const gate = deferred(); let mode = "loading", writes = 0;
  await page.route(/\/api\/admin\/users(?:\?.*)?$/, async (route) => {
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
  await page.route(/\/api\/admin\/users(?:\?.*)?$/, (route) => { reads++; return json(route, { data: [] }); });
  await page.goto("/admin/users");
  await expect(page.getByText(/Admin access required/)).toBeVisible();
  expect(reads).toBe(0);
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
  await expect(page).toHaveURL(/\/admin\/hospitals$/);
  await expect(page.getByText("Rejected admin hospital", { exact: true })).toBeVisible();
});

test("emergency bed overview preserves missing-hospital history and isolates loading, errors, malformed data and Retry", async ({ page }) => {
  const historical = { _id: "history", requestId: "MR-HISTORY", status: "EXPIRED", isEmergency: true, hospital: null, createdAt: "2026-10-01T12:00:00Z", timeline: [], expiresAt: "2026-10-02T12:00:00Z" };
  const current = { ...historical, _id: "current", requestId: "MR-CURRENT", hospital, status: "REQUESTED" };
  const ordinary = { ...current, _id: "ordinary", requestId: "MR-ORDINARY", isEmergency: false };
  const closedLegacy = { ...historical, _id: "legacy", requestId: "MR-UNCLASSIFIED", isEmergency: undefined };
  let mode = "loading", bedReads = 0, bloodReads = 0, ambulanceReads = 0;
  const gate = deferred();
  await page.route("**/api/emergency-requests", async (route) => {
    bedReads++;
    if (mode === "loading") await gate.promise;
    return json(route, mode === "error" ? { error: "Controlled service outage" } : mode === "malformed" ? { data: [{ ...historical, status: "REQUESTED", isEmergency: undefined }] } : { data: mode === "empty" ? [] : [historical, current, ordinary, closedLegacy] }, mode === "error" ? 503 : 200);
  });
  await page.route("**/api/blood-requests", (route) => { bloodReads++; return json(route, { data: [] }); });
  await page.route("**/api/ambulances/bookings", (route) => { ambulanceReads++; return json(route, { data: [] }); });
  await page.goto("/admin/emergency");
  const beds = page.getByRole("heading", { name: "Emergency bed requests", exact: true }).locator("..");
  await expect(beds.getByRole("status")).toHaveText("Loading emergency bed requests…");
  await expect(beds.getByText("No recorded emergencies in this category.")).toHaveCount(0);
  mode = "success"; gate.resolve();
  await expect(beds.getByRole("heading", { name: "MR-HISTORY", exact: true })).toBeVisible();
  await expect(beds.getByText("Provider record unavailable", { exact: true })).toBeVisible();
  await expect(beds.getByText(hospital.name, { exact: true })).toBeVisible();
  await expect(beds.getByText("MR-ORDINARY", { exact: true })).toHaveCount(0);
  await expect(beds.getByText("MR-UNCLASSIFIED", { exact: true })).toHaveCount(0);
  for (const failure of ["error", "malformed"]) {
    mode = failure; await page.reload();
    await expect(beds.getByRole("alert")).toBeVisible();
    await expect(beds.getByText("No recorded emergencies in this category.")).toHaveCount(0);
    const before = { bedReads, bloodReads, ambulanceReads };
    mode = "success"; await beds.getByRole("button", { name: "Retry emergency bed requests", exact: true }).click();
    await expect(beds.getByRole("heading", { name: "MR-HISTORY", exact: true })).toBeVisible();
    expect(bedReads).toBe(before.bedReads + 1); expect(bloodReads).toBe(before.bloodReads); expect(ambulanceReads).toBe(before.ambulanceReads);
  }
  mode = "empty"; await page.reload();
  await expect(beds.getByText("No recorded emergencies in this category.")).toBeVisible();
  await expect(beds.getByRole("alert")).toHaveCount(0);
});
