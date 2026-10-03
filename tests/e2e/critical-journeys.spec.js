import { expect, test } from "@playwright/test";

const API = "http://localhost:4000";
const PASSWORD = "E2E_SafePassword_123!";

// Isolate browser clients so separate journeys do not share rate-limit budgets.
test.beforeEach(async ({ context }, testInfo) => {
  const variant = ["bootstrap", "tailwind", "skeleton"].indexOf(testInfo.project.name) + 1;
  const journey = [...testInfo.title].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 253, 0) + 1;
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.19.${variant}.${journey}` });
});

function attachRuntimeGuard(page) {
  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
      failures.push(`console: ${message.text()}`);
    }
    if (message.type() === "warning" && /params is now a Promise|param property was accessed directly/i.test(message.text())) {
      failures.push(`console: ${message.text()}`);
    }
  });
  return () => expect(failures, failures.join("\n")).toEqual([]);
}

test("in-app notifications are removed while dashboard and email delivery remain available", async ({ page }, testInfo) => {
  const clean = attachRuntimeGuard(page);
  const notificationCalls = [];
  page.on("request", (call) => {
    if (call.url().includes("/api/notifications")) notificationCalls.push(call.url());
  });
  await login(page, `${testInfo.project.name}.e2e@medreach.test`, "/dashboard");
  await expect(page.getByRole("heading", { name: "Applications", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved hospitals", exact: true })).toBeVisible();
  await expect(page.getByText("Recent notifications", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open notifications", exact: true })).toHaveCount(0);
  expect(notificationCalls).toEqual([]);
  expect((await page.request.get(`${API}/api/notifications`)).status()).toBe(404);
  expect((await page.request.patch(`${API}/api/notifications/000000000000000000000000/read`)).status()).toBe(404);
  expect((await page.goto("/notifications")).status()).toBe(404);
  clean();
});

async function login(page, email, returnTo = "/") {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

async function fillJobApplication(page, { name, email, phone }) {
  await page.locator("#candidateName").fill(name);
  await page.locator("#contactEmail").fill(email);
  await page.locator("#contactPhone").fill(phone);
  await page.getByRole("button", { name: "URL Link" }).click();
  await page.locator("#resumeUrl").fill("https://example.test/e2e-resume.pdf");
  await page.locator("#sop").fill(
    "I am a registered nurse with emergency care experience and strong clinical communication skills. I can support triage, patient safety, accurate records, and collaborative care during demanding hospital shifts."
  );
}

async function assertCareerHistory(page, reference) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/dashboard");
  const applications = page.getByRole("region", { name: "Applications", exact: true });
  const panel = applications.getByText(reference, { exact: true }).locator("..");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Copy reference", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Reference copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(reference);
  await expect(panel.getByRole("link", { name: "Track application", exact: true })).toHaveAttribute("href", `/track?type=career&reference=${reference}`);
}

test("password sign-in remains available and the retired callback route is absent", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Google/i })).toHaveCount(0);
  const callback = await page.goto("/auth/google/callback");
  expect(callback.status()).toBe(404);
});

test("password reset requests report backend feedback and recover after a failed attempt", async ({ page }, testInfo) => {
  const clean = attachRuntimeGuard(page);
  let attempts = 0;
  let releaseFailure;
  const failureReady = new Promise((resolve) => { releaseFailure = resolve; });
  await page.route(`${API}/api/auth/forgot-password`, async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await failureReady;
      await route.fulfill({ status: 503, json: { error: "Reset instructions are temporarily unavailable. Please retry." } });
    } else await route.continue();
  });
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(`${testInfo.project.name}.e2e@medreach.test`);
  await page.getByRole("button", { name: /Request reset|Send reset link/ }).click();
  try {
    if (testInfo.project.name !== "bootstrap") {
      await expect(page.getByRole("button", { name: "Requesting…" })).toBeDisabled();
      await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();
      await page.locator("form").evaluate((form) => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    }
    expect(attempts).toBe(1);
  } finally { releaseFailure(); }
  await expect(page.getByText("Reset instructions are temporarily unavailable. Please retry.", { exact: true })).toBeVisible();
  const retried = page.waitForResponse((response) => response.url() === `${API}/api/auth/forgot-password` && response.status() === 200);
  await page.getByRole("button", { name: /Request reset|Send reset link/ }).click();
  const result = await (await retried).json();
  await expect(page.getByText(result.message, { exact: true })).toBeVisible();
  await expect(page.getByText("Reset instructions are temporarily unavailable. Please retry.", { exact: true })).toHaveCount(0);
  expect(attempts).toBe(2);
  await expect(page.getByText(/instructions have been sent/i)).toHaveCount(0);
  clean();
});

test("mobile and tablet navigation opens, closes and preserves directory actions", async ({ page }) => {
  const clean = attachRuntimeGuard(page);
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/track");
    const navigation = page.getByRole("navigation", { name: "Primary" });
    const toggle = navigation.getByRole("button", { name: "Toggle navigation", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(navigation.getByRole("link", { name: "Hospitals", exact: true })).toBeHidden();
    await toggle.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(navigation.getByRole("link", { name: "Hospitals", exact: true })).toBeVisible();
    await navigation.getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(navigation.getByRole("link", { name: "Hospitals", exact: true })).toBeHidden();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Hospitals", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle navigation", exact: true })).toBeHidden();
  clean();
});

test("guest emergency request stays public while tracking and cancellation stay private", async ({ page }) => {
  const clean = attachRuntimeGuard(page);
  let createCalls = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/emergency-requests/emergency")) createCalls += 1;
  });

  await page.goto("/requests/new?flow=emergency");
  await page.locator("#hospital").selectOption({ label: "MedReach E2E Hospital (Bandra West)" });
  await page.locator("#phone").fill("+91 98765 40101");
  await page.getByRole("button", { name: "Submit Emergency Bed Request" }).dblclick();
  await expect(page).toHaveURL(/\/requests\/[a-f0-9]{24}$/);
  await expect(page.getByText(/Emergency Bed Request/i).first()).toBeVisible();
  expect(createCalls).toBe(1);

  const requestUrl = page.url();
  const requestId = new URL(requestUrl).pathname.split("/").pop();
  const trackingToken = await page.evaluate((id) => sessionStorage.getItem(`medreach:emergency-request-token:${id}`), requestId);
  expect(trackingToken).toBeTruthy();
  await page.reload();
  await expect(page.getByText(/Emergency Bed Request/i).first()).toBeVisible();

  await page.context().addCookies([{ name: "token", value: "expired-e2e-session", domain: "localhost", path: "/", httpOnly: true }]);
  await page.reload();
  await expect(page.getByText(/Emergency Bed Request/i).first()).toBeVisible();

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByText(/Tracking token required|Access denied|not found|Invalid or expired token/i)).toBeVisible();

  await page.goto(requestUrl);
  await expect(page.getByText(/Tracking token required|Access denied|not found|Invalid or expired token/i)).toBeVisible();

  await page.evaluate(({ id, token }) => sessionStorage.setItem(`medreach:emergency-request-token:${id}`, token), {
    id: requestId,
    token: trackingToken,
  });
  await page.reload();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.getByText("CANCELLED", { exact: true }).first()).toBeVisible();
  clean();
});

test("standard request, normal blood request, login return path, and careers application are durable", async ({ page, request }, testInfo) => {
  const clean = attachRuntimeGuard(page);
  const email = `${testInfo.project.name}.e2e@medreach.test`;
  const returnTo = "/requests/new?flow=standard&hospital=medreach-e2e-hospital";

  await page.goto(returnTo);
  await page.getByRole("link", { name: "Sign in to your account" }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/requests\/new\?flow=standard&hospital=medreach-e2e-hospital$/);
  await page.locator("#phone").fill("+91 98765 40202");
  await page.getByRole("button", { name: "Submit Hospital Bed Request" }).click();
  await expect(page).toHaveURL(/\/requests\/[a-f0-9]{24}$/);
  await expect(page.getByText(/Hospital Admission Request/i).first()).toBeVisible();

  await page.goto("/blood-banks");
  await page.getByRole("button", { name: "Request / Donate Blood" }).first().click();
  await page.getByPlaceholder("e.g. Rajesh Sharma").fill("E2E Standard Blood Patient");
  await page.getByPlaceholder(/\+91 98200 12345/).fill("+91 98765 40202");
  await page.getByRole("button", { name: /Submit (Blood )?Requisition/ }).click();
  await expect(page.getByText(/Blood Requisition (Submitted|Recorded)!?/, { exact: true })).toBeVisible();
  await expect(page.getByText(/Contact the blood bank directly to confirm inventory and fulfillment/i)).toBeVisible();

  const jobsResponse = await request.get(`${API}/api/jobs`);
  expect(jobsResponse.ok()).toBeTruthy();
  const jobs = await jobsResponse.json();
  const job = jobs.data.find((item) => item.title === "E2E Emergency Nurse");
  expect(job?._id).toBeTruthy();
  await page.goto(`/jobs/${job._id}`);
  await expect(page.getByText("E2E Emergency Nurse", { exact: true }).first()).toBeVisible();
  await fillJobApplication(page, {
    name: `E2E ${testInfo.project.name} Candidate`,
    email,
    phone: "+91 98765 40202",
  });
  const applicationResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/jobs/${job._id}/apply`));
  await page.getByRole("button", { name: "Submit Application" }).click();
  await expect(page.getByText("Application Submitted Successfully", { exact: true })).toBeVisible();
  const application = (await (await applicationResponse).json()).application;
  expect(application.reference).toMatch(/^CAR-J[A-F0-9]{14}$/);
  await expect(page.locator("code")).toHaveText(application.reference);
  await assertCareerHistory(page, application.reference);
  await page.goto("/track");
  await page.locator("#tracking-type").selectOption("career");
  await page.getByLabel("Reference", { exact: true }).fill(application.reference.toLowerCase());
  const careerSummary = page.waitForResponse((response) => response.url().includes(`/api/tracking/career/${application.reference}`) && response.status() === 200);
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  expect(Object.keys((await (await careerSummary).json()).record).sort()).toEqual(["reference", "status", "updatedAt"]);
  const status = page.getByRole("region", { name: "Request status" });
  await expect(status.getByRole("heading", { name: application.reference })).toBeVisible();
  await expect(status).toContainText(application.status);
  await expect(status).not.toContainText(email);
  clean();
});

