export function boundedInteger(name, value, fallback, min, max) {
  const raw = value === undefined ? String(fallback) : String(value);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min || Number(raw) > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return Number(raw);
}

export function connectionOptions(values = process.env, nodeEnv = values.NODE_ENV) {
  const maxPoolSize = boundedInteger("MONGO_MAX_POOL_SIZE", values.MONGO_MAX_POOL_SIZE, 10, 1, 100);
  const minPoolSize = boundedInteger("MONGO_MIN_POOL_SIZE", values.MONGO_MIN_POOL_SIZE, 0, 0, 100);
  if (minPoolSize > maxPoolSize) throw new Error("MONGO_MIN_POOL_SIZE cannot exceed MONGO_MAX_POOL_SIZE");
  return {
    maxPoolSize, minPoolSize,
    serverSelectionTimeoutMS: boundedInteger("MONGO_SELECTION_TIMEOUT_MS", values.MONGO_SELECTION_TIMEOUT_MS, 8000, 1000, 30000),
    waitQueueTimeoutMS: boundedInteger("MONGO_WAIT_QUEUE_TIMEOUT_MS", values.MONGO_WAIT_QUEUE_TIMEOUT_MS, 5000, 100, 30000),
    socketTimeoutMS: boundedInteger("MONGO_SOCKET_TIMEOUT_MS", values.MONGO_SOCKET_TIMEOUT_MS, 30000, 1000, 120000),
    maxIdleTimeMS: 60000, autoIndex: nodeEnv !== "production", autoCreate: nodeEnv !== "production",
  };
}
