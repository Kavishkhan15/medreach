// Shared browser session state. Authorization remains enforced by the API.
export function createAuthSession(client) {
  let snapshot = { user: null, ready: false };
  let revision = 0;
  let pending = null;
  let checkedAt = 0;
  const listeners = new Set();
  const publish = (user) => {
    checkedAt = Date.now();
    snapshot = { user: user || null, ready: true };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    invalidate() {
      revision += 1;
      pending = null;
    },
    setUser(user) {
      revision += 1;
      pending = null;
      publish(user);
    },
    refresh(force = false) {
      if (pending) return pending;
      if (snapshot.ready && !force && Date.now() - checkedAt < 30_000) return Promise.resolve(snapshot);
      const started = revision;
      const request = client.me().then(
        (result) => { if (revision === started) publish(result.user); },
        () => { if (revision === started) publish(null); },
      ).finally(() => { if (pending === request) pending = null; });
      pending = request;
      return request;
    },
  };
}
