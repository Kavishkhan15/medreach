// Reject query-language and prototype keys, not ordinary text containing '$or'.
// Iterative traversal and explicit budgets keep hostile JSON bounded.
export function safeInputKeys(value, { maxDepth = 24, maxEntries = 20000 } = {}) {
  const pending = [{ value, depth: 0 }];
  let entries = 0;
  while (pending.length) {
    const { value: current, depth } = pending.pop();
    if (current === null || typeof current !== "object") continue;
    if (depth > maxDepth) return false;
    for (const [key, child] of Object.entries(current)) {
      if (++entries > maxEntries || /[.$[\]]/.test(key)
        || ["__proto__", "prototype", "constructor"].includes(key)) return false;
      if (child !== null && typeof child === "object") pending.push({ value: child, depth: depth + 1 });
    }
  }
  return true;
}

export function rejectUnsafeBodyKeys(req, res, next) {
  if (!safeInputKeys(req.body)) return res.status(400).json({ error: "Request fields must be plain values" });
  return next();
}
