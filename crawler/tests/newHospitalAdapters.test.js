// Tests for new Mumbai medical college & hospital adapters and DiagnosticDirectoryAdapter.
// Verifies:
// 1. Inheritance from SiteAdapter or DirectoryAdapter
// 2. Methods discoverPages(), parseHospital(), parseFacilities()
// 3. Entity decoding & phone normalization
// 4. Strict MedReach policy: extract CAPABILITY ONLY, never live availability quantities
// 5. Multi-center lab locator parsing in DiagnosticDirectoryAdapter
// 6. Registration in adapters/index.js and registry.js

import test from "node:test";
import assert from "node:assert/strict";

import { SiteAdapter } from "../src/adapters/siteAdapter.js";
import { DirectoryAdapter } from "../src/adapters/directoryAdapter.js";
import {
  KemAdapter,
  SionAdapter,
  TataMemorialAdapter,
  NanavatiAdapter,
  DiagnosticDirectoryAdapter,
  ADAPTERS as INDEX_ADAPTERS,
} from "../src/adapters/index.js";
import { ADAPTERS as REGISTRY_ADAPTERS, adapterFor } from "../src/registry.js";
import { _clearCache } from "../src/robots/robotsChecker.js";

// Mock HTML for KEM Hospital with encoded entities and phone
const KEM_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>King Edward &amp; Memorial Hospital &amp; Seth G.S. Medical College</title>
  <meta name="description" content="Premier municipal hospital &amp; tertiary care medical college in Parel, Mumbai.">
</head>
<body>
  <h1>King Edward Memorial Hospital &amp; Seth G.S. Medical College</h1>
  <p>Emergency Department and Casualty are open 24 hours.</p>
  <p>Critical Care: MICU, SICU, PICU, NICU, and 40-bed Cardiac ICU.</p>
  <p>Services: Dialysis unit, Blood Bank, Burns Unit, CT Scan, MRI facility.</p>
  <p>Contact Us: <a href="tel:+91-22-2410-7000">022-24107000</a></p>
  <address>Acharya Donde Marg, Parel, Mumbai - 400012</address>
</body>
</html>
`;

// Mock HTML for Sion Hospital
const SION_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Lokmanya Tilak Municipal General Hospital &amp; Medical College</title>
</head>
<body>
  <h1>Lokmanya Tilak Municipal General Hospital (Sion Hospital)</h1>
  <p>Major 24x7 Trauma Centre and Emergency Department for Central Mumbai.</p>
  <p>Facilities: Intensive Care Unit (ICU), Neonatal ICU (NICU), Blood Bank, Dialysis, Operating Theatre.</p>
  <p>Helpline: Phone : 022-24076381 / 24076382</p>
  <address>Sion West, Mumbai 400022</address>
</body>
</html>
`;

// Mock HTML for Tata Memorial Centre
const TMC_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Tata Memorial Centre &amp; Advanced Centre for Treatment</title>
</head>
<body>
  <h1>Tata Memorial Centre</h1>
  <p>Department of Atomic Energy, Government of India.</p>
  <p>Comprehensive Cancer Care: Oncology, Chemotherapy, Surgical Oncology.</p>
  <p>Facilities: Emergency Department, ICU, CT scan, MRI, Blood Bank, Pharmacy, Operating Theatre.</p>
  <p>Contact: Tel: +91 22 2417 7000</p>
  <address>Dr. E Borges Marg, Parel, Mumbai, Maharashtra 400012</address>
</body>
</html>
`;

// Mock HTML for Nanavati Max Hospital
const NANAVATI_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Nanavati Max Super Speciality Hospital &amp; Research Centre</title>
</head>
<body>
  <h1>Nanavati Max Super Speciality Hospital</h1>
  <p>Quaternary care hospital in Mumbai.</p>
  <p>Centres of Excellence: Cardiology, Oncology, Neurology, Critical Care Unit (ICU), CCU.</p>
  <p>24x7 Emergency Department and Trauma Support.</p>
  <p>Diagnostic & Support: Dialysis, CT, MRI, Blood Bank.</p>
  <p>Phone: <a href="tel:02226267500">022 2626 7500</a></p>
  <address>SV Road, Vile Parle West, Mumbai 400056</address>
</body>
</html>
`;

