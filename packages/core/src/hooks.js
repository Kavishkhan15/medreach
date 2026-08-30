"use client";
// Headless React hooks — data + state only, ZERO markup. Every variant uses these
// identical hooks and supplies its own UI, so behavior is held constant.

import { useState, useEffect, useCallback, useMemo } from "react";
import * as api from "./api.js";
import { fixtures } from "./fixtures.js";
import { searchHospitals } from "./search.js";
import { getBrowserLocation, localityToCoords } from "./location.js";

// System data mode: are we showing LIVE backend data or DEMO fixtures?
// "checking" → "live" → or "demo" (API unreachable). Exposed so the UI can show
// an honest, prominent banner and never misrepresent demo data as live.
export function useSystemStatus() {
  const [mode, setMode] = useState("checking"); // checking | live | demo
  useEffect(() => {
    let active = true;
    api
      .health()
      .then(() => active && setMode("live"))
      .catch(() => active && setMode("demo"));
    return () => { active = false; };
  }, []);
  return { mode, isDemo: mode === "demo", isLive: mode === "live" };
}

// Unified hospital search/filter/sort/rank. Runs against the API when available,
// falls back to fixtures. The SAME searchHospitals() logic runs in both modes.
export function useHospitals(filters = {}, options = {}) {
  const key = useMemo(() => JSON.stringify({ filters, options }), [filters, options]);
  const [state, setState] = useState({ loading: true, data: [], total: 0, offline: false });

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    api
      .listHospitals(filters)
      .then((r) => {
        // Re-rank/sort client-side so ranking is identical to demo mode.
        const data = searchHospitals(r.data || [], filters, options);
        if (active) setState({ loading: false, data, total: data.length, offline: false });
      })
      .catch(() => {
        const data = searchHospitals(fixtures, filters, options);
        if (active) setState({ loading: false, data, total: data.length, offline: true });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

// One hospital by slug, with fixture fallback.
export function useHospital(slug) {
  const [state, setState] = useState({ loading: true, hospital: null, notFound: false, offline: false });
  useEffect(() => {
    let active = true;
    api
      .getHospital(slug)
      .then((r) => active && setState({ loading: false, hospital: r.hospital, notFound: false, offline: false }))
      .catch(() => {
        const h = fixtures.find((x) => x.slug === slug);
        if (active) setState({ loading: false, hospital: h || null, notFound: !h, offline: true });
      });
    return () => { active = false; };
  }, [slug]);
  return state;
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
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.login(email, password); setUser(r.user); return r.user;
  }, []);
  const register = useCallback(async (payload) => {
    const r = await api.register(payload); setUser(r.user); return r.user;
  }, []);
  const logout = useCallback(async () => { await api.logout(); setUser(null); }, []);

  const isAdmin = ["admin", "system_admin", "hospital_admin"].includes(user?.role);
  return { user, ready, login, register, logout, isAdmin };
}
