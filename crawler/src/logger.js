// Structured, redacting logger for the crawler. Never logs secrets/cookies/tokens.
// Emits single-line JSON when MEDREACH_LOG_JSON=1, else human-friendly lines.

const REDACT = /(authorization|cookie|token|password|secret|api[_-]?key)/i;

function redact(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT.test(k)) out[k] = "[REDACTED]";
    else if (v && typeof v === "object") out[k] = redact(v);
    else out[k] = v;
  }
  return out;
}

const json = process.env.MEDREACH_LOG_JSON === "1";

function emit(level, stage, msg, meta) {
  if (json) {
    process.stdout.write(JSON.stringify({ t: new Date().toISOString(), level, stage, msg, ...(meta ? redact(meta) : {}) }) + "\n");
  } else {
    const tag = stage ? `[${stage}]` : "";
    process.stdout.write(`${tag} ${msg}\n`);
  }
}

export const log = {
  crawl: (msg, meta) => emit("info", "CRAWL", msg, meta),
  fetch: (msg, meta) => emit("info", "FETCH", msg, meta),
  parse: (msg, meta) => emit("info", "PARSE", msg, meta),
  normalize: (msg, meta) => emit("info", "NORMALIZE", msg, meta),
  validate: (msg, meta) => emit("info", "VALIDATE", msg, meta),
  persist: (msg, meta) => emit("info", "PERSIST", msg, meta),
  warn: (msg, meta) => emit("warn", "WARN", msg, meta),
  error: (msg, meta) => emit("error", "ERROR", msg, meta),
  plain: (msg) => process.stdout.write(msg + "\n"),
};
