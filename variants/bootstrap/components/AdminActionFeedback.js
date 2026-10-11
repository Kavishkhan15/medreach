"use client";
import Link from "next/link";

export default function AdminActionFeedback({ action, refresh }) {
  if (!action.message) return null;
  return <div role={action.kind === "error" ? "alert" : "status"} className={action.kind === "error" ? "alert alert-danger" : "alert alert-success"}>
    <p>{action.message}</p>
    {action.message.includes("Sign in") && <Link href="/login">Sign in again</Link>}
    {action.uncertain && <div>
      {refresh && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={refresh}>Refresh current status</button>}
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={action.acknowledge}>I checked the current status</button>
    </div>}
  </div>;
}
