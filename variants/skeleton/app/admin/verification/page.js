"use client";
import { useState } from "react";
import { useHospitals, adminVerifyHospital } from "@medreach/core";
import { toneClass } from "../../../lib/tone";
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
    <tr>
      <th scope="row" className="fw-semibold">{hospital.name}</th>
      <td className="small">{hospital.hospitalType}</td>
      <td><span className={`status-pill ${status === "verified" ? toneClass.success : toneClass.warning}`}>{status}</span></td>
      <td>
        <div className="flex flex-wrap items-center gap-1">
          <button className="btn btn-sm btn-primary" onClick={() => act("approve")}>Approve</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => act("reject")}>Reject</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => act("mark_stale")}>Mark stale</button>
          <span className="small text-secondary">{msg}</span>
        </div>
      </td>
    </tr>
  );
}

export default function AdminVerificationPage() {
  const { data, loading } = useHospitals({}, { sort: "updated" });
  const queue = data.filter((h) => h.verificationStatus !== "verified");
  return (
    <AdminGuard title="Verification queue" subtitle="Review crawler-discovered data before it is trusted. Every override is audit-logged.">
      <div className="surface">
        {loading ? <p className="text-secondary">Loading…</p> : queue.length === 0 ? (
          <p className="mb-0 text-secondary">Nothing awaiting verification.</p>
        ) : (
          <div className="table-responsive">
            <table className="table mb-0">
              <thead><tr><th scope="col">Hospital</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
              <tbody>{queue.map((h) => <Row key={h._id || h.slug} hospital={h} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
