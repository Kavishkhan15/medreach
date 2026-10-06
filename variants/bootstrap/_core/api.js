// MedReach API client — isomorphic (works in Next server + client components).
// Base URL from NEXT_PUBLIC_API_URL, defaulting to the local backend.

const BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

const clean = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== "" && v !== null));

const GUEST_SUBMISSIONS = new Set([
  "/api/emergency-requests/emergency",
  "/api/blood-requests/urgent",
  "/api/blood-requests/standard",
  "/api/ambulances/book",
]);

function refreshState() {
  if (typeof window === "undefined") return { generation: 0, promise: null };
  return (window.__medreachRefreshState ||= { generation: 0, promise: null });
}

async function refreshOnce(state) {
  if (!state.promise) {
    state.promise = fetch(`${BASE}/api/auth/refresh`, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" } })
      .then((response) => {
        if (response.ok) state.generation += 1;
        return response.ok;
      }).catch(() => false).finally(() => { state.promise = null; });
  }
  return state.promise;
}

async function req(path, opts = {}, retried = false) {
  const state = refreshState();
  const generation = state.generation;
  const shouldAttachIdempotencyKey =
    opts.method === "POST" &&
    !path.startsWith("/api/auth/") &&
    !opts.headers?.["Idempotency-Key"];
  const requestOptions = {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(shouldAttachIdempotencyKey
        ? { "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}` }
        : {}),
    },
  };
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...requestOptions,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && !retried && path !== "/api/auth/refresh") {
    const refreshed = state.generation !== generation || await refreshOnce(state);
    if (refreshed) return req(path, requestOptions, true);
    if (opts.method === "POST" && GUEST_SUBMISSIONS.has(path)) {
      return req(path, { ...requestOptions, credentials: "omit" }, true);
    }
  }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// Public
export const health = () => req(`/health`);
export const listHospitals = (params = {}) =>
  req(`/api/hospitals?${new URLSearchParams(clean(params))}`);
export const getHospital = (slug) => req(`/api/hospitals/${slug}`);
export const listAlerts = (region) =>
  req(`/api/alerts${region ? `?region=${encodeURIComponent(region)}` : ""}`);
export const listResources = (kind, params = {}) =>
  req(`/api/${kind}?${new URLSearchParams(clean(params))}`);
export const getResource = (kind, id) => req(`/api/${kind}/${id}`);

// Auth
export const register = (payload) =>
  req(`/api/auth/register`, { method: "POST", body: JSON.stringify(payload) });
export const login = (email, password) =>
  req(`/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) });
export const logout = () => req(`/api/auth/logout`, { method: "POST" });
export const me = () => req(`/api/auth/me`);
export const authStatus = () => req(`/api/auth/sessions`);
export const requestVerification = () => req(`/api/auth/request-verification`, { method: "POST" });
export const updateProfile = (body) => req(`/api/auth/profile`, { method: "PUT", body: JSON.stringify(body) });
export const changePassword = (body) => req(`/api/auth/password`, { method: "PUT", body: JSON.stringify(body) });
export const revokeSession = (id) => req(`/api/auth/sessions/${id}`, { method: "DELETE" });

// Registered-user features
export const getSaved = () => req(`/api/users/me/saved`);
export const saveHospital = (id) => req(`/api/users/me/saved/${id}`, { method: "POST" });
export const unsaveHospital = (id) => req(`/api/users/me/saved/${id}`, { method: "DELETE" });

// Admin
export const adminUpdateBeds = (id, body) =>
  req(`/api/hospitals/${id}/beds`, { method: "PATCH", body: JSON.stringify(body) });
export const adminCreateAlert = (body) =>
  req(`/api/alerts`, { method: "POST", body: JSON.stringify(body) });
export const adminOverview = () => req(`/api/admin/overview`);
export const adminVerifyHospital = (id, decision) =>
  req(`/api/admin/hospitals/${id}/verify`, { method: "POST", body: JSON.stringify({ decision }) });
export const adminListAudit = () => req(`/api/admin/audit`);
export const adminListUsers = () => req(`/api/admin/users`);
export const adminSetUserStatus = (id, status) => req(`/api/admin/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const adminSetUserRole = (id, role) => req(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
export const adminRevokeUserSessions = (id) => req(`/api/admin/users/${id}/revoke-sessions`, { method: "POST" });
export const adminTriggerUserReset = (id) => req(`/api/admin/users/${id}/trigger-reset`, { method: "POST" });
export const adminResendUserVerification = (id) => req(`/api/admin/users/${id}/resend-verification`, { method: "POST" });
export const facilityClaims = () => req(`/api/admin/facility-claims`);
export const dataConflicts = (status = "all") =>
  req(`/api/admin/data-conflicts?${new URLSearchParams({ status })}`);
export const reviewFacilityClaim = (id, decision) =>
  req(`/api/admin/facility-claims/${id}/review`, { method: "POST", body: JSON.stringify({ decision }) });
export const hospitalFieldClaims = () => req(`/api/admin/hospital-field-claims`);
export const hospitalFieldConflicts = () => req(`/api/admin/hospital-field-conflicts`);
export const reviewHospitalFieldClaim = (id, decision) =>
  req(`/api/admin/hospital-field-claims/${id}/review`, { method: "POST", body: JSON.stringify({ decision }) });
// AI Assistant — public, rate-limited. Never sends precise location unless the
// caller explicitly passes origin (from useLocation, which never persists it).
export const sendAssistantMessage = (message, { locality, origin } = {}) =>
  req(`/api/assistant/message`, {
    method: "POST",
    body: JSON.stringify(clean({ message, locality, origin })),
  });
