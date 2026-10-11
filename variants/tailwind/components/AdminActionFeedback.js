"use client";
import Link from "next/link";

export default function AdminActionFeedback({ action, refresh }) {
  if (!action.message) return null;
  return <div role={action.kind === "error" ? "alert" : "status"} className={action.kind === "error" ? "rounded border border-red-200 bg-red-50 text-red-900 p-3 mb-3" : "rounded border border-green-200 bg-green-50 text-green-900 p-3 mb-3"}>
    <p>{action.message}</p>
    {action.message.includes("Sign in") && <Link href="/login">Sign in again</Link>}
    {action.uncertain && <div>
      {refresh && <button type="button" className="inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50" onClick={refresh}>Refresh current status</button>}
      <button type="button" className="inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50" onClick={action.acknowledge}>I checked the current status</button>
    </div>}
  </div>;
}
