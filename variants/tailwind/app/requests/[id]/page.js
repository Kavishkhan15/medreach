"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@medreach/core";
import { EmergencyIcon } from "../../../components/EmergencyIcons";
import { useBedRequest } from "../../../lib/useBedRequest";
import RequestLifecycle from "../../../components/RequestLifecycle";
import RequestRefresh from "../../../components/RequestRefresh";

export default function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const model = useBedRequest(id);
  const { request, error, busy, cancel } = model;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="flex justify-between items-center mb-4">
        {user ? (
          <Link href="/requests" className="text-sm text-blue-600 hover:underline">
            ← All requests
          </Link>
        ) : (
          <Link href="/emergency" className="text-sm text-red-600 hover:underline font-semibold">
            ← Back to Emergency Response
          </Link>
        )}
      </div>

      <RequestRefresh model={model} />
      {!request && !error && (
        <p className="text-gray-500 py-8 text-center" role="status">
          Loading request details…
        </p>
      )}

      {request && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[var(--color-surface)] p-6 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 mb-2">
              <EmergencyIcon
                name={request.isEmergency ? "siren" : "shield"}
                size={20}
                className={request.isEmergency ? "text-red-600" : "text-blue-600"}
              />
              <span className="text-xs uppercase tracking-wider font-extrabold text-gray-500">
                {request.isEmergency ? "Emergency Bed Request" : "Hospital Admission Request"}
              </span>
            </div>

            <h1 className="text-2xl font-bold mb-2">{request.requestId}</h1>
            <p className="text-sm text-gray-600 mb-4">
              <strong className="text-gray-900">{request.hospital?.name}</strong> ·{" "}
              {request.requiredFacility} · {request.emergencyType}
            </p>

            <div className="flex flex-wrap gap-2 items-center mb-4">
              <span className="px-2.5 py-1 text-xs rounded-full font-bold bg-blue-100 text-blue-800">
                {request.status.replaceAll("_", " ")}
              </span>
              {request.contactPhone && (
                <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-800 px-2.5 py-1 rounded-full border border-gray-200">
                  <EmergencyIcon name="phone" size={13} /> {request.contactPhone}
                </span>
              )}
              {request.contactEmail && (
                <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-800 px-2.5 py-1 rounded-full border border-gray-200">
                  <EmergencyIcon name="mail" size={13} /> {request.contactEmail}
                </span>
              )}
            </div>

            {request.ambulanceRequired ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 flex items-start gap-2 mb-4">
                <EmergencyIcon name="ambulance" size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Hospital Ambulance Requested</strong>
                  {request.ambulancePickupAddress && (
                    <div className="mt-0.5 text-gray-800">
                      Pickup Address: <em>{request.ambulancePickupAddress}</em>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 mb-4 flex items-center gap-1">
                <EmergencyIcon name="ambulance" size={14} className="text-gray-400" />
                <span>Ambulance: Not required</span>
              </div>
            )}

            {request.contactEmail && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 flex items-center gap-2 mb-4">
                <EmergencyIcon name="mail" size={16} className="text-blue-600 flex-shrink-0" />
                <span>MedReach uses <strong>{request.contactEmail}</strong> for status emails when delivery is available.</span>
              </div>
            )}

            <p className="text-xs text-gray-500 mb-6 italic">
              MedReach facilitates direct hospital coordination. Submitting an emergency request does not guarantee a reserved bed. For immediate life-critical emergencies, dial 112.
            </p>

            <RequestLifecycle model={model} />
          </div>

          <aside className="space-y-4">
            <div className="bg-[var(--color-surface)] p-5 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)]">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Need Immediate Emergency Help?</h2>
              <a
                className="w-full inline-flex items-center justify-center gap-2 font-bold text-sm rounded-[var(--radius)] bg-[var(--color-emergency)] text-white px-4 py-2 hover:bg-[var(--color-emergency-dark)] no-underline"
                href="tel:112"
              >
                <EmergencyIcon name="phone" size={16} /> Call 112
              </a>
              {!model.permissions.canRespond && !["REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"].includes(request.status) && (
                <button
                  className="w-full mt-3 inline-flex items-center justify-center font-medium text-sm rounded-[var(--radius)] border border-gray-300 bg-white text-gray-700 px-3 py-2 hover:bg-gray-50"
                  style={{ minHeight: 44 }}
                  onClick={cancel}
                  disabled={busy || Boolean(error) || model.refreshing}
                >
                  {busy ? "Cancelling…" : "Cancel request"}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
