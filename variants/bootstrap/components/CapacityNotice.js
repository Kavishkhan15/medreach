"use client";
import { useEffect, useState } from "react";

export default function CapacityNotice({ record, resource = "resource" }) {
  const allocation = record?.capacityAllocation;
  const expiresAt = allocation?.expiresAt ? new Date(allocation.expiresAt).getTime() : NaN;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(expiresAt - Date.now() + 1, 2147483647));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const elapsed = Number.isFinite(expiresAt) && expiresAt <= now;
  const mode = allocation?.mode === "held" && elapsed ? "expired" : allocation?.mode || "coordination";
  const messages = {
    coordination: `This is a coordination request. No ${resource} has been reserved; the provider must confirm availability.`,
    held: `A temporary ${resource} hold is recorded. Provider confirmation is still required.`,
    confirmed: `The provider confirmed this ${resource} reservation. Follow its instructions for the next step.`,
    admitted: "Admission is recorded. This bed is occupied until the provider records discharge.",
    discharged: "Discharge is recorded and this bed allocation has ended.",
    issued: "The blood bank recorded these units as issued. They are no longer available stock.",
    completed: `This ${resource} allocation is completed.`,
    released: `This ${resource} hold has been released. It no longer reserves capacity.`,
    expired: `The temporary ${resource} hold has expired. Refresh the request and contact the provider before making arrangements.`,
  };
  return <div className={`alert ${mode === "held" || mode === "confirmed" ? "alert-info" : "alert-secondary"}`} role="status">
    <p className="mb-0">{messages[mode] || messages.coordination}</p>
    {mode === "held" && Number.isFinite(expiresAt) && <p className="mb-0 mt-2"><strong>Hold expires:</strong> {new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST. A request retry does not extend this deadline.</p>}
  </div>;
}
