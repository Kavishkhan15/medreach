"use client";
import React from "react";
import Link from "next/link";
import EmergencyIcon from "../EmergencyIcons";

export default function AssistantJobCard({ job }) {
  if (!job) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-3 overflow-hidden transition-all hover:shadow-md hover:border-gray-300">
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h4 className="text-sm font-bold text-gray-900 leading-snug flex items-center">
            <span className="text-blue-600 mr-1.5">💼</span>
            {job.title}
          </h4>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 shrink-0 capitalize">
            {job.employmentType ? job.employmentType.replace("_", " ") : "Full Time"}
          </span>
        </div>

        <div className="text-xs text-gray-500 mb-2.5 flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-gray-800">{job.hospitalName}</span>
          {job.department && (
            <span>· <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-600 border border-gray-200">{job.department}</span></span>
          )}
          {job.location && (
            <span>· <EmergencyIcon name="pin" size={11} className="text-gray-400" /> {job.location}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-gray-100">
          <Link
            href={`/jobs/${job.id}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors"
          >
            View & Apply
          </Link>
          <Link
            href="/careers"
            className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-gray-800 ml-auto transition-colors"
          >
            All Careers ›
          </Link>
        </div>
      </div>
    </div>
  );
}
