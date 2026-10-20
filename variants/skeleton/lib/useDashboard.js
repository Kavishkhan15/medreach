"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { productApi } from "./productApi";

const endpoints = {
  profile: "/api/auth/me",
  requests: "/api/emergency-requests",
  blood: "/api/blood-requests",
  ambulance: "/api/ambulances/bookings",
  applications: "/api/applications/mine",
};
const initialSection = () => ({ data: null, loading: true, error: "", status: null });

export function useDashboard() {
  const [sections, setSections] = useState(() => Object.fromEntries(Object.keys(endpoints).map((key) => [key, initialSection()])));
  const generations = useRef({ profile: 0, requests: 0, blood: 0, ambulance: 0, applications: 0 });
  const retry = useCallback(async (key) => {
    const generation = ++generations.current[key];
    setSections((previous) => ({ ...previous, [key]: { ...previous[key], loading: true, error: "", status: null } }));
    try {
      const result = await productApi(endpoints[key]);
      const data = key === "profile" ? result?.user : result?.data;
      if (key === "profile" ? !data || typeof data !== "object" || Array.isArray(data) : !Array.isArray(data)
        || data.some(row => !row || typeof row !== "object" || (typeof row._id !== "string" && typeof row.reference !== "string"))) {
        throw new Error("This section returned an unexpected response. Please retry.");
      }
      if (generation !== generations.current[key]) return;
      setSections((previous) => ({ ...previous, [key]: { data, loading: false, error: "", status: null } }));
    } catch (error) {
      if (generation !== generations.current[key]) return;
      setSections((previous) => ({ ...previous, [key]: { ...previous[key], loading: false, error: error.message || "Could not load this section.", status: error.status } }));
    }
  }, []);
  useEffect(() => {
    Object.keys(endpoints).forEach(retry);
    const gens = generations.current;
    return () => { Object.keys(endpoints).forEach((key) => { gens[key] += 1; }); };
  }, [retry]);
  return { ...sections, retry };
}
