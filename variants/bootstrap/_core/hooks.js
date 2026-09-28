"use client";
// Headless React hooks — data + state only, ZERO markup. Every variant uses these
// identical hooks and supplies its own UI, so behavior is held constant.

import { useState, useEffect, useCallback, useMemo } from "react";
import * as api from "./api.js";
import { searchHospitals } from "./search.js";
import { getBrowserLocation, localityToCoords } from "./location.js";

// System data mode. API failures are surfaced instead of substituting fixture data.
export function useSystemStatus() {
  const [mode, setMode] = useState("checking"); // checking | live | unavailable
  useEffect(() => {
    let active = true;
    api
      .health()
      .then(() => active && setMode("live"))
      .catch(() => active && setMode("unavailable"));
    return () => { active = false; };
  }, []);
  return { mode, isUnavailable: mode === "unavailable", isLive: mode === "live" };
}

// Unified hospital search/filter/sort/rank using backend data only.
export function useHospitals(filters = {}, options = {}) {
  const key = useMemo(() => JSON.stringify({ filters, options }), [filters, options]);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, data: [], total: 0, offline: false, error: "" });
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api
      .listHospitals(filters)
      .then((r) => {
        // Re-rank/sort client-side so ranking is identical to demo mode.
        const data = searchHospitals(r.data || [], filters, options);
        if (active) setState({ loading: false, data, total: data.length, offline: false, error: "" });
      })
      .catch((error) => {
        if (active) setState({
          loading: false,
          data: [],
          total: 0,
          offline: true,
          error: error?.message || "Hospital data is temporarily unavailable.",
        });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);

  return { ...state, retry };
}

// One hospital by slug, using backend data only.
export function useHospital(slug) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, hospital: null, notFound: false, offline: false, error: "" });
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "", notFound: false }));
    api
      .getHospital(slug)
      .then((r) => active && setState({ loading: false, hospital: r.hospital, notFound: false, offline: false, error: "" }))
      .catch((error) => {
        const message = error?.message || "Hospital details are temporarily unavailable.";
        const notFound = /not found/i.test(message);
        if (active) setState({ loading: false, hospital: null, notFound, offline: true, error: notFound ? "" : message });
      });
    return () => { active = false; };
  }, [slug, revision]);
  return { ...state, retry };
}

// Location state: browser GPS (on demand) or manual locality. Never persisted.
export function useLocation() {
  const [origin, setOrigin] = useState(null); // { lat, lng }
  const [label, setLabel] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | locating | ready | error
  const [error, setError] = useState(null);

  const useGps = useCallback(async () => {
    setStatus("locating"); setError(null);
    try {
      const c = await getBrowserLocation();
      setOrigin(c); setLabel("Your location"); setStatus("ready");
      return c;
    } catch (e) {
      setError(e.message); setStatus("error"); throw e;
    }
  }, []);

  const useLocality = useCallback((locality) => {
    const c = localityToCoords(locality);
    if (c) { setOrigin(c); setLabel(locality); setStatus("ready"); }
    return c;
  }, []);

  const clear = useCallback(() => { setOrigin(null); setLabel(null); setStatus("idle"); }, []);

  return { origin, label, status, error, useGps, useLocality, clear };
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => api.me().then((r) => { if (active) setUser(r.user); })
      .catch(() => { if (active) setUser(null); }).finally(() => { if (active) setReady(true); });
    refresh();
    window.addEventListener("medreach:auth-changed", refresh);
    return () => { active = false; window.removeEventListener("medreach:auth-changed", refresh); };
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.login(email, password); setUser(r.user); window.dispatchEvent(new Event("medreach:auth-changed")); return r.user;
  }, []);
  const register = useCallback(async (payload) => {
    const r = await api.register(payload); setUser(r.user); window.dispatchEvent(new Event("medreach:auth-changed")); return r;
  }, []);
  const logout = useCallback(async () => { await api.logout(); setUser(null); window.dispatchEvent(new Event("medreach:auth-changed")); }, []);

  const isAdmin = ["admin", "system_admin", "hospital_admin"].includes(user?.role);
  return { user, ready, loading: !ready, login, register, logout, isAdmin };
}

