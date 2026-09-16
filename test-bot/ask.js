#!/usr/bin/env node
// test-bot — a tiny, standalone smoke-test script for the MedReach AI
// Assistant endpoint. It is NOT part of the app; it's a manual verification
// tool: ask a few plain questions against the real running backend and print
// whether each one got a real reply back. If the API is down, misconfigured,
// or the provider is broken, this will show it immediately.
//
// Usage:
//   node test-bot/ask.js
//   BASE_URL=http://localhost:4000 node test-bot/ask.js
const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

const QUESTIONS = [
  { label: "Basic sanity check", message: "What is 2+2?" },
  { label: "Greeting / general", message: "hello" },
  { label: "Emergency priority", message: "My father is unconscious." },
  { label: "Hospital search", message: "Find cardiac hospitals near Bandra" },
  { label: "Unknown-availability honesty", message: "Find ICU hospitals" },
];

async function ask(message) {
  const res = await fetch(`${BASE_URL}/api/assistant/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

async function main() {
  console.log(`test-bot → ${BASE_URL}/api/assistant/message\n`);

  // 1. Is the API even up?
  try {
    const health = await fetch(`${BASE_URL}/health`).then((r) => r.json());
    console.log(`[health] ok=${health.ok} db=${health.db}\n`);
  } catch (e) {
    console.error(`[health] UNREACHABLE — is the backend running? (${e.message})`);
    process.exit(1);
  }

  let passed = 0;
  for (const { label, message } of QUESTIONS) {
    process.stdout.write(`[${label}] "${message}" → `);
    try {
      const r = await ask(message);
      const ok = r.status === 200 && typeof r.reply === "string" && r.reply.length > 0;
      if (ok) {
        passed++;
        console.log(`OK (source=${r.source}, intent=${r.intent})`);
        console.log(`   reply: ${r.reply.slice(0, 120)}${r.reply.length > 120 ? "…" : ""}`);
      } else {
        console.log(`FAIL (HTTP ${r.status})`);
        console.log(`   body: ${JSON.stringify(r).slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`FAIL (request error: ${e.message})`);
    }
    console.log("");
  }

  console.log(`${passed}/${QUESTIONS.length} questions got a real reply.`);
  process.exit(passed === QUESTIONS.length ? 0 : 1);
}

main();