// Mock HTML for Multi-Center Diagnostic Directory (Suburban, Metropolis, NM Medical)
const DIAGNOSTIC_DIRECTORY_HTML = `
<!DOCTYPE html>
<html>
<head><title>Mumbai Diagnostic Centres &amp; Lab Network</title></head>
<body>
  <div class="center-card">
    <h3>Suburban Diagnostics - Andheri West</h3>
    <div class="address">Shop 4, Crystal Plaza, New Link Road, Andheri West, Mumbai - 400053</div>
    <div class="contact">Phone : <strong>022-6170-0000</strong></div>
    <div class="tests">Pathology, Blood Test, CT Scan, Ultrasound, Digital X-Ray, ECG</div>
    <a href="https://maps.google.com/?q=19.135,72.825">Directions</a>
    <a href="https://www.suburbandiagnostics.com">Visit Website</a>
  </div>

  <div class="center-card">
    <h3>Metropolis Healthcare - Dadar</h3>
    <div class="address">Kohinoor Square, NC Kelkar Marg, Dadar West, Mumbai, 400028</div>
    <div class="contact">Phone : <strong>+91-22-4211-1111</strong></div>
    <div class="tests">Clinical Pathology, Biochemistry, MRI, 2D Echo, Mammography, Health Checkup</div>
    <a href="https://maps.google.com/?q=19.018,72.843">Directions</a>
    <a href="https://www.metropolisindia.com">Visit Website</a>
  </div>

  <div class="center-card">
    <h3>NM Medical - Marine Lines</h3>
    <div class="address">Sevantilal Shah Marg, Marine Lines, Mumbai - 400020</div>
    <div class="contact">Phone : <strong>022-2200-2020</strong></div>
    <div class="tests">Pathology, 3T MRI, CT Scan, Sonography, Health Check-up</div>
    <a href="https://maps.google.com/?q=18.943,72.827">Directions</a>
    <a href="https://www.nmmedical.com">Visit Website</a>
  </div>
</body>
</html>
`;

function mockFetchFor(html) {
  return async (url) => {
    if (url.endsWith("/robots.txt")) {
      return { status: 200, text: async () => "User-agent: *\nAllow: /", headers: { get: () => "text/plain" } };
    }
    return { status: 200, text: async () => html, headers: { get: () => "text/html; charset=utf-8" } };
  };
}

// --- Test 1: KemAdapter ---
test("KemAdapter: inherits SiteAdapter, provides required methods, obeys capability policy", async () => {
  _clearCache();
  const source = {
    sourceId: "kem",
    adapter: "kem",
    baseUrl: "https://www.kem.edu",
    allowedPaths: ["/", "/patient-care", "/emergency-services", "/departments", "/facilities", "/contact-us"],
  };
  const adapter = new KemAdapter(source);

  assert.ok(adapter instanceof SiteAdapter, "inherits SiteAdapter");
  assert.ok(typeof adapter.discoverPages === "function", "has discoverPages");
  assert.ok(typeof adapter.parseHospital === "function", "has parseHospital");
  assert.ok(typeof adapter.parseFacilities === "function", "has parseFacilities");

  const pages = adapter.discoverPages();
  assert.ok(Array.isArray(pages) && pages.length > 0);
  assert.ok(pages.includes("/"));

  // parseHospital
  const hosp = adapter.parseHospital(KEM_HTML);
  assert.equal(hosp.name, "King Edward & Memorial Hospital & Seth G.S. Medical College");
  assert.equal(hosp.locality, "Parel");
  assert.equal(hosp.pincode, "400012");
  assert.equal(hosp.phone, "+912224107000");
  assert.equal(hosp.hospitalType, "Municipal");

  // parseFacilities: capability ONLY, never live availability quantities
  const facs = adapter.parseFacilities(KEM_HTML);
  assert.ok(facs.length > 0);
  for (const f of facs) {
    assert.equal(f.capability, "yes");
    assert.equal(f.availability, undefined);
    assert.equal(f.quantity, undefined);
  }
  const facNames = facs.map((f) => f.facility);
  assert.ok(facNames.includes("ICU"));
  assert.ok(facNames.includes("Emergency Department"));
  assert.ok(facNames.includes("Dialysis"));
  assert.ok(facNames.includes("Blood Bank"));

  // run() integration
  const runAdapter = new KemAdapter(source, { fetchImpl: mockFetchFor(KEM_HTML) });
  const result = await runAdapter.run();
  assert.equal(result.ok, true);
  assert.equal(result.record.emergency.hasEmergencyDept, "yes");
  assert.ok(result.record.facilities.every((f) => f.availability === "unknown"));
});

