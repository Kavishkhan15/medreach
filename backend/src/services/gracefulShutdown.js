// Drain HTTP and background work before closing the shared database connection.
export async function drainWorkers(stops) {
  const results = await Promise.allSettled(stops.map((stop) => Promise.resolve().then(stop)));
  const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
  if (errors.length) throw new AggregateError(errors, "Worker cleanup failed");
}

export function registerGracefulShutdown({ server, stopWorkers, disconnect, onStart = () => {},
  timeoutMs = 30000, signals = process, exit = (code) => process.exit(code), logger = console }) {
  let pending;
  let finished = false;
  const finish = (code) => {
    if (finished) return;
    finished = true;
    exit(code);
  };
  const shutdown = (signal) => {
    if (pending) return pending;
    onStart();
    logger.log(`[medreach] ${signal}: draining HTTP and workers.`);
    const deadline = setTimeout(() => {
      logger.error("[medreach] Shutdown deadline exceeded.");
      server.closeAllConnections?.();
      finish(1);
    }, timeoutMs);
    deadline.unref?.();
    pending = (async () => {
      let code = 0;
      for (const step of [
        () => new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
          server.closeIdleConnections?.();
        }),
        stopWorkers,
        disconnect,
      ]) {
        try { await step(); }
        catch { code = 1; logger.error("[medreach] Shutdown step failed."); }
      }
      clearTimeout(deadline);
      finish(code);
    })();
    return pending;
  };
  const handlers = Object.fromEntries(["SIGTERM", "SIGINT"].map((signal) => [signal, () => { void shutdown(signal); }]));
  for (const [signal, handler] of Object.entries(handlers)) signals.on(signal, handler);
  return { shutdown, removeHandlers() {
    for (const [signal, handler] of Object.entries(handlers)) signals.removeListener(signal, handler);
  } };
}
