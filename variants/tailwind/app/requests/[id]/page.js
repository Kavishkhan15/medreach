"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@medreach/core";
import { EmergencyIcon } from "../../../components/EmergencyIcons";

const BASE_API =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

export default function RequestDetail({ params }) {
  const { user } = useAuth();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const trackingHeaders = () => {
    if (typeof window === "undefined") return {};
    const token = window.sessionStorage.getItem(`medreach:emergency-request-token:${params.id}`);
    return token ? { "X-MedReach-Tracking-Token": token } : {};
  };

  const refresh = async () => {
    try {
      const res = await fetch(`${BASE_API}/api/emergency-requests/${params.id}`, {
        credentials: "include",
        headers: trackingHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load request");
      setRequest(data.request);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (fragmentToken) {
      window.sessionStorage.setItem(`medreach:emergency-request-token:${params.id}`, fragmentToken);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    refresh();
  }, [params.id]);

  const cancel = async () => {
    if (!window.confirm("Cancel this bed request?")) return;
    setBusy(true);
    try {
      const res = await fetch(`${BASE_API}/api/emergency-requests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...trackingHeaders() },
        credentials: "include",
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="flex justify-between items-center mb-4">
        {user ? (
          <Link href="/hospitals" className="text-sm text-blue-600 hover:underline">
            ← Hospital directory
          </Link>
        ) : (
          <Link href="/emergency" className="text-sm text-red-600 hover:underline font-semibold">
            ← Back to Emergency Response
          </Link>
        )}
      </div>

      {error && (
        <div className="p-4 mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}
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

            <h2 className="text-base font-bold pt-4 border-t border-gray-200 mb-3">Status Timeline</h2>
            <ol className="relative border-l border-gray-200 ml-3 space-y-4">
              {request.timeline?.map((step, idx) => (
                <li key={idx} className="ml-4">
                  <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border border-white bg-blue-600" />
                  <div className="font-semibold text-sm text-gray-900">{step.status.replaceAll("_", " ")}</div>
                  <div className="text-xs text-gray-400">{new Date(step.at).toLocaleString()}</div>
                  {step.note && <p className="text-xs text-gray-600 mt-1">{step.note}</p>}
                </li>
              ))}
            </ol>
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
              {!["REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"].includes(request.status) && (
                <button
                  className="w-full mt-3 inline-flex items-center justify-center font-medium text-sm rounded-[var(--radius)] border border-gray-300 bg-white text-gray-700 px-3 py-2 hover:bg-gray-50"
                  onClick={cancel}
                  disabled={busy}
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