// --- Test 2: SionAdapter ---
test("SionAdapter: inherits SiteAdapter, provides required methods, obeys capability policy", async () => {
  _clearCache();
  const source = {
    sourceId: "sion",
    adapter: "sion",
    baseUrl: "https://ltmmc.edu.in",
    allowedPaths: ["/", "/emergency", "/trauma-centre", "/departments", "/facilities", "/contact-us"],
  };
  const adapter = new SionAdapter(source);

  assert.ok(adapter instanceof SiteAdapter, "inherits SiteAdapter");
  assert.ok(typeof adapter.discoverPages === "function");
  assert.ok(typeof adapter.parseHospital === "function");
  assert.ok(typeof adapter.parseFacilities === "function");

  const hosp = adapter.parseHospital(SION_HTML);
  assert.equal(hosp.name, "Lokmanya Tilak Municipal General Hospital & Medical College");
  assert.equal(hosp.locality, "Sion");
  assert.equal(hosp.pincode, "400022");
  assert.equal(hosp.phone, "02224076381");
  assert.equal(hosp.hospitalType, "Municipal");

  const facs = adapter.parseFacilities(SION_HTML);
  assert.ok(facs.length > 0);
  assert.ok(facs.every((f) => f.capability === "yes" && f.quantity == null));
  const facNames = facs.map((f) => f.facility);
  assert.ok(facNames.includes("Trauma Center") || facNames.includes("Emergency Department"));
  assert.ok(facNames.includes("ICU"));
  assert.ok(facNames.includes("NICU"));

  // run() integration
  const runAdapter = new SionAdapter(source, { fetchImpl: mockFetchFor(SION_HTML) });
  const result = await runAdapter.run();
  assert.equal(result.ok, true);
  assert.equal(result.record.emergency.hasEmergencyDept, "yes");
  assert.ok(result.record.facilities.every((f) => f.availability === "unknown"));
});

// --- Test 3: TataMemorialAdapter ---
test("TataMemorialAdapter: inherits SiteAdapter, provides required methods, oncology capabilities", async () => {
  _clearCache();
  const source = {
    sourceId: "tata_memorial",
    adapter: "tata_memorial",
    baseUrl: "https://tmc.gov.in",
    allowedPaths: ["/", "/services", "/facilities", "/emergency", "/contact-us", "/patient-care"],
  };
  const adapter = new TataMemorialAdapter(source);

  assert.ok(adapter instanceof SiteAdapter, "inherits SiteAdapter");
  assert.ok(typeof adapter.discoverPages === "function");
  assert.ok(typeof adapter.parseHospital === "function");
  assert.ok(typeof adapter.parseFacilities === "function");

  const hosp = adapter.parseHospital(TMC_HTML);
  assert.equal(hosp.name, "Tata Memorial Centre & Advanced Centre for Treatment");
  assert.equal(hosp.locality, "Parel");
  assert.equal(hosp.pincode, "400012");
  assert.equal(hosp.phone, "+912224177000");
  assert.equal(hosp.hospitalType, "Government");

  const facs = adapter.parseFacilities(TMC_HTML);
  assert.ok(facs.every((f) => f.capability === "yes" && f.quantity == null));
  const facNames = facs.map((f) => f.facility);
  assert.ok(facNames.includes("ICU"));
  assert.ok(facNames.includes("CT"));
  assert.ok(facNames.includes("MRI"));

  // run() integration
  const runAdapter = new TataMemorialAdapter(source, { fetchImpl: mockFetchFor(TMC_HTML) });
  const result = await runAdapter.run();
  assert.equal(result.ok, true);
  assert.equal(result.record.emergency.hasEmergencyDept, "yes");
  assert.ok(result.record.facilities.every((f) => f.availability === "unknown"));
});

