import { expect, test } from "@playwright/test";

const API = "http://localhost:4000";
const PASSWORD = "E2E_SafePassword_123!";

function attachRuntimeGuard(page) {
  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
      failures.push(`console: ${message.text()}`);
    }
  });
  return () => expect(failures, failures.join("\n")).toEqual([]);
}

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

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByText(/Tracking token required|Access denied|not found/i)).toBeVisible();

  await page.goto(requestUrl);
  await expect(page.getByText(/Tracking token required|Access denied|not found/i)).toBeVisible();

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
  await page.getByRole("button", { name: "Submit Application" }).click();
  await expect(page.getByText("Application Submitted Successfully", { exact: true })).toBeVisible();
  await expect(page.locator("code")).toHaveText(/^[a-f0-9]{24}$/);
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

test("map and directory keep recovery and direct contact actions usable", async ({ page, context }) => {
  const clean = attachRuntimeGuard(page);
  await context.clearPermissions();
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
  clean();
});
