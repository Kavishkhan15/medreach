"use client";
import { useState } from "react";

export default function RequestRefresh({ model }) {
  const [token, setToken] = useState("");
  const { error, actionError, request, busy, refreshing, checkedAt, refresh, unlock } = model;
  return <section aria-label="Request updates" className="card p-4 mb-3">
    <div className="d-flex flex-wrap align-items-center gap-3 my-3">
      <button style={{ minHeight: 44 }} className="btn btn-outline-secondary py-2" disabled={refreshing || busy} onClick={refresh}>{refreshing ? "Checking status…" : "Refresh status"}</button>
      {checkedAt && <span className="small text-secondary">Last checked {checkedAt.toLocaleTimeString()} · Updates every 20 seconds while this page is visible.</span>}
    </div>
    {error && <div className="alert alert-danger my-3" role="alert">{error}{request && <p>Updates are unavailable. The status below was last checked at {checkedAt?.toLocaleTimeString()}. Refresh before taking action.</p>}</div>}
    {actionError && <div className="alert alert-danger my-3" role="alert">{actionError}</div>}
    {!request && error && <form onSubmit={(e) => { e.preventDefault(); unlock(token); }}>
      <label htmlFor="bed-tracking-token">Private tracking token</label>
      <input style={{ fontSize: 16, minHeight: 44 }} className="form-control mb-3" id="bed-tracking-token" type="password" required autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
      <button style={{ minHeight: 44 }} className="btn btn-outline-secondary py-2" disabled={refreshing || busy}>Open private request</button>
    </form>}
  </section>;
}
