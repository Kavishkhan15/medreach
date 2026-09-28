"use client";
import React from "react";
import Link from "next/link";
import EmergencyIcon from "../EmergencyIcons";

export default function AssistantDiagnosticCard({ diagnostic }) {
  if (!diagnostic) return null;

  const hasCoords =
    Array.isArray(diagnostic.coordinates) &&
    diagnostic.coordinates.length === 2 &&
    Number.isFinite(diagnostic.coordinates[0]) &&
    Number.isFinite(diagnostic.coordinates[1]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-3 overflow-hidden transition-all hover:shadow-md hover:border-gray-300">
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h4 className="text-sm font-bold text-gray-900 leading-snug flex items-center">
            <span className="text-sky-600 mr-1.5">🔬</span>
            {diagnostic.name}
          </h4>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200 shrink-0">
            Diagnostics
          </span>
        </div>

        <div className="text-xs text-gray-500 mb-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1">
            <EmergencyIcon name="pin" size={12} className="text-gray-400" />
            {diagnostic.locality || "Mumbai"}
          </span>
          {diagnostic.distanceKm != null && (
            <span>· <strong className="text-gray-700 font-semibold">{diagnostic.distanceKm.toFixed(1)} km</strong></span>
          )}
          {diagnostic.operatingHours && (
            <span>· <span>{diagnostic.operatingHours}</span></span>
          )}
        </div>

        {diagnostic.services?.length > 0 && (
          <div className="mb-2.5">
            <div className="text-gray-500 text-[11px] font-medium mb-1">Available Tests & Scans:</div>
            <div className="flex flex-wrap gap-1">
              {diagnostic.services.slice(0, 5).map((srv) => (
                <span
                  key={srv}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-200"
                >
                  {srv}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-gray-100">
          {diagnostic.phone && (
            <a
              href={`tel:${diagnostic.phone}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-sky-200 bg-sky-50/50 text-sky-700 hover:bg-sky-100 hover:border-sky-300 transition-colors"
            >
              <EmergencyIcon name="phone" size={13} /> Call
            </a>
          )}
          {hasCoords && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${diagnostic.coordinates[1]},${diagnostic.coordinates[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <EmergencyIcon name="navigate" size={13} /> Directions
            </a>
          )}
          <Link
            href="/diagnostics"
            className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-gray-800 ml-auto transition-colors"
          >
            All Diagnostic Centres ›
          </Link>
        </div>
      </div>
    </div>
  );
}