// --- Test 4: NanavatiAdapter ---
test("NanavatiAdapter: inherits SiteAdapter, provides required methods, super-speciality capabilities", async () => {
  _clearCache();
  const source = {
    sourceId: "nanavati",
    adapter: "nanavati",
    baseUrl: "https://www.nanavatimaxhospital.org",
    allowedPaths: ["/", "/specialities", "/facilities", "/emergency", "/contact-us", "/about-us"],
  };
  const adapter = new NanavatiAdapter(source);

  assert.ok(adapter instanceof SiteAdapter, "inherits SiteAdapter");
  assert.ok(typeof adapter.discoverPages === "function");
  assert.ok(typeof adapter.parseHospital === "function");
  assert.ok(typeof adapter.parseFacilities === "function");

  const hosp = adapter.parseHospital(NANAVATI_HTML);
  assert.equal(hosp.name, "Nanavati Max Super Speciality Hospital & Research Centre");
  assert.equal(hosp.locality, "Vile Parle West");
  assert.equal(hosp.pincode, "400056");
  assert.equal(hosp.phone, "02226267500");
  assert.equal(hosp.hospitalType, "Trust");

  const facs = adapter.parseFacilities(NANAVATI_HTML);
  assert.ok(facs.every((f) => f.capability === "yes" && f.quantity == null));
  const facNames = facs.map((f) => f.facility);
  assert.ok(facNames.includes("ICU"));
  assert.ok(facNames.includes("CCU"));
  assert.ok(facNames.includes("Emergency Department"));

  // run() integration
  const runAdapter = new NanavatiAdapter(source, { fetchImpl: mockFetchFor(NANAVATI_HTML) });
  const result = await runAdapter.run();
  assert.equal(result.ok, true);
  assert.equal(result.record.emergency.hasEmergencyDept, "yes");
  assert.ok(result.record.facilities.every((f) => f.availability === "unknown"));
});

