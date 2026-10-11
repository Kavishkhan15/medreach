"use client";
import { useAdminAccess, useAdminResource, loadAdminHospitals, adminList, useAdminAction, adminEntity, adminVerifyHospital } from "@medreach/core";
import { toneClass, statusPill, surface, btnPrimary, btnOutlineSecondary } from "../../../lib/tone";
import AdminDataState from "../../../components/AdminDataState";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
import AdminGuard from "../../../components/AdminGuard";

function Row({ hospital, refresh, action }) {
  const status = hospital.verificationStatus || "unverified";
  const act = (decision) => action.run(() => adminVerifyHospital(hospital._id, decision), {
    validate: adminEntity("hospital"), success: "Verification decision confirmed.", refresh,
  });
  return (
    <tr className="border-b border-[var(--color-border)]">
      <th scope="row" className="py-2 pr-3 font-semibold">{hospital.name}</th>
      <td className="py-2 pr-3 text-sm">{hospital.hospitalType}</td>
      <td className="py-2 pr-3"><span className={`${statusPill} ${status === "verified" ? toneClass.success : toneClass.warning}`}>{status}</span></td>
      <td className="py-2 pr-3">
        <div className="flex flex-wrap gap-1">
          <button className={`${btnPrimary} text-sm px-3 py-1`} disabled={action.disabled} onClick={() => act("approve")}>Approve</button>
          <button className={`${btnOutlineSecondary} text-sm px-3 py-1`} disabled={action.disabled} onClick={() => act("reject")}>Reject</button>
          <button className={`${btnOutlineSecondary} text-sm px-3 py-1`} disabled={action.disabled} onClick={() => act("mark_stale")}>Mark stale</button>
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
      <div className={surface}>
        <AdminDataState resource={resource} label="verification queue" empty={resource.status === "success" && queue.length === 0} emptyMessage="Nothing awaiting verification.">
          <div className="overflow-x-auto">
            <table className="w-full align-middle mb-0 text-left">
              <thead><tr className="border-b border-[var(--color-border)]"><th scope="col" className="py-2 pr-3">Hospital</th><th scope="col" className="py-2 pr-3">Type</th><th scope="col" className="py-2 pr-3">Status</th><th scope="col" className="py-2 pr-3">Action</th></tr></thead>
              <tbody>{queue.map((h) => <Row key={h._id || h.slug} hospital={h} refresh={resource.reload} action={action} />)}</tbody>
            </table>
          </div>
        </AdminDataState>
      </div>
    </AdminGuard>
  );
}
