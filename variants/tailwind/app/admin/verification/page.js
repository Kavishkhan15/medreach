"use client";
import { useState } from "react";
import { useHospitals, adminVerifyHospital } from "@medreach/core";
import { toneClass, statusPill, surface, btnPrimary, btnOutlineSecondary } from "../../../lib/tone";
import AdminGuard from "../../../components/AdminGuard";

function Row({ hospital }) {
  const [status, setStatus] = useState(hospital.verificationStatus || "unverified");
  const [msg, setMsg] = useState("");
  const act = async (decision) => {
    try {
      await adminVerifyHospital(hospital._id, decision);
      setStatus(decision === "reject" ? "rejected" : decision === "mark_stale" ? "stale" : "verified");
      setMsg("saved");
    } catch { setMsg("requires live backend + admin"); }
  };
  return (
    <tr className="border-b border-[var(--color-border)]">
      <th scope="row" className="py-2 pr-3 font-semibold">{hospital.name}</th>
      <td className="py-2 pr-3 text-sm">{hospital.hospitalType}</td>
      <td className="py-2 pr-3"><span className={`${statusPill} ${status === "verified" ? toneClass.success : toneClass.warning}`}>{status}</span></td>
      <td className="py-2 pr-3">
        <div className="flex flex-wrap gap-1">
          <button className={`${btnPrimary} text-sm px-3 py-1`} onClick={() => act("approve")}>Approve</button>
          <button className={`${btnOutlineSecondary} text-sm px-3 py-1`} onClick={() => act("reject")}>Reject</button>
          <button className={`${btnOutlineSecondary} text-sm px-3 py-1`} onClick={() => act("mark_stale")}>Mark stale</button>
          <span className="text-sm text-[var(--color-muted)] self-center">{msg}</span>
        </div>
      </td>
    </tr>
  );
}

export default function AdminVerificationPage() {
  const { data, loading } = useHospitals({}, { sort: "updated" });
  const queue = data.filter((h) => h.verificationStatus !== "verified");
  return (
    <AdminGuard title="Verification queue" subtitle="Review stored provider data before it is trusted. Every override is audit-logged.">
      <div className={surface}>
        {loading ? <p className="text-[var(--color-muted)]">Loading…</p> : queue.length === 0 ? (
          <p className="mb-0 text-[var(--color-muted)]">Nothing awaiting verification.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full align-middle mb-0 text-left">
              <thead><tr className="border-b border-[var(--color-border)]"><th scope="col" className="py-2 pr-3">Hospital</th><th scope="col" className="py-2 pr-3">Type</th><th scope="col" className="py-2 pr-3">Status</th><th scope="col" className="py-2 pr-3">Action</th></tr></thead>
              <tbody>{queue.map((h) => <Row key={h._id || h.slug} hospital={h} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
