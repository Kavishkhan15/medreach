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

async function performRequest(path, opts = {}, retried = false) {
  const state = refreshState();
  const generation = state.generation;
  const shouldAttachIdempotencyKey =
    opts.method === "POST" &&
    !path.startsWith("/api/auth/") &&
    !opts.headers?.["Idempotency-Key"];
  const requestOptions = {
    ...opts,
    headers: {
      ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
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
  if (res.status === 401 && !retried && !["/api/auth/refresh", "/api/auth/login", "/api/auth/register"].includes(path)) {
    const refreshed = state.generation !== generation || await refreshOnce(state);
    if (refreshed) return performRequest(path, requestOptions, true);
    if (opts.method === "POST" && GUEST_SUBMISSIONS.has(path)) {
      return performRequest(path, { ...requestOptions, credentials: "omit" }, true);
    }
  }
  if (!res.ok) {
    const error = new Error(json.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return json;
}

// Only simultaneous reads are shared; no completed response is cached.
const pendingReads = new Map();
function req(path, opts = {}) {
  if (typeof window === "undefined" || (opts.method && opts.method !== "GET") || opts.signal) {
    if (typeof window !== "undefined" && opts.method && opts.method !== "GET") {
      pendingReads.clear();
      return performRequest(path, opts).finally(() => pendingReads.clear());
    }
    return performRequest(path, opts);
  }
  const key = JSON.stringify([path, opts]);
  if (pendingReads.has(key)) return pendingReads.get(key);
  const request = performRequest(path, opts).finally(() => {
    if (pendingReads.get(key) === request) pendingReads.delete(key);
  });
  pendingReads.set(key, request);
  return request;
}

// Public
export const health = () => req(`/health`);
export const listHospitals = (params = {}, options = {}) =>
  req(`/api/hospitals?${new URLSearchParams(clean(params))}`, options);
export const getHospital = (slug) => req(`/api/hospitals/${slug}`);
export const listAlerts = (region) =>
  req(`/api/alerts${region ? `?region=${encodeURIComponent(region)}` : ""}`);
export const listResources = (kind, params = {}) =>
  req(`/api/${kind}?${new URLSearchParams(clean(params))}`);
export const getResource = (kind, id) => req(`/api/${kind}/${id}`);

// Auth
export const register = (payload) =>
  req(`/api/auth/register`, { method: "POST", body: JSON.stringify(payload) });
export const login = (email, password, verification = {}) =>
  req(`/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password, ...(verification.code ? { code: verification.code } : {}), ...(verification.recoveryCode ? { recoveryCode: verification.recoveryCode } : {}) }) });
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
export const adminOverview = (options = {}) => req(`/api/admin/overview`, options);
export const adminVerifyHospital = (id, decision) =>
  req(`/api/admin/hospitals/${id}/verify`, { method: "POST", body: JSON.stringify({ decision }) });
export const adminListAudit = (options = {}) => req(`/api/admin/audit`, options);
export const adminListUsers = (options = {}) => req(`/api/admin/users`, options);
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

// System Admin directory includes organisations awaiting approval.
export const listAdminHospitals = (params = {}, options = {}) => req(`/api/admin/hospitals?${new URLSearchParams(clean(params))}`, options);
