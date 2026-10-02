"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { productApi } from "./productApi";

export function useBedRequest(id) {
  const [request, setRequest] = useState(null);
  const [notifications, setNotifications] = useState({ available: true, items: [] });
  const [permissions, setPermissions] = useState({});
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const locked = useRef(false);
  const sequence = useRef(0);
  const generation = useRef(0);
  const trackingHeaders = useCallback(() => {
    const token = window.sessionStorage.getItem(`medreach:emergency-request-token:${id}`);
    return token ? { "X-MedReach-Tracking-Token": token } : {};
  }, [id]);
  const refresh = useCallback(async () => {
    const check = ++sequence.current;
    const current = generation.current;
    setRefreshing(true);
    try {
      const result = await productApi(`/api/emergency-requests/${id}`, { headers: trackingHeaders() });
      if (current !== generation.current || check !== sequence.current) return;
      setRequest(result.request);
      setNotifications(result.notifications || { available: false, items: [] });
      setPermissions(result.permissions || {});
      setCheckedAt(new Date());
      setError("");
    } catch (e) {
      if (current !== generation.current || check !== sequence.current) return;
      if ([401, 403, 404].includes(e.status)) { setRequest(null); setNotifications({ available: false, items: [] }); }
      setError(e.message || "Could not load this request.");
    } finally {
      if (current === generation.current && check === sequence.current) setRefreshing(false);
    }
  }, [id, trackingHeaders]);
  useEffect(() => {
    generation.current += 1;
    setRequest(null); setError(""); setActionError("");
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (token) {
      window.sessionStorage.setItem(`medreach:emergency-request-token:${id}`, token);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    refresh();
    const update = () => { if (document.visibilityState === "visible" && !locked.current) refresh(); };
    const timer = setInterval(update, 20_000);
    document.addEventListener("visibilitychange", update);
    return () => { generation.current += 1; clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [id, refresh]);
  const change = async (status, note = "") => {
    if (locked.current || !request) return false;
    const current = generation.current;
    sequence.current += 1;
    locked.current = true; setBusy(true); setActionError("");
    try {
      const result = await productApi(`/api/emergency-requests/${id}`, { method: "PATCH", headers: trackingHeaders(),
        body: { status, expectedStatus: request.status, expectedTimelineLength: request.timeline.length, note } });
      if (current !== generation.current) return false;
      setRequest({ ...result.request, hospital: request.hospital });
      await refresh();
      return true;
    } catch (e) {
      if (current !== generation.current) return false;
      setActionError(e.message || "Could not update this request. Refresh and try again.");
      if (e.status === 409) await refresh();
      return false;
    } finally { locked.current = false; setBusy(false); }
  };
  const cancel = async () => {
    if (window.confirm("Cancel this bed request?")) await change("CANCELLED");
  };
  const unlock = async (token) => {
    window.sessionStorage.setItem(`medreach:emergency-request-token:${id}`, token.trim());
    await refresh();
  };
  return { request, notifications, permissions, error, actionError, busy, refreshing, checkedAt, refresh, change, cancel, unlock };
}
