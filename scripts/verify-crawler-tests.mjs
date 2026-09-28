import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";

const testsDirectory = new URL("../crawler/tests/", import.meta.url);
const files = (await readdir(testsDirectory))
  .filter((file) => file.endsWith(".test.js") && file !== "live.test.js")
  .sort();

if (files.length === 0) throw new Error("No offline crawler tests were found");

const child = spawn(process.execPath, ["--test", ...files.map((file) => `tests/${file}`)], {
  cwd: new URL("../crawler/", import.meta.url),
  env: { ...process.env, MEDREACH_LIVE: "0" },
  stdio: "inherit",
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => {
    if (signal) reject(new Error(`Crawler tests terminated by ${signal}`));
    else resolve(code ?? 1);
  });
});

if (exitCode !== 0) process.exit(exitCode);
console.log("SKIP (declared): crawler live-network tests are excluded from the deterministic release gate.");
console.log("Run `npm run crawler:test:live` separately when external-source verification is required.");
