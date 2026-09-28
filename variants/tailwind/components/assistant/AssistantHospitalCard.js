"use client";
import React from "react";
import Link from "next/link";
import EmergencyIcon from "../EmergencyIcons";

export default function AssistantHospitalCard({ hospital, emergency = false }) {
  if (!hospital) return null;

  const hasCoords =
    Array.isArray(hospital.coordinates) &&
    hospital.coordinates.length === 2 &&
    Number.isFinite(hospital.coordinates[0]) &&
    Number.isFinite(hospital.coordinates[1]);

  const phone = hospital.phone || hospital.emergencyPhone;
  const slug = hospital.slug || hospital.id;

  const requestBedUrl = emergency
    ? `/requests/new?hospital=${encodeURIComponent(hospital.id || slug)}&flow=emergency&facility=Emergency%20Department`
    : `/requests/new?hospital=${encodeURIComponent(hospital.id || slug)}&flow=standard`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-3 overflow-hidden transition-all hover:shadow-md hover:border-gray-300">
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h4 className="text-sm font-bold text-gray-900 leading-snug">
            <Link href={`/hospitals/${slug}`} className="hover:text-red-600 transition-colors">
              {hospital.name}
            </Link>
          </h4>
          {hospital.verificationStatus === "verified" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              <EmergencyIcon name="verified" size={12} /> Verified
            </span>
          )}
        </div>

        <div className="text-xs text-gray-500 mb-2.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1">
            <EmergencyIcon name="pin" size={12} className="text-gray-400" />
            {hospital.locality || "Mumbai"}
          </span>
          {hospital.distanceKm != null && (
            <span>· <strong className="text-gray-700 font-semibold">{hospital.distanceKm.toFixed(1)} km</strong></span>
          )}
          {hospital.hospitalType && (
            <span>· <span className="capitalize">{hospital.hospitalType}</span></span>
          )}
        </div>

        {hospital.facilityDetail && (
          <div className="p-2.5 mb-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800">{hospital.facilityDetail.facility}:</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  hospital.facilityDetail.status === "available"
                    ? "bg-emerald-100 text-emerald-800"
                    : hospital.facilityDetail.status === "limited"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {hospital.facilityDetail.status === "unknown" ? "Status unconfirmed" : hospital.facilityDetail.status}
              </span>
            </div>
            {hospital.facilityDetail.retrievedAtRelative && (
              <div className="text-gray-400 mt-1 text-[11px]">
                Updated {hospital.facilityDetail.retrievedAtRelative}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-gray-100">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50/50 text-red-700 hover:bg-red-100 hover:border-red-300 transition-colors"
            >
              <EmergencyIcon name="phone" size={13} /> Call {phone}
            </a>
          )}

          <Link
            href={requestBedUrl}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors"
          >
            <EmergencyIcon name="hospital" size={13} /> Request Emergency Bed
          </Link>

          {hasCoords && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.coordinates[1]},${hospital.coordinates[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <EmergencyIcon name="navigate" size={13} /> Maps
            </a>
          )}

          <Link
            href={`/hospitals/${slug}`}
            className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-gray-800 ml-auto transition-colors"
          >
            Details ›
          </Link>
        </div>
      </div>
    </div>
  );
}
