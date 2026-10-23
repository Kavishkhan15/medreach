// research/experiments/load/run-recovery.mjs
// Completes Scenario 6 (Post-Load Recovery) and aggregates complete_suite_results.json

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RESULTS_DIR = "/home/anonymous/medreach/research/results/load";
const RAW_DIR = path.join(RESULTS_DIR, "raw");
const LOG_FILE = path.join(RESULTS_DIR, "load_execution.log");

const BACKEND_PORT = 4200;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const MONGO_PORT = 27018;
const MONGO_DB = "medreach_load_test";
const MONGO_URI = `mongodb://127.0.0.1:${MONGO_PORT}/${MONGO_DB}`;

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

function verifyTargetSafety(scenarioName) {
  log(`--- [SAFETY VERIFICATION] for ${scenarioName} ---`);
  
  if (!BACKEND_URL.startsWith("http://127.0.0.1:4200")) {
    throw new Error(`CRITICAL: Backend target is NOT localhost:4200: ${BACKEND_URL}`);
  }
  if (!MONGO_URI.includes("127.0.0.1:27018") || MONGO_URI.includes("27017")) {
    throw new Error(`CRITICAL: Prohibited target port in Mongo URI: ${MONGO_URI}`);
  }

  try {
    const mongoStatus = execSync(`mongosh --port ${MONGO_PORT} --eval "db.getName()" --quiet`, { encoding: "utf8" }).trim();
    log(`[SAFETY CHECK] Mongo listening on port ${MONGO_PORT}. Default db: ${mongoStatus}`);
  } catch (err) {
    throw new Error(`MongoDB on port ${MONGO_PORT} is unreachable: ${err.message}`);
  }

  try {
    const healthJson = execSync(`curl -s ${BACKEND_URL}/health`, { encoding: "utf8" });
    const health = JSON.parse(healthJson);
    if (!health.ok || health.db !== "connected") {
      throw new Error(`Backend not healthy: ${healthJson}`);
    }
    log(`[SAFETY CHECK] Backend healthy at ${BACKEND_URL}/health (db: ${health.db})`);
  } catch (err) {
    throw new Error(`Backend at ${BACKEND_URL} unreachable: ${err.message}`);
  }

  log(`[SAFETY VERIFICATION PASSED] Verified isolated target ${BACKEND_URL} backed by 27018/${MONGO_DB}. Port 27017 strictly uncontacted.`);
}

