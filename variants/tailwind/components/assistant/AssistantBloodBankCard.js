"use client";
import React from "react";
import Link from "next/link";
import EmergencyIcon from "../EmergencyIcons";

export default function AssistantBloodBankCard({ bloodBank, onRequestBlood }) {
  if (!bloodBank) return null;

  const hasCoords =
    Array.isArray(bloodBank.coordinates) &&
    bloodBank.coordinates.length === 2 &&
    Number.isFinite(bloodBank.coordinates[0]) &&
    Number.isFinite(bloodBank.coordinates[1]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-3 overflow-hidden transition-all hover:shadow-md hover:border-gray-300">
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h4 className="text-sm font-bold text-gray-900 leading-snug flex items-center">
            <span className="text-red-600 mr-1.5">🩸</span>
            {bloodBank.name}
          </h4>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 shrink-0">
            Blood Bank
          </span>
        </div>

        <div className="text-xs text-gray-500 mb-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1">
            <EmergencyIcon name="pin" size={12} className="text-gray-400" />
            {bloodBank.locality || "Mumbai"}
          </span>
          {bloodBank.distanceKm != null && (
            <span>· <strong className="text-gray-700 font-semibold">{bloodBank.distanceKm.toFixed(1)} km</strong></span>
          )}
          {bloodBank.operatingHours && (
            <span>· <span>{bloodBank.operatingHours}</span></span>
          )}
        </div>

        {bloodBank.listedBloodGroups?.length > 0 && (
          <div className="mb-2.5">
            <div className="text-gray-500 text-[11px] font-medium mb-1">Listed Blood Groups:</div>
            <div className="flex flex-wrap gap-1">
              {bloodBank.listedBloodGroups.map((bg) => (
                <span
                  key={bg}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-50 text-red-700 border border-red-200"
                >
                  {bg}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-gray-100">
          {bloodBank.phone && (
            <a
              href={`tel:${bloodBank.phone}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50/50 text-red-700 hover:bg-red-100 hover:border-red-300 transition-colors"
            >
              <EmergencyIcon name="phone" size={13} /> Call
            </a>
          )}
          {hasCoords && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${bloodBank.coordinates[1]},${bloodBank.coordinates[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <EmergencyIcon name="navigate" size={13} /> Directions
            </a>
          )}
          {onRequestBlood && (
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors"
              onClick={() => onRequestBlood(bloodBank)}
            >
              <EmergencyIcon name="blood" size={13} /> Request / Donate
            </button>
          )}
          <Link
            href="/urgent-blood"
            className="inline-flex items-center text-xs font-semibold text-red-600 hover:text-red-700 ml-auto transition-colors"
          >
            Emergency Form ›
          </Link>
        </div>
      </div>
    </div>
  );
}
