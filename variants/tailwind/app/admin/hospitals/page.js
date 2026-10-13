"use client";
import Link from "next/link";
import { useAdminAccess, useAdminResource, loadAdminHospitals, adminList } from "@medreach/core";
import { surface, btnOutlineSecondary } from "../../../lib/tone";
import AdminDataState from "../../../components/AdminDataState";
import AdminGuard from "../../../components/AdminGuard";

const validateHospitals = adminList("hospital");

export default function AdminHospitalsPage() {
  const { allowed } = useAdminAccess();
  const resource = useAdminResource(loadAdminHospitals, validateHospitals, allowed);
  const data = resource.status === "success" ? resource.data : [];
  return (
    <AdminGuard title="Hospitals" subtitle="All tracked hospitals with status and type.">
      <div className={surface}>
        <AdminDataState resource={resource} label="hospitals" emptyMessage="No hospitals found.">
          <div className="overflow-x-auto">
            <table className="w-full align-middle mb-0 text-left">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="w-1/2 py-2 pr-3">Hospital</th>
                  <th scope="col" className="py-2 pr-3">Type</th>
                  <th scope="col" className="py-2 pr-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((h) => (
                  <tr key={h._id || h.slug} className="border-b border-[var(--color-border)]">
                    <th scope="row" className="py-2 pr-3 font-semibold">{h.name}</th>
                    <td className="py-2 pr-3 text-sm">{h.hospitalType}</td>
                    <td className="py-2 pr-3 text-right">
                      {["pending", "rejected"].includes(h.approvalStatus) ? (
                        <span>Unpublished · {h.approvalStatus}</span>
                      ) : (
                        <Link className={`${btnOutlineSecondary} text-sm px-3 py-1`} href={`/hospitals/${h.slug}`}>
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminDataState>
      </div>
    </AdminGuard>
  );
}
