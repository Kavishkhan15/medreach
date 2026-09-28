"use client";
import React from "react";
import EmergencyIcon from "../EmergencyIcons";

export default function AssistantAmbulanceCard({ ambulance, onBookAmbulance }) {
  if (!ambulance) return null;

  const phone = ambulance.phone || "108";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-3 overflow-hidden transition-all hover:shadow-md hover:border-gray-300">
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h4 className="text-sm font-bold text-gray-900 leading-snug flex items-center">
            <span className="text-amber-600 mr-1.5">🚑</span>
            {ambulance.name}
          </h4>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
            24/7 Transit
          </span>
        </div>

        <div className="text-xs text-gray-700 font-semibold mb-1">
          {ambulance.providerType || "Medical Ambulance"}
        </div>

        <div className="text-xs text-gray-500 mb-2.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1">
            <EmergencyIcon name="pin" size={12} className="text-gray-400" />
            {ambulance.locality || "Mumbai"}
          </span>
          {ambulance.distanceKm != null && (
            <span>· <strong className="text-gray-700 font-semibold">{ambulance.distanceKm.toFixed(1)} km</strong></span>
          )}
          {ambulance.coverageArea && (
            <span>· <span>Coverage: {ambulance.coverageArea}</span></span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-gray-100">
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50/50 text-red-700 hover:bg-red-100 hover:border-red-300 transition-colors"
          >
            <EmergencyIcon name="phone" size={13} /> Call {phone}
          </a>

          {onBookAmbulance && (
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors"
              onClick={() => onBookAmbulance(ambulance)}
            >
              <EmergencyIcon name="ambulance" size={13} /> Book Ambulance
            </button>
          )}

          <a
            href="tel:108"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 ml-auto transition-colors"
            title="Government Emergency Ambulance"
          >
            Dial 108
          </a>
        </div>
      </div>
    </div>
  );
}
