// MedReach API client — isomorphic (works in Next server + client components).
// Base URL from NEXT_PUBLIC_API_URL, defaulting to the local backend.

const BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

const clean = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== "" && v !== null));

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
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

// Auth
export const register = (payload) =>
  req(`/api/auth/register`, { method: "POST", body: JSON.stringify(payload) });
export const login = (email, password) =>
  req(`/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) });
export const logout = () => req(`/api/auth/logout`, { method: "POST" });
export const me = () => req(`/api/auth/me`);

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
export const listSources = () => req(`/api/sources`);
export const createSource = (body) => req(`/api/sources`, { method: "POST", body: JSON.stringify(body) });
export const listCrawlerJobs = () => req(`/api/crawler/jobs`);
export const runCrawl = (sourceId) => req(`/api/crawler/run?sourceId=${sourceId}`, { method: "POST" });
