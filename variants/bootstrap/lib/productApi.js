const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const GUEST_SUBMISSIONS = new Set([
  "/api/emergency-requests/emergency",
  "/api/blood-requests/urgent",
  "/api/blood-requests/standard",
  "/api/ambulances/book",
  "/api/diagnostics/requests",
]);

function refreshState() {
  if (typeof window === "undefined") return { generation: 0, promise: null };
  return (window.__medreachRefreshState ||= { generation: 0, promise: null });
}

async function refreshOnce(state) {
  if (!state.promise) {
    state.promise = fetch(`${BASE}/api/auth/refresh`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    }).then((response) => {
      if (response.ok) state.generation += 1;
      return response.ok;
    }).catch(() => false).finally(() => { state.promise = null; });
  }
  return state.promise;
}

export async function productApi(path, options = {}, retried = false) {
  const state = refreshState();
  const generation = state.generation;
  const { headers: optionHeaders, ...requestOptions } = options;
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include", ...requestOptions,
    headers: { ...(options.body === undefined ? {} : { "Content-Type": "application/json" }), ...(optionHeaders || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !retried && path !== "/api/auth/refresh") {
    const refreshed = state.generation !== generation || await refreshOnce(state);
    const guestTracking = Boolean(optionHeaders?.["X-MedReach-Tracking-Token"])
      && (/^\/api\/emergency-requests\/[^/]+$/.test(path) || /^\/api\/blood-requests\/[^/]+$/.test(path) || /^\/api\/ambulances\/bookings\/[^/]+$/.test(path) || /^\/api\/diagnostics\/requests\/[^/]+(?:\/cancel)?$/.test(path));
    if (refreshed) return productApi(path, options, true);
    if ((options.method === "POST" && GUEST_SUBMISSIONS.has(path)) || guestTracking) {
      return productApi(path, { ...options, credentials: "omit" }, true);
    }
  }
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data.code;
    error.details = data.details;
    throw error;
  }
  return data;
}

const createIdempotencyKey = () => globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function pendingSubmissionKey(path, body) {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    return { key: createIdempotencyKey(), clear() {} };
  }
  const payload = new TextEncoder().encode(`${path}:${JSON.stringify(body)}`);
  const digest = await window.crypto.subtle.digest("SHA-256", payload);
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const storageKey = `medreach:pending-submission:${fingerprint}`;
  try {
    const storage = window.sessionStorage;
    const stored = JSON.parse(storage.getItem(storageKey) || "null");
    if (stored?.key && Date.now() - stored.at < 30 * 60 * 1000) {
      return { key: stored.key, clear() { try { storage.removeItem(storageKey); } catch { /* storage disabled */ } } };
    }
    const key = createIdempotencyKey();
    storage.setItem(storageKey, JSON.stringify({ key, at: Date.now() }));
    return { key, clear() { try { storage.removeItem(storageKey); } catch { /* storage disabled */ } } };
  } catch {
    return { key: createIdempotencyKey(), clear() {} };
  }
}

export const post = async (path, body) => {
  const pending = path.startsWith("/api/auth/") ? null : await pendingSubmissionKey(path, body);
  try {
    const result = await productApi(path, {
      method: "POST",
      headers: pending ? { "Idempotency-Key": pending.key } : {},
      body,
    });
    pending?.clear();
    return result;
  } catch (error) {
    if (error.status === 403 || error.status === 409) pending?.clear();
    throw error;
  }
};
export const patch = (path, body) => productApi(path, { method: "PATCH", body });
