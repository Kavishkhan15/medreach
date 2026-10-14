import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { chromium } from "@playwright/test";

// Models
import { User } from "../backend/src/models/User.js";
import { Hospital } from "../backend/src/models/Hospital.js";
import { ResourceProvider } from "../backend/src/models/ResourceProvider.js";
import { ProviderMembership } from "../backend/src/models/ProviderMembership.js";
import { ProviderApplication } from "../backend/src/models/ProviderApplication.js";
import { EmergencyRequest } from "../backend/src/models/EmergencyRequest.js";
import { BloodRequest } from "../backend/src/models/BloodRequest.js";
import { AmbulanceBooking } from "../backend/src/models/AmbulanceBooking.js";
import { Job } from "../backend/src/models/Job.js";

const MONGO_URI = "mongodb://127.0.0.1:27017/medreach_e2e";
const SCREENSHOTS_DIR = path.resolve("docs/screenshots");
const PASSWORD = "E2E_SafePassword_123!";

async function seedData() {
  console.log("Seeding medreach_e2e database for documentation screenshots...");
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();

  // 1. Users
  const admin = new User({
    name: "Ada Admin",
    email: "admin.e2e@medreach.test",
    role: "system_admin",
    region: "Mumbai",
    emailVerifiedAt: new Date(),
  });
  await admin.setPassword(PASSWORD);
  await admin.save();

  const providerUser = new User({
    name: "Dr. Ramesh Patel",
    email: "bootstrap.provider.e2e@medreach.test",
    role: "provider_admin",
    region: "Mumbai",
    emailVerifiedAt: new Date(),
  });
  await providerUser.setPassword(PASSWORD);
  await providerUser.save();

  const citizenUser = new User({
    name: "Priya Sharma",
    email: "bootstrap.e2e@medreach.test",
    role: "user",
    region: "Mumbai",
    emergencyContact: "+91 98765 40000",
    emailVerifiedAt: new Date(),
  });
  await citizenUser.setPassword(PASSWORD);
  await citizenUser.save();

  // 2. Organizations
  const hospital = await Hospital.create({
    name: "King Edward Memorial Hospital (KEM)",
    slug: "king-edward-memorial-hospital-kem",
    city: "Mumbai",
    locality: "Parel",
    address: "Acharya Donde Marg, Parel, Mumbai, Maharashtra 400012",
    phone: "+91 22 2410 7000",
    emergencyPhone: "+91 22 2410 7108",
    verificationStatus: "verified",
    approvalStatus: "approved",
    facilities: [
      { facility: "Emergency Department", capability: "yes" },
      { facility: "ICU", capability: "yes" },
      { facility: "NICU", capability: "yes" },
      { facility: "Trauma Center", capability: "yes" },
    ],
    specialties: ["Emergency Medicine", "Cardiology", "Trauma Care", "Neurology"],
    services: ["24x7 Emergency", "ICU Beds", "Oxygen Beds", "Ambulance Station"],
    location: { type: "Point", coordinates: [72.8427, 18.9986] },
    admins: [providerUser._id],
  });

  const bloodBank = await ResourceProvider.create({
    kind: "blood_bank",
    name: "KEM Central Blood Bank & Component Centre",
    sourceName: "Verified Healthcare Registry",
    locality: "Parel",
    city: "Mumbai",
    phone: "+91 22 2410 7200",
    verificationStatus: "verified",
    approvalStatus: "approved",
    listedBloodGroups: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
    services: ["Whole Blood", "Platelets", "Packed Red Blood Cells", "Plasma"],
    location: { type: "Point", coordinates: [72.8435, 18.9992] },
  });

  const diagnostic = await ResourceProvider.create({
    kind: "diagnostic",
    name: "Metropolis Healthcare Regional Reference Lab",
    sourceName: "Verified Healthcare Registry",
    locality: "Parel",
    city: "Mumbai",
    phone: "+91 22 2410 8000",
    verificationStatus: "verified",
    approvalStatus: "approved",
    services: ["MRI 3T", "64-Slice CT Scan", "Digital X-Ray", "Pathology", "Blood Chemistry"],
    location: { type: "Point", coordinates: [72.8415, 18.9975] },
  });

  const ambulance = await ResourceProvider.create({
    kind: "ambulance",
    name: "Maharashtra 108 Emergency Medical Services — Dadar Hub",
    sourceName: "Verified Healthcare Registry",
    locality: "Dadar",
    city: "Mumbai",
    phone: "+91 22 2410 9000",
    email: "dispatch.mems@example.com",
    verificationStatus: "verified",
    approvalStatus: "approved",
    services: ["Advanced Life Support (ALS)", "Basic Life Support (BLS)", "Neonatal Transport"],
    location: { type: "Point", coordinates: [72.844, 19.018] },
  });

  // 3. Provider Memberships
  await ProviderMembership.create([
    { user: providerUser._id, kind: "hospital", organization: hospital._id, assignedBy: admin._id, active: true },
    { user: providerUser._id, kind: "blood_bank", organization: bloodBank._id, assignedBy: admin._id, active: true },
  ]);

  // 4. Provider Applications (for /admin/provider-approvals)
  await ProviderApplication.create([
    {
      kind: "diagnostic",
      name: "Apex Advanced Diagnostic & Imaging Centre",
      address: "Plot 42, Central Avenue, Powai, Mumbai 400076",
      phone: "+91 22 6700 3300",
      website: "https://apexdiagnostics.example",
      contactEmail: "sarah.chen@apexdiagnostics.example",
      contactName: "Dr. Sarah Chen",
      city: "Mumbai",
      status: "pending",
      explanation: "NABH accredited diagnostic center offering 24/7 emergency scans and automated pathology.",
    },
    {
      kind: "ambulance",
      name: "Lifeline Critical Care Ambulance Network",
      address: "Station Road, Andheri East, Mumbai 400069",
      phone: "+91 22 6800 4400",
      contactEmail: "ops@lifelineamb.example",
      contactName: "Vikram Malhotra",
      city: "Mumbai",
      status: "pending",
      explanation: "Fleet of 12 cardiac ALS ambulances serving Western Suburbs.",
    },
  ]);

  // 5. Emergency Bed Requests
  await EmergencyRequest.create([
    {
      requestId: "REQ-EMG-2026-081",
      user: citizenUser._id,
      hospital: hospital._id,
      emergencyType: "Acute Myocardial Infarction (Heart Attack)",
      requiredFacility: "ICU",
      patientAgeGroup: "adult",
      patientReference: "Patient: Suresh Sharma (Age 54)",
      patientSummary: "Severe chest pain radiating to left arm. SpO2 91%. ECG indicates STEMI.",
      contactPhone: "+91 98765 40000",
      contactEmail: "bootstrap.e2e@medreach.test",
      isEmergency: true,
      ambulanceRequired: true,
      ambulancePickupAddress: "Flat 402, Sea View Apartments, Worli, Mumbai",
      locality: "Worli",
      status: "UNDER_REVIEW",
      expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
      timeline: [
        { status: "REQUESTED", at: new Date(Date.now() - 15 * 60 * 1000), actorRole: "patient", note: "Emergency request submitted by patient" },
        { status: "UNDER_REVIEW", at: new Date(Date.now() - 5 * 60 * 1000), actorRole: "hospital_staff", note: "Triaged by ER attending physician" },
      ],
    },
    {
      requestId: "REQ-STD-2026-042",
      user: citizenUser._id,
      hospital: hospital._id,
      emergencyType: "Planned Orthopaedic Inpatient",
      requiredFacility: "Operating Theatre",
      patientAgeGroup: "adult",
      patientReference: "Patient: Priya Sharma",
      patientSummary: "Elective knee arthroscopy scheduled.",
      contactPhone: "+91 98765 40000",
      contactEmail: "bootstrap.e2e@medreach.test",
      isEmergency: false,
      ambulanceRequired: false,
      locality: "Parel",
      status: "ACCEPTED",
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      timeline: [
        { status: "REQUESTED", at: new Date(Date.now() - 3600 * 1000), actorRole: "patient" },
        { status: "ACCEPTED", at: new Date(Date.now() - 1800 * 1000), actorRole: "hospital_staff", hospitalResponse: "General ward bed 304 reserved." },
      ],
    },
  ]);

  // 6. Blood Requests
  await BloodRequest.create([
    {
      reference: "BLD-REQ-2026-099",
      type: "REQUEST",
      provider: bloodBank._id,
      bloodBankName: bloodBank.name,
      bloodGroup: "O+",
      patientOrDonorName: "Suresh Sharma",
      units: 2,
      urgency: "Immediate / 6 hours",
      isUrgent: true,
      status: "CONFIRMED",
      contactPhone: "+91 98765 40000",
      contactEmail: "bootstrap.e2e@medreach.test",
      user: citizenUser._id,
      notes: "2 units O+ packed RBC cross-matched and reserved.",
    },
    {
      reference: "BLD-DON-2026-034",
      type: "DONATION",
      provider: bloodBank._id,
      bloodBankName: bloodBank.name,
      bloodGroup: "B+",
      patientOrDonorName: "Priya Sharma",
      urgency: "Within 7 days",
      status: "REQUESTED",
      contactPhone: "+91 98765 40000",
      contactEmail: "bootstrap.e2e@medreach.test",
      user: citizenUser._id,
    },
  ]);

  // 7. Ambulance Booking
  await AmbulanceBooking.create({
    reference: "AMB-2026-012",
    provider: ambulance._id,
    user: citizenUser._id,
    isEmergency: true,
    trackingTokenHash: "hash_amb_e2e_012",
    providerSnapshot: { name: ambulance.name, phone: ambulance.phone, email: ambulance.email },
    requestSnapshot: {
      patientName: "Suresh Sharma",
      patientAge: 54,
      pickupAddress: "Flat 402, Sea View Apartments, Worli, Mumbai",
      contactPhone: "+91 98765 40000",
      contactEmail: "bootstrap.e2e@medreach.test",
      notes: "Severe cardiac distress; requires ALS vehicle with defibrillator.",
    },
    status: "DISPATCHED",
    delivery: {
      user: { status: "sent", sentAt: new Date() },
      admin: { status: "sent", sentAt: new Date() },
      provider: { status: "sent", sentAt: new Date() },
    },
  });

  // 8. Careers Listings
  await Job.create([
    {
      hospital: hospital._id,
      organizationType: "hospital",
      organizationName: hospital.name,
      title: "Senior Emergency Room Staff Nurse",
      category: "Nurse",
      description: "Provide critical care and triage in KEM Level-1 Trauma Centre. Direct patient monitoring and trauma support.",
      requirements: "B.Sc Nursing with 3+ years experience in acute trauma care.",
      employmentType: "full_time",
      location: "Parel, Mumbai",
      status: "published",
      verificationStatus: "verified",
      createdBy: admin._id,
      reviewedBy: admin._id,
    },
    {
      hospital: hospital._id,
      organizationType: "hospital",
      organizationName: hospital.name,
      title: "Intensive Care Unit (ICU) Medical Officer",
      category: "Doctor",
      description: "Manage 24/7 ICU patient protocols, ventilator support and critical care coordination.",
      requirements: "MBBS with critical care certification or MD General Medicine.",
      employmentType: "full_time",
      location: "Parel, Mumbai",
      status: "published",
      verificationStatus: "verified",
      createdBy: admin._id,
      reviewedBy: admin._id,
    },
    {
      provider: diagnostic._id,
      organizationType: "diagnostic",
      organizationName: diagnostic.name,
      title: "Senior MRI & CT Scan Technologist",
      category: "Technician",
      description: "Operate 3T MRI and 64-slice CT imaging suites for emergency diagnostic cases.",
      requirements: "Diploma or Degree in Medical Radiologic Technology.",
      employmentType: "full_time",
      location: "Parel, Mumbai",
      status: "published",
      verificationStatus: "verified",
      createdBy: admin._id,
      reviewedBy: admin._id,
    },
  ]);

  await mongoose.disconnect();
  console.log("Database seeded successfully.");
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404 || res.status === 401) return true;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not respond at ${url} within ${timeoutMs}ms`);
}

async function main() {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
  await seedData();

  console.log("Starting backend server on port 4000...");
  const backend = spawn("node", ["src/server.js"], {
    cwd: path.resolve("backend"),
    env: {
      ...process.env,
      PORT: "4000",
      NODE_ENV: "test",
      MONGO_URI: MONGO_URI,
      MONGODB_URI: MONGO_URI,
      JWT_SECRET: "medreach-e2e-docs-secret-xyz",
      EMAIL_ENABLED: "false",
      TRUST_PROXY: "127.0.0.1,::1",
      CORS_ORIGINS: "http://localhost:3000,http://localhost:3001,http://localhost:3002",
      PUBLIC_APP_URL: "http://localhost:3000",
    },
    stdio: "inherit",
  });

  console.log("Starting frontend server on port 3000...");
  const frontend = spawn("npx", ["next", "start", "-p", "3000"], {
    cwd: path.resolve("variants/bootstrap"),
    env: {
      ...process.env,
      PORT: "3000",
      NODE_ENV: "production",
      NEXT_PUBLIC_API_URL: "http://localhost:4000",
    },
    stdio: "inherit",
  });

  const cleanup = () => {
    console.log("Stopping servers...");
    backend.kill();
    frontend.kill();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await waitForServer("http://localhost:4000/health/ready");
  await waitForServer("http://localhost:3000");
  console.log("Both backend and frontend are ready!");

  const browser = await chromium.launch({ headless: true });

  // 1. Desktop Browser (1440x900)
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });

  // 2. Mobile Browser (390x844)
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  console.log("Capturing screenshots...");

  // A. Public Pages (Desktop)
  console.log("  → landing-page.png");
  await desktop.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "landing-page.png") });

  console.log("  → mobile-landing.png");
  await mobile.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: path.join(SCREENSHOTS_DIR, "mobile-landing.png") });

  console.log("  → using-medreach.png");
  const insightsSection = desktop.locator("#insights");
  await insightsSection.scrollIntoViewIfNeeded();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "using-medreach.png") });

  console.log("  → provider-application-form.png");
  const joinSection = desktop.locator("#join-network");
  await joinSection.scrollIntoViewIfNeeded();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "provider-application-form.png") });

  console.log("  → footer-reveal.png");
  await desktop.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "footer-reveal.png") });

  console.log("  → login-page.png");
  await desktop.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "login-page.png") });

  console.log("  → register-page.png");
  await desktop.goto("http://localhost:3000/register", { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "register-page.png") });

  console.log("  → hospitals-directory.png");
  await desktop.goto("http://localhost:3000/hospitals", { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "hospitals-directory.png") });

  console.log("  → blood-banks-directory.png");
  await desktop.goto("http://localhost:3000/blood-banks", { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "blood-banks-directory.png") });

  console.log("  → emergency-mode.png");
  await desktop.goto("http://localhost:3000/emergency", { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "emergency-mode.png") });

  console.log("  → map-discovery.png");
  await desktop.goto("http://localhost:3000/map", { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(800);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "map-discovery.png") });

  console.log("  → careers-page.png");
  await desktop.goto("http://localhost:3000/careers", { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "careers-page.png") });

  console.log("  → track-request.png");
  await desktop.goto("http://localhost:3000/track", { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "track-request.png") });

  // B. System Admin Authentication & Pages
  console.log("Logging in as System Admin...");
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await adminContext.newPage();
  await adminPage.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await adminPage.fill("#email", "admin.e2e@medreach.test");
  await adminPage.fill("#password", PASSWORD);
  await adminPage.click('button[type="submit"]');
  await adminPage.waitForURL("**/admin**");
  await adminPage.waitForTimeout(800);

  console.log("  → system-admin-dashboard.png");
  await adminPage.screenshot({ path: path.join(SCREENSHOTS_DIR, "system-admin-dashboard.png") });

  console.log("  → provider-approvals.png");
  await adminPage.goto("http://localhost:3000/admin/provider-approvals", { waitUntil: "domcontentloaded" });
  await adminPage.waitForTimeout(600);
  await adminPage.screenshot({ path: path.join(SCREENSHOTS_DIR, "provider-approvals.png") });

  console.log("  → provider-accounts.png");
  await adminPage.goto("http://localhost:3000/admin/provider-accounts", { waitUntil: "domcontentloaded" });
  await adminPage.waitForTimeout(600);
  await adminPage.screenshot({ path: path.join(SCREENSHOTS_DIR, "provider-accounts.png") });

  console.log("  → emergency-requests.png");
  await adminPage.goto("http://localhost:3000/admin/emergency", { waitUntil: "domcontentloaded" });
  await adminPage.waitForTimeout(600);
  await adminPage.screenshot({ path: path.join(SCREENSHOTS_DIR, "emergency-requests.png") });
  await adminContext.close();

  // C. Provider Admin Authentication & Pages
  console.log("Logging in as Provider Admin...");
  const providerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const providerPage = await providerContext.newPage();
  await providerPage.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await providerPage.fill("#email", "bootstrap.provider.e2e@medreach.test");
  await providerPage.fill("#password", PASSWORD);
  await providerPage.click('button[type="submit"]');
  await providerPage.waitForURL("**/provider**");
  await providerPage.waitForTimeout(800);

  console.log("  → provider-dashboard.png");
  await providerPage.screenshot({ path: path.join(SCREENSHOTS_DIR, "provider-dashboard.png") });

  console.log("  → provider-availability-reports.png");
  await providerPage.locator('section:has-text("Reports")').scrollIntoViewIfNeeded().catch(() => {});
  await providerPage.waitForTimeout(400);
  await providerPage.screenshot({ path: path.join(SCREENSHOTS_DIR, "provider-availability-reports.png") });
  await providerContext.close();

  // D. Regular User Authentication & Pages
  console.log("Logging in as Regular User...");
  const userContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const userPage = await userContext.newPage();
  await userPage.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await userPage.fill("#email", "bootstrap.e2e@medreach.test");
  await userPage.fill("#password", PASSWORD);
  await userPage.click('button[type="submit"]');
  await userPage.waitForURL("**/dashboard**");
  await userPage.waitForTimeout(800);

  console.log("  → user-dashboard.png");
  await userPage.screenshot({ path: path.join(SCREENSHOTS_DIR, "user-dashboard.png") });

  console.log("  → user-request-history.png");
  await userPage.goto("http://localhost:3000/requests", { waitUntil: "domcontentloaded" });
  await userPage.waitForTimeout(600);
  await userPage.screenshot({ path: path.join(SCREENSHOTS_DIR, "user-request-history.png") });
  await userContext.close();

  console.log("All screenshots captured successfully!");
  await browser.close();
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
