// Independent emails may overlap, but cap each request's batch at three.
// Await every task: responses still reflect completed delivery attempts and
// failed deliveries retain the existing durable retry records.
export async function runEmailBatch(tasks) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (error) {
        const code = String(error?.code || "EMAIL_FAILED").replace(/[^A-Z0-9_-]/gi, "_").slice(0, 80);
        console.warn(`[medreach] Saved record; email delivery task failed: ${code}`);
        results[index] = { status: "rejected", reason: error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, () => worker()));
  return results;
}
