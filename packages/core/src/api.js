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
export const listCrawlerJobs = (params = {}) =>
  req(`/api/crawler/jobs?${new URLSearchParams(clean(params))}`);
export const runCrawl = (sourceId, { dryRun } = {}) =>
  req(`/api/crawler/run?${new URLSearchParams(clean({ sourceId, dryRun }))}`, { method: "POST" });

// --- Crawler admin dashboard (registry-approved sources only) ---
export const crawlerOverview = () => req(`/api/crawler/overview`);
export const crawlerSources = () => req(`/api/crawler/sources`);
export const crawlerJob = (id) => req(`/api/crawler/jobs/${id}`);
export const crawlerResults = () => req(`/api/crawler/results`);
export const crawlerDataQuality = () => req(`/api/crawler/data-quality`);
export const crawlerVerificationQueue = () => req(`/api/crawler/verification-queue`);
export const facilityClaims = () => req(`/api/admin/facility-claims`);
export const dataConflicts = (status = "all") =>
  req(`/api/admin/data-conflicts?${new URLSearchParams({ status })}`);
export const reviewFacilityClaim = (id, decision) =>
  req(`/api/admin/facility-claims/${id}/review`, { method: "POST", body: JSON.stringify({ decision }) });
export const hospitalFieldClaims = () => req(`/api/admin/hospital-field-claims`);
export const hospitalFieldConflicts = () => req(`/api/admin/hospital-field-conflicts`);
export const reviewHospitalFieldClaim = (id, decision) =>
  req(`/api/admin/hospital-field-claims/${id}/review`, { method: "POST", body: JSON.stringify({ decision }) });
export const crawlerRunAll = ({ dryRun } = {}) =>
  req(`/api/crawler/run-all?${new URLSearchParams(clean({ dryRun }))}`, { method: "POST" });
export const crawlerUpdateSource = (sourceKey, body) =>
  req(`/api/crawler/sources/${sourceKey}`, { method: "PATCH", body: JSON.stringify(clean(body)) });
export const crawlerResetSource = (sourceKey) =>
  req(`/api/crawler/sources/${sourceKey}/reset`, { method: "POST" });
export const crawlerRetryJob = (id) => req(`/api/crawler/jobs/${id}/retry`, { method: "POST" });
export const crawlerSetScheduler = (paused) =>
  req(`/api/crawler/scheduler`, { method: "POST", body: JSON.stringify({ paused }) });

// AI Assistant — public, rate-limited. Never sends precise location unless the
// caller explicitly passes origin (from useLocation, which never persists it).
export const sendAssistantMessage = (message, { locality, origin } = {}) =>
  req(`/api/assistant/message`, {
    method: "POST",
    body: JSON.stringify(clean({ message, locality, origin })),
  });
