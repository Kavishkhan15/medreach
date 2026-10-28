const secretField = /password|token|authorization|cookie|secret|recovery|provisioninguri|(^|_)code$|email|phone|contact|payload|body|medical|patient/i;
export function redactOperationalValue(value, depth = 0) {
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 25).map(item => redactOperationalValue(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, item]) =>
    [key, secretField.test(key) ? "[redacted]" : redactOperationalValue(item, depth + 1)]));
  if (typeof value === "string") return value.replace(/[\r\n\t]/g, " ").slice(0, 160);
  return value;
}
export function safeErrorMetadata(err, requestId) {
  // Never pass third-party error messages, stack traces, request data or raw error
  // codes to operational sinks. Unknown errors receive a stable generic label.
  const names = ["Error", "ValidationError", "CastError", "MongoNetworkError", "MongoServerError", "MongoServerSelectionError"];
  return { name: names.includes(err?.name) ? err.name : "Error", requestId: String(requestId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128),
    code: typeof err?.code === "number" ? err.code : /^[A-Z][A-Z0-9_]{1,60}$/.test(err?.code || "") ? err.code : "UNEXPECTED_ERROR" };
}
