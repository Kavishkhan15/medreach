import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "/home/anonymous/medreach/research/results/datapath/captures";
await fs.mkdir(OUT_DIR, { recursive: true });

const TARGETS = [
  // Bootstrap Vercel deployment
  { id: "bootstrap_root", url: "https://medreachmumbai.vercel.app/", type: "html", variant: "bootstrap", route: "/" },
  { id: "bootstrap_hospitals", url: "https://medreachmumbai.vercel.app/hospitals", type: "html", variant: "bootstrap", route: "/hospitals" },
  { id: "bootstrap_emergency", url: "https://medreachmumbai.vercel.app/emergency", type: "html", variant: "bootstrap", route: "/emergency" },
  { id: "bootstrap_blood_banks", url: "https://medreachmumbai.vercel.app/blood-banks", type: "html", variant: "bootstrap", route: "/blood-banks" },
  { id: "bootstrap_ambulances", url: "https://medreachmumbai.vercel.app/ambulances", type: "html", variant: "bootstrap", route: "/ambulances" },

  // Tailwind Vercel deployment
  { id: "tailwind_root", url: "https://medreach-tailwind.vercel.app/", type: "html", variant: "tailwind", route: "/" },
  { id: "tailwind_hospitals", url: "https://medreach-tailwind.vercel.app/hospitals", type: "html", variant: "tailwind", route: "/hospitals" },
  { id: "tailwind_emergency", url: "https://medreach-tailwind.vercel.app/emergency", type: "html", variant: "tailwind", route: "/emergency" },
  { id: "tailwind_blood_banks", url: "https://medreach-tailwind.vercel.app/blood-banks", type: "html", variant: "tailwind", route: "/blood-banks" },
  { id: "tailwind_ambulances", url: "https://medreach-tailwind.vercel.app/ambulances", type: "html", variant: "tailwind", route: "/ambulances" },

  // Skeleton Vercel deployment
  { id: "skeleton_root", url: "https://medreach-skeleton.vercel.app/", type: "html", variant: "skeleton", route: "/" },
  { id: "skeleton_hospitals", url: "https://medreach-skeleton.vercel.app/hospitals", type: "html", variant: "skeleton", route: "/hospitals" },
  { id: "skeleton_emergency", url: "https://medreach-skeleton.vercel.app/emergency", type: "html", variant: "skeleton", route: "/emergency" },
  { id: "skeleton_blood_banks", url: "https://medreach-skeleton.vercel.app/blood-banks", type: "html", variant: "skeleton", route: "/blood-banks" },
  { id: "skeleton_ambulances", url: "https://medreach-skeleton.vercel.app/ambulances", type: "html", variant: "skeleton", route: "/ambulances" },

  // Railway Backend API
  { id: "api_health", url: "https://medreach-production.up.railway.app/health", type: "api", endpoint: "/health" },
  { id: "api_hospitals", url: "https://medreach-production.up.railway.app/api/hospitals", type: "api", endpoint: "/api/hospitals" },
  { id: "api_blood_banks", url: "https://medreach-production.up.railway.app/api/blood-banks", type: "api", endpoint: "/api/blood-banks" },
  { id: "api_ambulances", url: "https://medreach-production.up.railway.app/api/ambulances", type: "api", endpoint: "/api/ambulances" },
  { id: "api_diagnostics", url: "https://medreach-production.up.railway.app/api/diagnostics", type: "api", endpoint: "/api/diagnostics" },
  { id: "api_jobs", url: "https://medreach-production.up.railway.app/api/jobs", type: "api", endpoint: "/api/jobs" },
  { id: "api_tracking_status", url: "https://medreach-production.up.railway.app/api/tracking/non-existent-token-probe", type: "api", endpoint: "/api/tracking/:token" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const auditResults = [];

console.log(`Starting gentle read-only datapath probe (${TARGETS.length} endpoints)...`);

for (const target of TARGETS) {
  console.log(`Probing [${target.type}] ${target.id} -> ${target.url}`);
  const startTime = Date.now();
  try {
    const res = await fetch(target.url, {
      method: "GET",
      headers: {
        "User-Agent": "MedReach-Research-Datapath-Auditor/1.0",
        "Accept": target.type === "html" ? "text/html,application/xhtml+xml" : "application/json",
      },
    });

    const elapsedMs = Date.now() - startTime;
    const headersObj = {};
    for (const [key, val] of res.headers.entries()) {
      headersObj[key.toLowerCase()] = val;
    }

    const bodyText = await res.text();
    const ext = target.type === "html" ? "html" : "json";
    const bodyFile = `${target.id}.${ext}`;
    const headerFile = `${target.id}.headers.json`;

    await fs.writeFile(path.join(OUT_DIR, bodyFile), bodyText, "utf8");
    await fs.writeFile(path.join(OUT_DIR, headerFile), JSON.stringify(headersObj, null, 2), "utf8");

    // Perform inspection on the body
    const searchTerms = [
      "Lilavati", "KEM", "King Edward", "Hiranandani", "Tata Memorial", "Hinduja", "Cooper", "Bhabha",
      "icu_beds", "beds_available", "units_available", "bloodGroup", "ventilator", "oxygen_beds",
      "available_beds", "occupied_beds", "total_beds"
    ];

    const foundMatches = {};
    for (const term of searchTerms) {
      const regex = new RegExp(`\\b${term}\\b`, "gi");
      const matches = bodyText.match(regex);
      if (matches && matches.length > 0) {
        foundMatches[term] = matches.length;
      }
    }

    // Check if RSC payload is present
    const hasRSC = bodyText.includes("self.__next_f.push");
    let rscContainsVolatileData = false;
    if (hasRSC) {
      for (const term of ["icu_beds", "units_available", "beds_available", "available_beds"]) {
        if (bodyText.includes(term)) {
          rscContainsVolatileData = true;
          break;
        }
      }
    }

    auditResults.push({
      id: target.id,
      url: target.url,
      type: target.type,
      variant: target.variant || null,
      route: target.route || null,
      endpoint: target.endpoint || null,
      status: res.status,
      elapsedMs,
      contentLength: bodyText.length,
      cacheHeaders: {
        cacheControl: headersObj["cache-control"] || null,
        age: headersObj["age"] || null,
        xVercelCache: headersObj["x-vercel-cache"] || null,
        xNextjsPrerender: headersObj["x-nextjs-prerender"] || null,
        xNextjsStaleTime: headersObj["x-nextjs-stale-time"] || null,
        etag: headersObj["etag"] || null,
        server: headersObj["server"] || null,
        via: headersObj["via"] || null,
      },
      analysis: {
        hasRSC,
        rscContainsVolatileData,
        foundMatches,
        hasVolatileClinicalData: Object.keys(foundMatches).length > 0,
      },
    });

    console.log(`  -> Status ${res.status}, ${bodyText.length} bytes, Cache-Control: ${headersObj["cache-control"]}, x-vercel-cache: ${headersObj["x-vercel-cache"] || "N/A"}`);
  } catch (err) {
    console.error(`  -> ERROR probing ${target.id}:`, err.message);
    auditResults.push({
      id: target.id,
      url: target.url,
      error: err.message,
    });
  }

  // 600 ms polite pause between requests to obey production safety
  await sleep(600);
}

const summaryPath = "/home/anonymous/medreach/research/results/datapath/datapath_audit_summary.json";
await fs.writeFile(summaryPath, JSON.stringify(auditResults, null, 2), "utf8");
console.log(`\nCompleted datapath probe. Summary saved to ${summaryPath}`);
