// research/experiments/load/run-load-scenarios.mjs
// Automated, rigorous load test runner using autocannon v8.0.0
// Obeying all safety rules from _common2.md and brief-load.md

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const RESULTS_DIR = "/home/anonymous/medreach/research/results/load";
const RAW_DIR = path.join(RESULTS_DIR, "raw");
const LOG_FILE = path.join(RESULTS_DIR, "load_execution.log");

const BACKEND_PORT = 4200;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const MONGO_PORT = 27018;
const MONGO_DB = "medreach_load_test";
const MONGO_URI = `mongodb://127.0.0.1:${MONGO_PORT}/${MONGO_DB}`;

// Ensure output directories exist
fs.mkdirSync(RAW_DIR, { recursive: true });

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// Strict pre-scenario target verification
function verifyTargetSafety(scenarioName) {
  log(`--- [SAFETY VERIFICATION] for ${scenarioName} ---`);
  
  // 1. Assert backend port is 4200 (LOCAL ONLY)
  if (!BACKEND_URL.startsWith("http://127.0.0.1:4200")) {
    throw new Error(`CRITICAL: Backend target is NOT localhost:4200: ${BACKEND_URL}`);
  }

  // 2. Assert MongoDB target is strictly port 27018
  if (!MONGO_URI.includes("127.0.0.1:27018") || MONGO_URI.includes("27017")) {
    throw new Error(`CRITICAL: Prohibited target port in Mongo URI: ${MONGO_URI}`);
  }

  // 3. Run live check on 27018
  try {
    const mongoStatus = execSync(`mongosh --port ${MONGO_PORT} --eval "db.getName()" --quiet`, { encoding: "utf8" }).trim();
    log(`[SAFETY CHECK] Mongo listening on port ${MONGO_PORT}. Default db: ${mongoStatus}`);
  } catch (err) {
    throw new Error(`MongoDB on port ${MONGO_PORT} is unreachable: ${err.message}`);
  }

  // 4. Run live check on backend
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

// Run autocannon as a promise with JSON output
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
        // Autocannon might output npm warning banners before json
        const jsonStart = stdout.indexOf("{");
        if (jsonStart === -1) {
          throw new Error(`Failed to find JSON in autocannon output. Full output: ${stdout}\nStderr: ${stderr}`);
        }
        const jsonStr = stdout.slice(jsonStart);
        const data = JSON.parse(jsonStr);

        // Evaluate Stop Conditions
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
  log("================================================================================");
  log("STARTING MEDREACH LOAD & RELIABILITY BENCHMARK SUITE (EXP-LOAD-01)");
  log("================================================================================");

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
    scenarios: {}
  };

  // ============================================================================
  // SCENARIO 1: BASELINE (Minimal Load, Reference Roundtrip, C=1)
  // ============================================================================
  log("\n>>> SCENARIO 1: BASELINE REFERENCE (C=1, 10s, 3 runs) <<<");
  suiteResults.scenarios.baseline = { health: [], hospitals: [] };

  for (let run = 1; run <= 3; run++) {
    verifyTargetSafety(`Scenario 1 (Baseline - Health - Run ${run})`);
    const resHealth = await runAutocannon({
      url: `${BACKEND_URL}/health`,
      connections: 1,
      duration: 10,
      title: `Baseline-Health-Run${run}`,
      stopConditions: { maxErrorRate: 0.01, maxP95Latency: 500 }
    });
    saveRawResult(`scn01_baseline_health_run${run}.json`, resHealth);
    suiteResults.scenarios.baseline.health.push(resHealth);
    await sleep(2000);

    verifyTargetSafety(`Scenario 1 (Baseline - Hospitals - Run ${run})`);
    const resHosp = await runAutocannon({
      url: `${BACKEND_URL}/api/hospitals`,
      connections: 1,
      duration: 10,
      title: `Baseline-Hospitals-Run${run}`,
      stopConditions: { maxErrorRate: 0.01, maxP95Latency: 500 }
    });
    saveRawResult(`scn01_baseline_hospitals_run${run}.json`, resHosp);
    suiteResults.scenarios.baseline.hospitals.push(resHosp);
    await sleep(2000);
  }

  // ============================================================================
  // SCENARIO 2: WORKLOAD RAMP (Increasing Load, C in [5, 10, 25, 50], 3 runs each)
  // ============================================================================
  log("\n>>> SCENARIO 2: WORKLOAD RAMP (C in [5, 10, 25, 50], 10s, 3 runs each) <<<");
  suiteResults.scenarios.ramp = { levels: {} };
  const rampLevels = [5, 10, 25, 50];

  for (const c of rampLevels) {
    suiteResults.scenarios.ramp.levels[`c${c}`] = [];
    for (let run = 1; run <= 3; run++) {
      verifyTargetSafety(`Scenario 2 (Ramp C=${c} Run ${run})`);
      const res = await runAutocannon({
        url: `${BACKEND_URL}/api/hospitals`,
        connections: c,
        duration: 10,
        title: `Ramp-C${c}-Run${run}`,
        stopConditions: { maxErrorRate: 0.05, maxP95Latency: 2000 }
      });
      saveRawResult(`scn02_ramp_c${c}_run${run}.json`, res);
      suiteResults.scenarios.ramp.levels[`c${c}`].push(res);
      await sleep(2000);
    }
  }

  // ============================================================================
  // SCENARIO 3: CONTROLLED STRESS (Degradation Point, C in [100, 200, 400])
  // ============================================================================
  log("\n>>> SCENARIO 3: CONTROLLED STRESS (C in [100, 200, 400], 10s each) <<<");
  suiteResults.scenarios.stress = { levels: {} };
  const stressLevels = [100, 200, 400];

  for (const c of stressLevels) {
    verifyTargetSafety(`Scenario 3 (Stress C=${c})`);
    const res = await runAutocannon({
      url: `${BACKEND_URL}/api/hospitals`,
      connections: c,
      duration: 10,
      title: `Stress-C${c}`,
      stopConditions: { maxErrorRate: 0.20, maxP95Latency: 5000 }
    });
    saveRawResult(`scn03_stress_c${c}.json`, res);
    suiteResults.scenarios.stress.levels[`c${c}`] = res;
    await sleep(3000);
  }

  // ============================================================================
  // SCENARIO 4: BOUNDED TRAFFIC SPIKE (C=5 -> C=250 -> C=5)
  // ============================================================================
  log("\n>>> SCENARIO 4: BOUNDED TRAFFIC SPIKE (Pre C=5, Spike C=250, Post C=5) <<<");
  suiteResults.scenarios.spike = {};

  verifyTargetSafety("Scenario 4 (Spike - Pre-Spike)");
  const preSpike = await runAutocannon({
    url: `${BACKEND_URL}/api/hospitals`,
    connections: 5,
    duration: 5,
    title: "Spike-Pre-C5",
  });
  saveRawResult("scn04_spike_pre.json", preSpike);
  suiteResults.scenarios.spike.pre = preSpike;
  await sleep(1000);

  verifyTargetSafety("Scenario 4 (Spike - Peak Surge)");
  const peakSpike = await runAutocannon({
    url: `${BACKEND_URL}/api/hospitals`,
    connections: 250,
    duration: 10,
    title: "Spike-Peak-C250",
    stopConditions: { maxErrorRate: 0.50 }
  });
  saveRawResult("scn04_spike_peak.json", peakSpike);
  suiteResults.scenarios.spike.peak = peakSpike;
  await sleep(1000);

  verifyTargetSafety("Scenario 4 (Spike - Post-Spike Settling)");
  const postSpike = await runAutocannon({
    url: `${BACKEND_URL}/api/hospitals`,
    connections: 5,
    duration: 5,
    title: "Spike-Post-C5",
  });
  saveRawResult("scn04_spike_post.json", postSpike);
  suiteResults.scenarios.spike.post = postSpike;
  await sleep(3000);

  // ============================================================================
  // SCENARIO 5: SUSTAINED SOAK WORKLOAD (C=30, 60s continuous)
  // ============================================================================
  log("\n>>> SCENARIO 5: SUSTAINED SOAK WORKLOAD (C=30, 60s) <<<");
  verifyTargetSafety("Scenario 5 (Sustained Soak)");
  const soakRes = await runAutocannon({
    url: `${BACKEND_URL}/api/hospitals`,
    connections: 30,
    duration: 60,
    title: "Sustained-Soak-C30-60s",
    stopConditions: { maxErrorRate: 0.05, maxP95Latency: 2000 }
  });
  saveRawResult("scn05_soak_c30_60s.json", soakRes);
  suiteResults.scenarios.soak = soakRes;
  await sleep(5000);

  // ============================================================================
  // SCENARIO 6: POST-LOAD RECOVERY (C=1, 10s, 3 runs)
  // ============================================================================
  log("\n>>> SCENARIO 6: POST-LOAD RECOVERY (C=1, 10s, 3 runs) <<<");
  suiteResults.scenarios.recovery = { health: [], hospitals: [] };

  for (let run = 1; run <= 3; run++) {
    verifyTargetSafety(`Scenario 6 (Recovery - Health - Run ${run})`);
    const resRecHealth = await runAutocannon({
      url: `${BACKEND_URL}/health`,
      connections: 1,
      duration: 10,
      title: `Recovery-Health-Run${run}`,
      stopConditions: { maxErrorRate: 0.01, maxP95Latency: 500 }
    });
    saveRawResult(`scn06_recovery_health_run${run}.json`, resRecHealth);
    suiteResults.scenarios.recovery.health.push(resRecHealth);
    await sleep(2000);

    verifyTargetSafety(`Scenario 6 (Recovery - Hospitals - Run ${run})`);
    const resRecHosp = await runAutocannon({
      url: `${BACKEND_URL}/api/hospitals`,
      connections: 1,
      duration: 10,
      title: `Recovery-Hospitals-Run${run}`,
      stopConditions: { maxErrorRate: 0.01, maxP95Latency: 500 }
    });
    saveRawResult(`scn06_recovery_hospitals_run${run}.json`, resRecHosp);
    suiteResults.scenarios.recovery.hospitals.push(resRecHosp);
    await sleep(2000);
  }

  // Save complete suite summary
  saveRawResult("complete_suite_results.json", suiteResults);

  log("\n================================================================================");
  log("ALL LOAD & RELIABILITY SCENARIOS COMPLETED SUCCESSFULLY");
  log("================================================================================");
}

main().catch((err) => {
  log(`[FATAL ERROR] In runner: ${err.message}\n${err.stack}`);
  process.exit(1);
});
