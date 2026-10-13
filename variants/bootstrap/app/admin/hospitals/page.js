"use client";
import Link from "next/link";
import { useAdminAccess, useAdminResource, loadAdminHospitals, adminList } from "@medreach/core";
import AdminDataState from "../../../components/AdminDataState";
import AdminGuard from "../../../components/AdminGuard";

const validateHospitals = adminList("hospital");

export default function AdminHospitalsPage() {
  const { allowed } = useAdminAccess();
  const resource = useAdminResource(loadAdminHospitals, validateHospitals, allowed);
  const data = resource.status === "success" ? resource.data : [];
  return (
    <AdminGuard title="Hospitals" subtitle="All tracked hospitals with status and type.">
      <div className="surface">
        <AdminDataState resource={resource} label="hospitals" emptyMessage="No hospitals found.">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col" className="w-50">Hospital</th>
                  <th scope="col" className="w-25">Type</th>
                  <th scope="col" className="text-end"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((h) => (
                  <tr key={h._id || h.slug}>
                    <th scope="row" className="fw-semibold">{h.name}</th>
                    <td className="small">{h.hospitalType}</td>
                    <td className="text-end">
                      {["pending", "rejected"].includes(h.approvalStatus) ? (
                        <span>Unpublished · {h.approvalStatus}</span>
                      ) : (
                        <Link className="btn btn-sm btn-outline-secondary" href={`/hospitals/${h.slug}`}>
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
