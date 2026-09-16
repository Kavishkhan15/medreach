import { env } from "../config/env.js";

function validPoint(point) {
  return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) &&
    Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180;
}

export async function getRoute(origin, destination) {
  if (!validPoint(origin) || !validPoint(destination)) throw new Error("Valid coordinates required");
  if (env.routingProvider === "none") return { configured: false, routeDistanceKm: null, durationMinutes: null };
  if (env.routingProvider !== "osrm" || !env.routingBaseUrl) return { configured: false, routeDistanceKm: null, durationMinutes: null };
  const base = new URL(env.routingBaseUrl);
  if (base.protocol !== "https:" && !(env.nodeEnv !== "production" && base.hostname === "localhost")) {
    throw new Error("Routing URL must use HTTPS");
  }
  const path = `/route/v1/driving/${Number(origin.lng)},${Number(origin.lat)};${Number(destination.lng)},${Number(destination.lat)}`;
  const url = new URL(path, base);
  url.searchParams.set("overview", "false");
  const response = await fetch(url, { headers: env.routingApiKey ? { Authorization: `Bearer ${env.routingApiKey}` } : {}, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Routing provider unavailable");
  const data = await response.json();
  const route = data.routes?.[0];
  if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return { configured: true, routeDistanceKm: null, durationMinutes: null };
  return { configured: true, routeDistanceKm: Math.round(route.distance / 100) / 10,
    durationMinutes: Math.max(1, Math.round(route.duration / 60)), provider: "osrm" };
}