test("organization career application displays its public reference and tracks from the same reference field", async ({ page }, testInfo) => {
  const clean = attachRuntimeGuard(page);
  const email = `${testInfo.project.name}.e2e@medreach.test`;
  await login(page, email, "/careers");
  await page.getByRole("button", { name: "Apply Now for roles at MedReach E2E Hospital", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#modalRoleInterested").selectOption("Nurse / Nursing Staff");
  await dialog.locator("#modalCandidateName").fill(`E2E ${testInfo.project.name} Organization Candidate`);
  await dialog.locator("#modalCandidateEmail").fill(email);
  await dialog.locator("#modalCandidatePhone").fill("+91 98765 40202");
  await dialog.getByRole("button", { name: "Online URL Link" }).click();
  await dialog.locator("#resumeUrlInput").fill("https://example.test/e2e-organization-resume.pdf");
  await dialog.locator("#sopTextarea").fill("I am a registered nurse with emergency care experience and strong clinical communication skills. I can support triage, patient safety, accurate records, and collaborative care during demanding hospital shifts.");
  const submitted = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/organizations\/[a-f0-9]{24}\/apply$/.test(response.url()));
  await dialog.getByRole("button", { name: "Submit Application", exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const application = (await response.json()).application;
  expect(application.reference).toMatch(/^CAR-O[A-F0-9]{14}$/);
  await expect(dialog.getByRole("alert")).toContainText(application.reference);
  expect(await dialog.getByRole("alert").innerText()).not.toMatch(/\b[a-f0-9]{24}\b/i);
  await assertCareerHistory(page, application.reference);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/track");
  await page.locator("#tracking-type").selectOption("career");
  await page.getByLabel("Reference", { exact: true }).fill(application.reference);
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  const status = page.getByRole("region", { name: "Request status" });
  await expect(status.getByRole("heading", { name: application.reference })).toBeVisible();
  await expect(status).toContainText(application.status);
  await expect(status).not.toContainText(email);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  clean();
});

test("urgent blood and ambulance submissions report recorded state without false delivery claims", async ({ page }) => {
  const clean = attachRuntimeGuard(page);
  await page.goto("/urgent-blood");
  await page.getByPlaceholder("e.g. Ramesh Patel").fill("E2E Blood Patient");
  await page.getByPlaceholder(/Lilavati Hospital/i).fill("MedReach E2E Hospital");
  await page.getByPlaceholder("e.g. +91 98200 11223").fill("+91 98765 40303");
  await page.getByRole("button", { name: "Submit Urgent Blood Requirement" }).click();
  await expect(page.getByText("Urgent Blood Request Recorded", { exact: true })).toBeVisible();
  await expect(page.getByText(/No blood bank has confirmed inventory or fulfillment/i)).toBeVisible();

  await page.goto("/ambulances");
  await page.getByRole("button", { name: "Book Ambulance" }).first().click();
  const bookingDialog = page.getByRole("dialog");
  await bookingDialog.getByPlaceholder(/Enter patient name|Rahul Sharma/).fill("E2E Ambulance Patient");
  await bookingDialog.getByPlaceholder("Age in years").fill("42");
  await bookingDialog.getByPlaceholder(/9876543210|98200 12345/).fill("9876540303");
  await bookingDialog.locator("select").selectOption("yes");
  await bookingDialog.getByPlaceholder(/Enter address|Street address|Apartment, Street/).fill("E2E Test Campus, Bandra West");
  await bookingDialog.getByRole("button", { name: /Submit Booking|Confirm Booking/ }).click();
  await expect(page.getByText(/Request AMB-[A-Z0-9-]+ was recorded/)).toBeVisible();
  await expect(page.getByText(/provider notification email was not sent/i)).toBeVisible();
  clean();
});

test("mobile guest urgent blood and ambulance requests remain usable and their private tracking links open", async ({ page }) => {
  const clean = attachRuntimeGuard(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/urgent-blood");
  await page.getByPlaceholder("e.g. Ramesh Patel").fill("E2E Mobile Blood Patient");
  await page.getByPlaceholder(/Lilavati Hospital/i).fill("MedReach E2E Hospital");
  await page.getByPlaceholder("e.g. +91 98200 11223").fill("+91 98765 40606");
  await page.getByRole("button", { name: "Submit Urgent Blood Requirement" }).click();
  await expect(page.locator('a[href^="/track?type=blood"]')).toBeVisible();
  await page.locator('a[href^="/track?type=blood"]').click();
  await expect(page).toHaveURL(/\/track\?type=blood&reference=BR-/);
  await expect(page.getByRole("region", { name: "Request status" })).toBeVisible();

  await page.goto("/ambulances");
  await page.getByRole("button", { name: "Book Ambulance" }).first().click();
  const bookingDialog = page.getByRole("dialog");
  await expect(bookingDialog.locator("select")).toHaveValue("no");
  await expect(bookingDialog.getByPlaceholder(/Enter address|Street address|Apartment, Street/)).toHaveCount(0);
  await bookingDialog.getByPlaceholder(/Enter patient name|Rahul Sharma/).fill("E2E Mobile Ambulance Patient");
  await bookingDialog.getByPlaceholder("Age in years").fill("42");
  await bookingDialog.getByPlaceholder(/9876543210|98200 12345/).fill("9876540606");
  await bookingDialog.getByRole("button", { name: /Submit Booking|Confirm Booking/ }).click();
  await expect(bookingDialog.getByText(/Request AMB-[A-Z0-9-]+ was recorded/)).toBeVisible();
  await bookingDialog.getByRole("link", { name: "Track request" }).click();
  await expect(page).toHaveURL(/\/track\?type=ambulance&reference=AMB-/);
  await expect(page.getByRole("region", { name: "Request status" })).toBeVisible();
  clean();
});

test("map and directory keep recovery and direct contact actions usable", async ({ page, context }) => {
  const clean = attachRuntimeGuard(page);
  await context.clearPermissions();

  await page.goto("/hospitals/medreach-e2e-hospital");
  await expect(page.getByRole("heading", { name: "MedReach E2E Hospital" })).toBeVisible();

  await page.goto("/map");
  const usableMap = page.getByRole("region", { name: /^(Map|Map unavailable)$/ })
    .or(page.getByRole("img", { name: /Map of Mumbai/ }));
  await expect(usableMap).toBeVisible();
  await expect(page.getByText("MedReach E2E Hospital", { exact: true }).first()).toBeVisible();
  await page.getByText("MedReach E2E Hospital", { exact: true }).first().click();
  await expect(page.getByRole("link", { name: /Call \+91 22 4000 1122/ })).toHaveAttribute("href", /^tel:/);
  await expect(page.getByRole("article").getByRole("link", { name: /Directions/ })).toHaveAttribute("href", /google\.com\/maps\/dir/);

  await page.route(`${API}/api/diagnostics*`, (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Diagnostics" }).click();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open directory" }).first()).toHaveAttribute("href", "/diagnostics");
  clean();
});

test("application sign-in preserves its destination and system admin reaches the dashboard", async ({ page, request }) => {
  const clean = attachRuntimeGuard(page);
  const jobsResponse = await request.get(`${API}/api/jobs`);
  expect(jobsResponse.ok()).toBeTruthy();
  const jobs = await jobsResponse.json();
  const job = jobs.data.find((item) => item.title === "E2E Emergency Nurse");
  expect(job?._id).toBeTruthy();
  await page.goto(`/jobs/${job._id}`);
  await fillJobApplication(page, {
    name: "E2E Guest Candidate",
    email: "guest.candidate@medreach.test",
    phone: "+91 98765 40505",
  });
  await page.getByRole("button", { name: "Submit Application" }).click();
  const signIn = page.getByRole("link", { name: "Sign in" });
  await expect(signIn).toHaveAttribute("href", `/login?returnTo=${encodeURIComponent(`/jobs/${job._id}`)}`);

  await login(page, "admin.e2e@medreach.test", "/admin");
  await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
  await expect(page.getByText("Hospitals tracked", { exact: true })).toBeVisible();
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "User management" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Sign-in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlink Google" })).toHaveCount(0);
  clean();
});

test("first-time sign-in requires a region and resumes the intended destination", async ({ page }, testInfo) => {
  const clean = attachRuntimeGuard(page);
  const email = `${testInfo.project.name}.onboarding@medreach.test`;
  const regionName = `E2E ${testInfo.project.name} Region`;

  await page.goto("/register?returnTo=%2Frequests");
  await page.locator("#name").fill(`E2E ${testInfo.project.name} Onboarding`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/login\?returnTo=%2Frequests&registered=1$/);
  await expect(page.getByText(/Registration accepted/i)).toBeVisible();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/profile\?onboarding=1&returnTo=%2Frequests$/);
  await expect(page.getByText(/Complete your (account setup|profile)/i).first()).toBeVisible();
  const region = page.locator("#region");
  await expect(region).toHaveAttribute("required", "");
  await expect(region).toBeFocused();
  await region.fill(regionName);
  await page.getByRole("button", { name: /Save (profile|and continue)/i }).click();
  await expect(page).toHaveURL(/\/requests$/);

  await page.goto("/profile");
  await expect(page.locator("#region")).toHaveValue(regionName);
  await expect(page.getByRole("link", { name: "Link Google account" })).toHaveCount(0);
  clean();
});

test("tracking needs only a reference and public results exclude personal details", async ({ page, context, request }, testInfo) => {
  const clean = attachRuntimeGuard(page);
  const client = ["bootstrap", "tailwind", "skeleton"].indexOf(testInfo.project.name) + 1;
  await context.setExtraHTTPHeaders({ "X-Forwarded-For": `198.19.0.${client}` });
  const bloodResponse = await request.post(`${API}/api/blood-requests/urgent`, { data: {
    type: "REQUEST", patientOrDonorName: "Private tracking test patient", bloodGroup: "AB-",
    urgency: "within 6 hours", units: 1,
    contactPhone: "+91 98765 40909", doctorNotes: "Private tracking test medical notes",
  } });
  expect(bloodResponse.status()).toBe(201);
  const blood = await bloodResponse.json();
  const providers = await (await request.get(`${API}/api/ambulances`)).json();
  const ambulanceResponse = await request.post(`${API}/api/ambulances/book`, { data: {
    providerId: providers.data[0]._id, patientName: "Private tracking ambulance patient", patientAge: 42,
    contactPhone: "+91 98765 40909", ambulanceRequired: false,
  } });
  expect(ambulanceResponse.status()).toBe(201);
  const ambulance = await ambulanceResponse.json();

  await page.goto("/track");
  await expect(page.locator("#tracking-type option")).toHaveText([
    "Blood request or donation pledge", "Bed request", "Career request", "Ambulance booking",
  ]);
  await expect(page.locator("#tracking-token")).toHaveCount(0);
  await expect(page.getByText(/Private tracking token|Guest tokens are included/)).toHaveCount(0);
  const hospitals = await (await request.get(`${API}/api/hospitals`)).json();
  const hospital = hospitals.data.find((item) => item.slug === "medreach-e2e-hospital");
  const bedResponse = await request.post(`${API}/api/emergency-requests/emergency`, { data: {
    hospitalId: hospital._id, emergencyType: "Medical emergency", requiredFacility: "ICU",
    contactPhone: "+91 98765 40909", patientSummary: "Private bed tracking medical notes",
  } });
  expect(bedResponse.status()).toBe(201);
  const bed = await bedResponse.json();
  for (const [type, reference] of [["blood", blood.reference], ["bed", bed.request.requestId], ["ambulance", ambulance.reference]]) {
    await page.locator("#tracking-type").selectOption(type);
    await page.getByLabel("Reference", { exact: true }).fill(reference.toLowerCase());
    const summaryResponse = page.waitForResponse((response) => response.url().includes(`/api/tracking/${type}/`) && response.status() === 200);
    await page.getByRole("button", { name: "Check status", exact: true }).click();
    const summary = await (await summaryResponse).json();
    expect(Object.keys(summary.record).sort()).toEqual(["reference", "status", "updatedAt"]);
    const status = page.getByRole("region", { name: "Request status" });
    await expect(status.getByRole("heading", { name: reference })).toBeVisible();
    await expect(status).not.toContainText("Private tracking");
    await expect(status).not.toContainText("Blood group:");
    await expect(status).not.toContainText("Provider:");
  }
  await page.goto("/track");
  for (const [type, reference] of [["blood", "BR-20000101-FFFFFF"], ["bed", "MR-AAAAAA-FFFFFF"], ["career", "CAR-JFFFFFFFFFFFFFF"]]) {
    await page.locator("#tracking-type").selectOption(type);
    await page.getByLabel("Reference", { exact: true }).fill("invalid-reference");
    await page.getByRole("button", { name: "Check status", exact: true }).click();
    await expect(page.locator(".alert[role=alert]")).toContainText(/Check the request type and reference/i);
    await page.getByLabel("Reference", { exact: true }).fill(reference);
    await page.getByRole("button", { name: "Check status", exact: true }).click();
    await expect(page.locator(".alert[role=alert]")).toContainText(/Request not found/i);
  }
  await page.goto(`/track?type=blood&reference=${blood.reference}#token=${encodeURIComponent(blood.trackingToken)}`);
  await expect(page.getByRole("region", { name: "Request status" })).toContainText("Blood group: AB-");
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.locator("#tracking-token")).toHaveCount(0);

  await page.goto(`/track?type=ambulance&reference=${ambulance.reference}#token=${encodeURIComponent(ambulance.trackingToken)}`);
  await expect(page.getByRole("region", { name: "Request status" })).toContainText(`Provider: ${providers.data[0].name}`);
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.locator("#tracking-token")).toHaveCount(0);

  await page.evaluate(() => window.sessionStorage.clear());
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    };
  });
  await page.goto(`/track?type=blood&reference=${blood.reference}#token=${encodeURIComponent(blood.trackingToken)}`);
  await expect(page.getByRole("region", { name: "Request status" })).toContainText("Blood group: AB-");
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.locator("#tracking-token")).toHaveCount(0);
  clean();
});
