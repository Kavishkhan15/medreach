const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export async function productApi(path, options = {}, retried = false) {
  const response = await fetch(`${BASE}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !retried && path !== "/api/auth/refresh") {
    const refreshed = await fetch(`${BASE}/api/auth/refresh`, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" } });
    if (refreshed.ok) return productApi(path, options, true);
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
export const post = (path, body) => productApi(path, { method: "POST", body });
export const patch = (path, body) => productApi(path, { method: "PATCH", body });