// --- Test 5: DiagnosticDirectoryAdapter ---
test("DiagnosticDirectoryAdapter: inherits DirectoryAdapter, parses multi-center lab locator", async () => {
  _clearCache();
  const source = {
    sourceId: "suburban_diagnostics",
    adapter: "suburban_diagnostics",
    baseUrl: "https://www.suburbandiagnostics.com",
    sourceType: "government_directory",
    allowedPaths: ["/", "/centres", "/locations", "/lab-locator"],
  };
  const adapter = new DiagnosticDirectoryAdapter(source);

  assert.ok(adapter instanceof DirectoryAdapter, "inherits DirectoryAdapter");
  assert.ok(typeof adapter.discoverPages === "function");
  assert.ok(typeof adapter.parseHospital === "function");
  assert.ok(typeof adapter.parseFacilities === "function");
  assert.ok(typeof adapter.parseListings === "function");

  // parseHospital on single center
  const single = adapter.parseHospital(`
    <h1>Suburban Diagnostics - Andheri</h1>
    <address>Shop 4, Crystal Plaza, Andheri West, Mumbai - 400053</address>
    <a href="tel:02261700000">Call</a>
  `);
  assert.equal(single.name, "Suburban Diagnostics - Andheri");
  assert.equal(single.pincode, "400053");
  assert.equal(single.phone, "02261700000");
  assert.equal(single.hospitalType, "Diagnostic Center");

  // parseFacilities: diagnostic capabilities
  const facs = adapter.parseFacilities("We offer Pathology, CT Scan, 3T MRI, Ultrasound, Digital X-Ray, ECG, 2D Echo, Mammography, Health Checkup.");
  assert.ok(facs.length >= 6);
  assert.ok(facs.every((f) => f.capability === "yes" && f.quantity == null));

  // parseListings: multi-center parsing for Suburban Diagnostics, Metropolis, NM Medical
  const listings = adapter.parseListings(DIAGNOSTIC_DIRECTORY_HTML);
  assert.equal(listings.length, 3, "extracted 3 diagnostic centers");

  const suburban = listings.find((l) => l.name.includes("Suburban Diagnostics"));
  assert.ok(suburban);
  assert.equal(suburban.pincode, "400053");
  assert.equal(suburban.phone, "02261700000");
  assert.equal(suburban.officialWebsite, "https://www.suburbandiagnostics.com");
  assert.ok(suburban.facilities.some((f) => f.facility === "Pathology"));
  assert.ok(suburban.facilities.some((f) => f.facility === "CT"));

  const metropolis = listings.find((l) => l.name.includes("Metropolis Healthcare"));
  assert.ok(metropolis);
  assert.equal(metropolis.pincode, "400028");
  assert.equal(metropolis.phone, "+912242111111");
  assert.equal(metropolis.officialWebsite, "https://www.metropolisindia.com");
  assert.ok(metropolis.facilities.some((f) => f.facility === "MRI"));

  const nm = listings.find((l) => l.name.includes("NM Medical"));
  assert.ok(nm);
  assert.equal(nm.pincode, "400020");
  assert.equal(nm.phone, "02222002020");
  assert.equal(nm.officialWebsite, "https://www.nmmedical.com");
  assert.ok(nm.facilities.some((f) => f.facility === "Pathology"));

  // JSON-LD ItemList multi-center parsing
  const jsonldHtml = `
    <script type="application/ld+json">
    [
      {
        "@type": "DiagnosticLab",
        "name": "Metropolis Healthcare - Dadar Branch",
        "telephone": "+91-22-2411-2233",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "Kohinoor Square, Dadar",
          "postalCode": "400028",
          "addressLocality": "Dadar",
          "addressRegion": "Mumbai"
        },
        "url": "https://www.metropolisindia.com"
      }
    ]
    </script>
  `;
  const jsonldListings = adapter.parseListings(jsonldHtml);
  assert.equal(jsonldListings.length, 1);
  assert.equal(jsonldListings[0].name, "Metropolis Healthcare - Dadar Branch");
  assert.equal(jsonldListings[0].phone, "+912224112233");
  assert.equal(jsonldListings[0].pincode, "400028");

  // run() integration on DirectoryAdapter
  const runAdapter = new DiagnosticDirectoryAdapter(source, { fetchImpl: mockFetchFor(DIAGNOSTIC_DIRECTORY_HTML) });
  const runResult = await runAdapter.run();
  assert.equal(runResult.ok, true);
  assert.equal(runResult.listings.length, 3);
});

// --- Test 6: Registration Checks ---
test("adapters registry: all new adapters registered in index.js and registry.js", () => {
  const keys = [
    "kem",
    "sion",
    "tata_memorial",
    "nanavati",
    "diagnostic_directory",
    "suburban_diagnostics",
    "metropolis",
    "nm_medical",
  ];

  for (const k of keys) {
    assert.ok(INDEX_ADAPTERS[k], `${k} registered in adapters/index.js`);
    assert.ok(REGISTRY_ADAPTERS[k], `${k} registered in registry.js`);
    const instance = adapterFor({ adapter: k });
    assert.ok(instance, `adapterFor creates instance for ${k}`);
  }
});
