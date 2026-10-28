"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Keep emergency controls available while assistant code loads on idle or demand. */
export default function DeferredHealthcareAssistant() {
  const [Assistant, setAssistant] = useState(null);
  const [failed, setFailed] = useState(false);
  const pending = useRef([]);
  const ready = useRef(false);
  const active = useRef(false);
  const loading = useRef(null);
  const load = useCallback(() => {
    if (!loading.current) loading.current = import("./HealthcareAssistant").then(module => {
      if (active.current) { setAssistant(() => module.default); setFailed(false); }
    }).catch(() => { loading.current = null; if (active.current) setFailed(true); });
    return loading.current;
  }, []);
  const onReady = useCallback(() => {
    ready.current = true;
    for (const detail of pending.current.splice(0)) window.dispatchEvent(new CustomEvent("medreach:open-assistant", { detail }));
  }, []);
  useEffect(() => {
    active.current = true;
    const onOpen = event => {
      if (ready.current) return;
      pending.current.push({ query: typeof event.detail?.query === "string" ? event.detail.query : "" });
      load();
    };
    window.addEventListener("medreach:open-assistant", onOpen);
    const idle = typeof window.requestIdleCallback === "function";
    const scheduled = idle ? window.requestIdleCallback(load, { timeout: 1500 }) : window.setTimeout(load, 0);
    return () => {
      active.current = false; ready.current = false;
      window.removeEventListener("medreach:open-assistant", onOpen);
      if (idle) window.cancelIdleCallback(scheduled); else window.clearTimeout(scheduled);
    };
  }, [load]);
  return <>{Assistant && <Assistant onReady={onReady} />}{failed && <div className="alert alert-light border position-fixed bottom-0 end-0 m-3" role="alert" style={{ zIndex: 1060 }}>Assistant could not load. <button className="btn btn-sm btn-outline-secondary" type="button" onClick={load}>Retry</button> <a href="/emergency">Open emergency care</a></div>}</>;
}
