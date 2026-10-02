"use client";
import { useState } from "react";

export default function RequestRefresh({ model }) {
  const [token, setToken] = useState("");
  const { error, actionError, request, busy, refreshing, checkedAt, refresh, unlock } = model;
  return <section aria-label="Request updates" className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
    <div className="flex flex-wrap items-center gap-3 my-3">
      <button style={{ minHeight: 44 }} className="inline-flex items-center justify-center min-h-[44px] rounded border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={refreshing || busy} onClick={refresh}>{refreshing ? "Checking status…" : "Refresh status"}</button>
      {checkedAt && <span className="text-sm text-gray-600">Last checked {checkedAt.toLocaleTimeString()} · Updates every 20 seconds while this page is visible.</span>}
    </div>
    {error && <div className="p-3 my-3 border border-red-200 rounded bg-red-50 text-red-800" role="alert">{error}{request && <p>Updates are unavailable. The status below was last checked at {checkedAt?.toLocaleTimeString()}. Refresh before taking action.</p>}</div>}
    {actionError && <div className="p-3 my-3 border border-red-200 rounded bg-red-50 text-red-800" role="alert">{actionError}</div>}
    {!request && error && <form onSubmit={(e) => { e.preventDefault(); unlock(token); }}>
      <label htmlFor="bed-tracking-token">Private tracking token</label>
      <input style={{ fontSize: 16, minHeight: 44 }} className="block w-full rounded border border-gray-300 p-3 text-base mt-1 mb-3" id="bed-tracking-token" type="password" required autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
      <button style={{ minHeight: 44 }} className="inline-flex items-center justify-center min-h-[44px] rounded border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={refreshing || busy}>Open private request</button>
    </form>}
  </section>;
}
