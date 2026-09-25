"use client";
import React from "react";
import Link from "next/link";
import EmergencyIcon from "../EmergencyIcons";

export default function AssistantJobCard({ job }) {
  if (!job) return null;

  return (
    <div className="card border-0 shadow-sm rounded-3 mb-2 overflow-hidden bg-white assistant-card">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
          <h4 className="h6 fw-bold mb-0 text-dark">
            <span className="text-primary me-1">💼</span>
            {job.title}
          </h4>
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle text-capitalize" style={{ fontSize: "0.7rem" }}>
            {job.employmentType ? job.employmentType.replace("_", " ") : "Full Time"}
          </span>
        </div>

        <div className="text-muted small mb-2 d-flex flex-wrap align-items-center gap-1">
          <span className="fw-semibold text-dark">{job.hospitalName}</span>
          {job.department && <span>· <span className="badge bg-light text-secondary border">{job.department}</span></span>}
          {job.location && (
            <span>· <EmergencyIcon name="pin" size={11} className="text-secondary" /> {job.location}</span>
          )}
        </div>

        <div className="d-flex flex-wrap gap-1 mt-2 pt-2 border-top align-items-center">
          <Link
            href={`/jobs/${job.id}`}
            className="btn btn-sm btn-primary text-white d-inline-flex align-items-center gap-1"
          >
            View & Apply
          </Link>
          <Link href="/careers" className="btn btn-sm btn-light border text-secondary ms-auto">
            All Careers ›
          </Link>
        </div>
      </div>
    </div>
  );
}
