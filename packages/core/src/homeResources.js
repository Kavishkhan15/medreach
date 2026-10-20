"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const endpoints = {
  "blood-banks": "/api/blood-banks",
  diagnostics: "/api/diagnostics",
  ambulances: "/api/ambulances",
  campaigns: "/api/blood-banks/campaigns?status=active",
  jobs: "/api/jobs?view=summary",
};
const directoryKeys = ["blood-banks", "diagnostics", "ambulances"];
const initial = value => Object.fromEntries(Object.keys(endpoints).map(key => [key, typeof value === "function" ? value() : value]));

// Shared data orchestration; each variant retains its own markup and styles.
export function useHomeResources(load) {
  const [resources, setResources] = useState(() => initial(() => []));
  const [resourceLoading, setLoading] = useState(() => initial(true));
  const [resourceErrors, setErrors] = useState(() => initial(""));
  const requests = useRef({});
  const careersRef = useRef(null);
  const campaignsRef = useRef(null);
  const retryResource = useCallback(async key => {
    if (!endpoints[key]) return;
    requests.current[key]?.abort();
    const controller = new AbortController();
    requests.current[key] = controller;
    setLoading(previous => ({ ...previous, [key]: true }));
    setErrors(previous => ({ ...previous, [key]: "" }));
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => { controller.abort(); reject(new Error("Request timed out")); }, 15000);
    });
    try {
      const response = await Promise.race([load(endpoints[key], { signal: controller.signal }), deadline]);
      const rows = response?.data;
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object")) {
        throw new Error("Unexpected listing response. Please retry.");
      }
      if (requests.current[key] === controller && !controller.signal.aborted) {
        setResources(previous => ({ ...previous, [key]: rows }));
      }
    } catch (error) {
      if (requests.current[key] === controller) {
        setErrors(previous => ({ ...previous, [key]: controller.signal.aborted
          ? "This request took too long. Please retry." : error.message || "Temporarily unavailable." }));
      }
    } finally {
      clearTimeout(timeout);
      if (requests.current[key] === controller) setLoading(previous => ({ ...previous, [key]: false }));
    }
  }, [load]);
  useEffect(() => {
    const active = requests.current;
    directoryKeys.forEach(retryResource);
    const deferred = new Map([[careersRef.current, "jobs"], [campaignsRef.current, "campaigns"]].filter(([node]) => node));
    let observer;
    if (typeof IntersectionObserver === "undefined") {
      [...deferred.values()].forEach(retryResource);
    } else {
      observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          retryResource(deferred.get(entry.target));
          observer.unobserve(entry.target);
        }
      }), { rootMargin: "300px" });
      for (const node of deferred.keys()) observer.observe(node);
    }
    return () => {
      observer?.disconnect();
      for (const [key, controller] of Object.entries(active)) { delete active[key]; controller.abort(); }
    };
  }, [retryResource]);
  return { resources, resourceErrors, resourceLoading, retryResource, careersRef, campaignsRef,
    resourcesLoading: directoryKeys.some(key => resourceLoading[key]) };
}
