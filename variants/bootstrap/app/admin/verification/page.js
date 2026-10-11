"use client";
import { useAdminAccess, useAdminResource, loadAdminHospitals, adminList, useAdminAction, adminEntity, adminVerifyHospital } from "@medreach/core";
import { toneClass } from "../../../lib/tone";
import AdminDataState from "../../../components/AdminDataState";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
import AdminGuard from "../../../components/AdminGuard";

function Row({ hospital, refresh, action }) {
  const status = hospital.verificationStatus || "unverified";
  const act = (decision) => action.run(() => adminVerifyHospital(hospital._id, decision), {
    validate: adminEntity("hospital"), success: "Verification decision confirmed.", refresh,
  });
  return (
    <tr>
      <th scope="row" className="fw-semibold">{hospital.name}</th>
      <td className="small">{hospital.hospitalType}</td>
      <td><span className={`status-pill ${status === "verified" ? toneClass.success : toneClass.warning}`}>{status}</span></td>
      <td>
        <div className="d-flex flex-wrap gap-1">
          <button className="btn btn-sm btn-primary" disabled={action.disabled} onClick={() => act("approve")}>Approve</button>
          <button className="btn btn-sm btn-outline-secondary" disabled={action.disabled} onClick={() => act("reject")}>Reject</button>
          <button className="btn btn-sm btn-outline-secondary" disabled={action.disabled} onClick={() => act("mark_stale")}>Mark stale</button>
        </div>
      </td>
    </tr>
  );
}

const validateHospitals = adminList("hospital");

export default function AdminVerificationPage() {
  const { allowed } = useAdminAccess();
  const resource = useAdminResource(loadAdminHospitals, validateHospitals, allowed);
  const data = resource.status === "success" ? resource.data : [];
  const action = useAdminAction();
  const queue = data.filter((h) => h.verificationStatus !== "verified" && h.approvalStatus !== "rejected");
  return (
    <AdminGuard title="Verification queue" subtitle="Review stored provider data before it is trusted. Every override is audit-logged.">
      <AdminActionFeedback action={action} refresh={resource.reload} />
      <div className="surface">
        <AdminDataState resource={resource} label="verification queue" empty={resource.status === "success" && queue.length === 0} emptyMessage="Nothing awaiting verification.">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th scope="col">Hospital</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
              <tbody>{queue.map((h) => <Row key={h._id || h.slug} hospital={h} refresh={resource.reload} action={action} />)}</tbody>
            </table>
          </div>
        </AdminDataState>
      </div>
    </AdminGuard>
  );
}
