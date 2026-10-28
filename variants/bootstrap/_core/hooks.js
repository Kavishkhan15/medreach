"use client";
// Headless React hooks — data + state only, ZERO markup. Every variant uses these
// identical hooks and supplies its own UI, so behavior is held constant.

import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { canAccessAdmin } from "./constants.js";
import * as api from "./api.js";
import { createAuthSession } from "./authSession.js";
import { searchHospitals } from "./search.js";
import { getBrowserLocation, localityToCoords } from "./location.js";

const authSession = createAuthSession(api);
const handledAuthEvents = new WeakSet();
const serverAuthSnapshot = { user: null, ready: false };

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
export function useDebouncedValue(value, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function useHospitals(inputFilters = {}, options = {}) {
  const query = useDebouncedValue(inputFilters.q || "");
  const filters = { ...inputFilters, q: query };
  const key = JSON.stringify({ filters, options });
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, data: [], total: 0, offline: false, error: "" });
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    const controller = new AbortController();
    api
      .listHospitals(filters, { signal: controller.signal })
      .then((r) => {
        // Rank the returned records consistently across frontend variants.
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
    return () => { active = false; controller.abort(); };
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
  const { user, ready } = useSyncExternalStore(authSession.subscribe,
    authSession.getSnapshot, () => serverAuthSnapshot);
  useEffect(() => {
    authSession.refresh();
    const refresh = (event) => {
      if (handledAuthEvents.has(event)) return;
      handledAuthEvents.add(event);
      authSession.invalidate();
      authSession.refresh(true);
    };
    const visible = (event) => { if (document.visibilityState === "visible") refresh(event); };
    window.addEventListener("medreach:auth-changed", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("medreach:auth-changed", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const login = useCallback(async (email, password, verification = {}) => {
    const result = await api.login(email, password, verification);
    authSession.setUser(result.user);
    return result.user;
  }, []);
  const register = useCallback(async (payload) => {
    const result = await api.register(payload);
    if (result.user) authSession.setUser(result.user);
    return result;
  }, []);
  const logout = useCallback(async () => {
    await api.logout();
    authSession.setUser(null);
  }, []);

  const isAdmin = ["system_admin", "provider_admin"].includes(user?.role);
  return { user, ready, loading: !ready, login, register, logout, isAdmin };
}

export function useAdminAccess() {
  const { user, ready } = useAuth();
  return { ready, allowed: canAccessAdmin(user?.role) };
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

export {
  calculateScrollProgress,
  mapProgressToTransform,
  attachFooterScrollDriver,
  useFooterScrollAnimation,
} from "./scrollAnimation.js";