function runAutocannon({ url, connections, duration, pipelining = 1, title, stopConditions = {} }) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "autocannon@8.0.0",
      "-c", String(connections),
      "-d", String(duration),
      "-p", String(pipelining),
      "--renderStatusCodes",
      "-j",
      url
    ];

    log(`[EXEC] npx ${args.join(" ")}`);
    const proc = spawn("npx", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });

    proc.on("close", (code) => {
      if (code !== 0) {
        log(`[WARN] Autocannon exited with code ${code}. Stderr: ${stderr}`);
      }
      try {
        const jsonStart = stdout.indexOf("{");
        if (jsonStart === -1) {
          throw new Error(`Failed to find JSON in autocannon output. Full output: ${stdout}\nStderr: ${stderr}`);
        }
        const jsonStr = stdout.slice(jsonStart);
        const data = JSON.parse(jsonStr);

        const errorRate = (data.errors + data.timeouts + data.non2xx) / (data.requests.total || 1);
        const p97_5Latency = data.latency.p97_5 || 0;

        log(`[RESULT] ${title || url} | Concurrency: ${connections} | Reqs: ${data.requests.total} | Throughput: ${data.requests.average.toFixed(1)} req/s | Med Latency: ${data.latency.p50} ms | p90: ${data.latency.p90} ms | p97.5: ${data.latency.p97_5} ms | p99: ${data.latency.p99} ms | Errors: ${data.errors} | Timeouts: ${data.timeouts} | Non-2xx: ${data.non2xx}`);

        if (stopConditions.maxErrorRate !== undefined && errorRate > stopConditions.maxErrorRate) {
          log(`[STOP CONDITION TRIGGERED] Error rate ${(errorRate * 100).toFixed(2)}% exceeded threshold ${(stopConditions.maxErrorRate * 100).toFixed(2)}%`);
        }
        if (stopConditions.maxP97_5Latency !== undefined && p97_5Latency > stopConditions.maxP97_5Latency) {
          log(`[STOP CONDITION TRIGGERED] p97.5 latency ${p97_5Latency} ms exceeded threshold ${stopConditions.maxP97_5Latency} ms`);
        }

        resolve(data);
      } catch (err) {
        reject(err);
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

function saveRawResult(filename, data) {
  const filePath = path.join(RAW_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  log(`[SAVED RAW] ${filePath}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  log("\n>>> SCENARIO 6: POST-LOAD RECOVERY (C=1, 10s, 3 runs each) <<<");
  const recoveryResults = { health: [], hospitals: [] };

  for (let run = 1; run <= 3; run++) {
    verifyTargetSafety(`Scenario 6 (Recovery - Health - Run ${run})`);
    const resRecHealth = await runAutocannon({
      url: `${BACKEND_URL}/health`,
      connections: 1,
      duration: 10,
      title: `Recovery-Health-Run${run}`,
      stopConditions: { maxErrorRate: 0.01, maxP97_5Latency: 500 }
    });
    saveRawResult(`scn06_recovery_health_run${run}.json`, resRecHealth);
    recoveryResults.health.push(resRecHealth);
    await sleep(2000);

    verifyTargetSafety(`Scenario 6 (Recovery - Hospitals - Run ${run})`);
    const resRecHosp = await runAutocannon({
      url: `${BACKEND_URL}/api/hospitals`,
      connections: 1,
      duration: 10,
      title: `Recovery-Hospitals-Run${run}`,
      stopConditions: { maxErrorRate: 0.01, maxP97_5Latency: 500 }
    });
    saveRawResult(`scn06_recovery_hospitals_run${run}.json`, resRecHosp);
    recoveryResults.hospitals.push(resRecHosp);
    await sleep(2000);
  }

  // Now assemble complete suite results
  log("\n[SUITE] Assembling complete_suite_results.json from all 25 raw JSON files...");
  const suiteResults = {
    metadata: {
      experimentId: "EXP-LOAD-01",
      timestamp: new Date().toISOString(),
      tool: "autocannon@8.0.0",
      nodeVersion: process.version,
      platform: process.platform,
      backendUrl: BACKEND_URL,
      mongoTarget: MONGO_URI,
      cpuCount: 16,
      ramTotalGb: 15,
    },
    scenarios: {
      baseline: {
        health: [1, 2, 3].map(r => JSON.parse(fs.readFileSync(path.join(RAW_DIR, `scn01_baseline_health_run${r}.json`), "utf8"))),
        hospitals: [1, 2, 3].map(r => JSON.parse(fs.readFileSync(path.join(RAW_DIR, `scn01_baseline_hospitals_run${r}.json`), "utf8"))),
      },
      ramp: {
        levels: {
          c5: [1, 2, 3].map(r => JSON.parse(fs.readFileSync(path.join(RAW_DIR, `scn02_ramp_c5_run${r}.json`), "utf8"))),
          c10: [1, 2, 3].map(r => JSON.parse(fs.readFileSync(path.join(RAW_DIR, `scn02_ramp_c10_run${r}.json`), "utf8"))),
          c25: [1, 2, 3].map(r => JSON.parse(fs.readFileSync(path.join(RAW_DIR, `scn02_ramp_c25_run${r}.json`), "utf8"))),
          c50: [1, 2, 3].map(r => JSON.parse(fs.readFileSync(path.join(RAW_DIR, `scn02_ramp_c50_run${r}.json`), "utf8"))),
        }
      },
      stress: {
        levels: {
          c100: JSON.parse(fs.readFileSync(path.join(RAW_DIR, "scn03_stress_c100.json"), "utf8")),
          c200: JSON.parse(fs.readFileSync(path.join(RAW_DIR, "scn03_stress_c200.json"), "utf8")),
          c400: JSON.parse(fs.readFileSync(path.join(RAW_DIR, "scn03_stress_c400.json"), "utf8")),
        }
      },
      spike: {
        pre: JSON.parse(fs.readFileSync(path.join(RAW_DIR, "scn04_spike_pre.json"), "utf8")),
        peak: JSON.parse(fs.readFileSync(path.join(RAW_DIR, "scn04_spike_peak.json"), "utf8")),
        post: JSON.parse(fs.readFileSync(path.join(RAW_DIR, "scn04_spike_post.json"), "utf8")),
      },
      soak: JSON.parse(fs.readFileSync(path.join(RAW_DIR, "scn05_soak_c30_60s.json"), "utf8")),
      recovery: recoveryResults
    }
  };

  saveRawResult("complete_suite_results.json", suiteResults);
  log("[SUITE] complete_suite_results.json successfully generated!");
}

main().catch((err) => {
  log(`[FATAL ERROR] In recovery runner: ${err.message}\n${err.stack}`);
  process.exit(1);
});