export function useAdminAccess(systemOnly = false) {
  const { user, ready, isAdmin } = useAuth();
  return { ready, allowed: systemOnly
    ? user?.role === "system_admin"
    : isAdmin };
}

// AI Assistant chat state. Headless — owns the message list, sending state,
// session persistence, modal states, and fallback flags.
export function useAssistant() {
  const SESSION_KEY = "medreach_assistant_session_v1";

  const [messages, setMessages] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.sessionStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [sending, setSending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Modal integration states for in-chat actions
  const [activeModal, setActiveModal] = useState(null); // 'ambulance' | 'blood' | null
  const [modalData, setModalData] = useState(null);

  // Sync to sessionStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (messages.length > 0) {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages.slice(-20)));
      } else {
        window.sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {}
  }, [messages]);

  const send = useCallback(async (text, { locality, origin } = {}) => {
    const trimmed = (text || "").trim();
    if (!trimmed || sending) return;

    const userMsg = {
      id: "u_" + Date.now(),
      role: "user",
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const r = await api.sendAssistantMessage(trimmed, { locality, origin });
      setUnavailable(Boolean(r.unavailable));

      const botMsg = {
        id: "a_" + Date.now(),
        role: "assistant",
        text: r.reply,
        intent: r.intent || "general",
        source: r.source || "ai",
        hospitals: r.hospitals || [],
        bloodBanks: r.bloodBanks || [],
        diagnostics: r.diagnostics || [],
        ambulances: r.ambulances || [],
        jobs: r.jobs || [],
        suggestedActions: r.suggestedActions || [],
        suggestedPrompts: r.suggestedPrompts || [],
        locality: r.locality || null,
        category: r.category || null,
        bloodGroup: r.bloodGroup || null,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setUnavailable(true);
      setMessages((prev) => [
        ...prev,
        {
          id: "err_" + Date.now(),
          role: "assistant",
          text: "AI assistant is temporarily unavailable. For emergency medical help, please dial 112 or 108 immediately.",
          intent: "unavailable",
          hospitals: [],
          bloodBanks: [],
          diagnostics: [],
          ambulances: [],
          jobs: [],
          suggestedActions: [
            { type: "call", label: "Call 112", phone: "112", primary: true },
            { type: "call", label: "Call 108", phone: "108" },
          ],
          suggestedPrompts: [],
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [sending]);

  const reset = useCallback(() => {
    setMessages([]);
    setUnavailable(false);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(SESSION_KEY);
      } catch {}
    }
  }, []);

  const openAmbulanceModal = useCallback((provider) => {
    setModalData(provider);
    setActiveModal("ambulance");
  }, []);

  const openBloodModal = useCallback((bloodBank) => {
    setModalData(bloodBank);
    setActiveModal("blood");
  }, []);

  const closeModals = useCallback(() => {
    setActiveModal(null);
    setModalData(null);
  }, []);

  return {
    messages,
    sending,
    unavailable,
    send,
    reset,
    activeModal,
    modalData,
    openAmbulanceModal,
    openBloodModal,
    closeModals,
  };
}

// Crawler admin dashboard state — headless. Owns overview cards, source list,
// jobs, data-quality, verification queue, the scheduler flag, and every control
// action (run/run-all/enable/disable/frequency/rate/reset/retry/verify). Every
// variant uses this identical hook and only supplies its own markup + CSS, so
// the admin behavior is held constant across the three frameworks under test.
export function useCrawlerAdmin() {
  const [overview, setOverview] = useState(null);
  const [sources, setSources] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [quality, setQuality] = useState(null);
  const [queue, setQueue] = useState([]);
  const [claims, setClaims] = useState([]);
  const [claimsAvailable, setClaimsAvailable] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [conflictsAvailable, setConflictsAvailable] = useState(false);
  const [fieldClaims, setFieldClaims] = useState([]);
  const [fieldConflicts, setFieldConflicts] = useState([]);
  const [fieldsAvailable, setFieldsAvailable] = useState(false);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [ov, sr, jb, dq, vq, fc, dc, hc, hd] = await Promise.all([
        api.crawlerOverview(), api.crawlerSources(), api.listCrawlerJobs({ limit: 40 }),
        api.crawlerDataQuality(), api.crawlerVerificationQueue(),
        api.facilityClaims().catch(() => ({ data: null })),
        api.dataConflicts("all").catch(() => ({ data: null })),
        api.hospitalFieldClaims().catch(() => ({ data: null })),
        api.hospitalFieldConflicts().catch(() => ({ data: null })),
      ]);
      setOverview(ov); setSources(sr.data || []); setPaused(Boolean(sr.schedulerPaused));
      setJobs(jb.data || []); setQuality(dq); setQueue(vq.data || []); setLive(true);
      setClaims(fc.data || []); setClaimsAvailable(Array.isArray(fc.data));
      setConflicts(dc.data || []); setConflictsAvailable(Array.isArray(dc.data));
      setFieldClaims(hc.data || []); setFieldConflicts(hd.data || []);
      setFieldsAvailable(Array.isArray(hc.data) && Array.isArray(hd.data));
    } catch {
      setLive(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Wrap any control action with busy/message state + auto-refresh. Errors are
  // surfaced to the UI, never silently swallowed.
  const act = useCallback(async (label, fn) => {
    setBusy(label); setMessage("");
    try {
      const r = await fn();
      setMessage(`${label} done`);
      await refresh();
      return r;
    } catch (e) {
      setMessage(`${label}: ${e.message}`);
    } finally {
      setBusy("");
    }
  }, [refresh]);

  const actions = useMemo(() => ({
    runAll: () => act("Run all", () => api.crawlerRunAll()),
    dryRunAll: () => act("Dry-run all", () => api.crawlerRunAll({ dryRun: true })),
    setScheduler: (nextPaused) =>
      act(nextPaused ? "Pause scheduler" : "Resume scheduler", () => api.crawlerSetScheduler(nextPaused)),
    runSource: (sourceId, key) => act(`Run ${key}`, () => api.runCrawl(sourceId)),
    dryRunSource: (sourceId, key) => act(`Dry-run ${key}`, () => api.runCrawl(sourceId, { dryRun: true })),
    toggleSource: (key, enabled) =>
      act(`${enabled ? "Disable" : "Enable"} ${key}`, () => api.crawlerUpdateSource(key, { enabled: !enabled })),
    setFrequency: (key, minutes) =>
      act(`Set frequency ${key}`, () => api.crawlerUpdateSource(key, { crawlFrequencyMs: Number(minutes) * 60000 })),
    resetSource: (key) => act(`Reset ${key}`, () => api.crawlerResetSource(key)),
    retryJob: (id) => act("Retry job", () => api.crawlerRetryJob(id)),
    approve: (id) => act("Approve", () => api.adminVerifyHospital(id, "approve")),
    reject: (id) => act("Reject", () => api.adminVerifyHospital(id, "reject")),
    reviewClaim: (id, decision) => act(`${decision} facility claim`, () => api.reviewFacilityClaim(id, decision)),
    reviewFieldClaim: (id, decision) => act(`${decision} hospital field claim`, () => api.reviewHospitalFieldClaim(id, decision)),
  }), [act]);

  return { overview, sources, jobs, quality, queue, claims, claimsAvailable,
    conflicts, conflictsAvailable, fieldClaims, fieldConflicts, fieldsAvailable,
    paused, live, busy, message, refresh, actions };
}
