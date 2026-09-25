"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { productApi, post } from "../../../lib/productApi";
import EmergencyIcon from "../../../components/EmergencyIcons";

const initialForm = {
  hospital: "",
  title: "",
  category: "Nurse",
  description: "",
  employmentType: "full_time",
  location: "Mumbai",
  department: "",
};

function isSafeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
    return parsed.protocol === "http:" || parsed.protocol === "https:" || url.startsWith("data:");
  } catch {
    return false;
  }
}

export default function HospitalJobs() {
  const [hospitals, setHospitals] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expandedJobId, setExpandedJobId] = useState("");
  const [applications, setApplications] = useState([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [updatingAppId, setUpdatingAppId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [hRes, jRes] = await Promise.all([
        productApi("/api/hospital-admin/hospitals"),
        productApi("/api/jobs/manage"),
      ]);
      const hospList = hRes.data || [];
      setHospitals(hospList);
      setJobs(jRes.data || []);
      setForm((prev) => ({
        ...prev,
        hospital: prev.hospital || hospList[0]?._id || "",
      }));
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load hospital data.");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = async (fn, successMsg = "Saved.") => {
    try {
      await fn();
      setMessage(successMsg);
      setError("");
      await refresh();
    } catch (e) {
      setError(e.message || "Action failed.");
    }
  };

  const loadApplications = async (jobId) => {
    if (expandedJobId === jobId) {
      setExpandedJobId("");
      setApplications([]);
      return;
    }
    setLoadingApps(true);
    setExpandedJobId(jobId);
    try {
      const res = await productApi(`/api/jobs/${jobId}/applications`);
      setApplications(res.data || []);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load applicant records.");
    } finally {
      setLoadingApps(false);
    }
  };

  const handleUpdateStatus = async (appId, newStatus) => {
    setUpdatingAppId(appId);
    try {
      await productApi(`/api/applications/${appId}`, {
        method: "PATCH",
        body: { status: newStatus },
      });
      // Optimistically update local application state immediately
      setApplications((prev) =>
        prev.map((app) => (app._id === appId ? { ...app, status: newStatus } : app))
      );
      setMessage(`Applicant marked as ${newStatus.replaceAll("_", " ")}.`);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to update applicant review status.");
    } finally {
      setUpdatingAppId(null);
    }
  };

  return (
    <>
      <Link href="/hospital" className="small text-decoration-none">
        ← Back to Hospital Workspace
      </Link>

      <div className="page-head my-3">
        <span className="eyebrow">Hospital Careers Management</span>
        <h1>Job Listings & Applications</h1>
        <p>Review incoming clinical candidates, qualifications, and manage active departmental drafts.</p>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <div className="row g-4">
        {/* Left Column: Create Job Draft */}
        <div className="col-lg-5">
          <form
            className="surface vstack gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              act(() => post("/api/jobs", form), "Job draft created successfully.");
            }}
          >
            <h2 className="h5 mb-2">Create Job Draft</h2>

            <div>
              <label className="form-label small fw-bold" htmlFor="jhospital">
                Hospital Facility
              </label>
              <select
                id="jhospital"
                className="form-select form-select-sm"
                value={form.hospital}
                onChange={(e) => setForm({ ...form, hospital: e.target.value })}
              >
                {hospitals.map((h) => (
                  <option key={h._id} value={h._id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label small fw-bold" htmlFor="jtitle">
                Position Title
              </label>
              <input
                id="jtitle"
                className="form-control form-control-sm"
                minLength={3}
                required
                placeholder="e.g. Senior Emergency Resident"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="row g-2">
              <div className="col-sm-6">
                <label className="form-label small fw-bold" htmlFor="jcategory">
                  Category
                </label>
                <select
                  id="jcategory"
                  className="form-select form-select-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {[
                    "Doctor",
                    "Nurse",
                    "Technician",
                    "Pharmacist",
                    "Administrative",
                    "Emergency Staff",
                    "Internship",
                    "Other",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-sm-6">
                <label className="form-label small fw-bold" htmlFor="jtype">
                  Employment Type
                </label>
                <select
                  id="jtype"
                  className="form-select form-select-sm"
                  value={form.employmentType}
                  onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                >
                  {[
                    { val: "full_time", label: "Full Time" },
                    { val: "part_time", label: "Part Time" },
                    { val: "contract", label: "Contract" },
                    { val: "internship", label: "Internship" },
                  ].map((item) => (
                    <option key={item.val} value={item.val}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="form-label small fw-bold" htmlFor="jdescription">
                Description & Requirements
              </label>
              <textarea
                id="jdescription"
                className="form-control form-control-sm"
                rows={4}
                minLength={10}
                required
                placeholder="Outline clinical expectations, shift schedules, and ICU/ward responsibilities…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <button className="btn btn-primary btn-sm mt-2 fw-bold" disabled={!form.hospital}>
              Save Job Draft
            </button>
          </form>
        </div>

        {/* Right Column: Listings & Review Applicants */}
        <div className="col-lg-7">
          <div className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5">
            <h2 className="h5 mb-3">Facility Job Listings</h2>
            {!jobs.length && <p className="text-secondary small">No job listings found for your managed hospitals.</p>}

            {jobs.map((job) => {
              const isExpanded = expandedJobId === job._id;
              return (
                <div key={job._id} className="border-top py-3">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div>
                      <strong className="h6 d-block mb-1">{job.title}</strong>
                      <p className="small text-secondary mb-2">
                        {job.hospital?.name} · <span className="text-capitalize">{job.category}</span> · {job.employmentType?.replaceAll("_", " ")}
                      </p>
                    </div>
                    <span className="status-pill tone-info text-capitalize">{job.status}</span>
                  </div>

                  <div className="d-flex flex-wrap gap-2 mb-2">
                    {job.status === "draft" && (
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => act(() => post(`/api/jobs/${job._id}/status`, { status: "published" }), "Listing published.")}
                      >
                        Publish Listing
                      </button>
                    )}
                    {job.status === "published" && (
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => act(() => post(`/api/jobs/${job._id}/status`, { status: "closed" }), "Listing closed.")}
                      >
                        Close Listing
                      </button>
                    )}
                    <button
                      className={`btn btn-sm ${isExpanded ? "btn-secondary" : "btn-outline-secondary"}`}
                      onClick={() => loadApplications(job._id)}
                      aria-expanded={isExpanded}
                      aria-controls={`apps-${job._id}`}
                    >
                      {isExpanded ? "Hide Applicants" : "Review Applicants"}
                    </button>
                  </div>

                  {/* Collapsible Applicants Panel */}
                  {isExpanded && (
                    <div id={`apps-${job._id}`} className="mt-3 ps-2 border-start border-3 border-primary bg-light p-3 rounded">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h3 className="h6 fw-bold mb-0">Candidate Applications ({applications.length})</h3>
                        {loadingApps && <span className="spinner-border spinner-border-sm text-secondary" />}
                      </div>

                      {!loadingApps && !applications.length && (
                        <p className="small text-muted mb-0">No candidates have applied for this listing yet.</p>
                      )}

                      {applications.map((app) => {
                        const candName = app.candidateName || app.applicant?.name || "Candidate";
                        const candEmail = app.contactEmail || app.applicant?.email || "Not specified";
                        const candPhone = app.candidatePhone || app.phone || app.applicant?.emergencyContact || "Not specified";
                        const candQual = app.qualifications || app.qualification || app.degree || "Clinical Credentials on File";
                        const candExp = app.experienceYears !== undefined ? `${app.experienceYears} Year(s)` : app.experience !== undefined ? `${app.experience} Year(s)` : "Experience on file";
                        const sopText = app.sop || app.statement || "";
                        const sopWords = sopText.trim() ? sopText.trim().split(/\s+/).filter(Boolean).length : 0;
                        const isUpdating = updatingAppId === app._id;

                        return (
                          <div key={app._id} className="border rounded p-3 mb-3 bg-white shadow-sm">
                            {/* Applicant Header */}
                            <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                              <div>
                                <strong className="h6 mb-0 text-primary">{candName}</strong>
                                <span className="small text-muted ms-2">
                                  Applied {new Date(app.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <span
                                className={`badge ${
                                  app.status === "shortlisted"
                                    ? "bg-success"
                                    : app.status === "rejected"
                                    ? "bg-danger"
                                    : app.status === "under_review"
                                    ? "bg-warning text-dark"
                                    : "bg-secondary"
                                } text-capitalize`}
                              >
                                {app.status.replaceAll("_", " ")}
                              </span>
                            </div>

                            {/* Candidate Details Grid */}
                            <div className="row g-2 small mb-3">
                              <div className="col-sm-6">
                                <span className="text-muted d-block">Contact Email:</span>
                                {candEmail && candEmail !== "Not specified" ? (
                                  <a href={`mailto:${candEmail}`} className="text-decoration-none fw-semibold">
                                    {candEmail}
                                  </a>
                                ) : (
                                  <span className="text-muted fst-italic">Not specified</span>
                                )}
                              </div>
                              <div className="col-sm-6">
                                <span className="text-muted d-block">Contact Phone:</span>
                                {candPhone && candPhone !== "Not specified" ? (
                                  <a href={`tel:${candPhone}`} className="text-decoration-none fw-semibold">
                                    {candPhone}
                                  </a>
                                ) : (
                                  <span className="text-muted fst-italic">Not specified</span>
                                )}
                              </div>
                              <div className="col-sm-6">
                                <span className="text-muted d-block">Highest Qualification:</span>
                                <span className="badge bg-light text-dark border">{candQual}</span>
                              </div>
                              <div className="col-sm-6">
                                <span className="text-muted d-block">Clinical Experience:</span>
                                <span className="fw-semibold">{candExp}</span>
                              </div>
                            </div>

                            {/* Resume Download / View */}
                            {app.resume?.fileUrl && isSafeUrl(app.resume.fileUrl) ? (
                              <div className="mb-3 p-2 bg-light rounded border d-flex align-items-center justify-content-between">
                                <div className="text-truncate me-2 small">
                                  <EmergencyIcon name="file" size={15} className="me-1" /> <strong>Resume:</strong> {app.resume.fileName || "Candidate_CV"}
                                </div>
                                <a
                                  href={app.resume.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={app.resume.fileName || "Candidate_CV"}
                                  className="btn btn-sm btn-outline-primary py-0 px-2 fw-semibold"
                                >
                                  View / Download CV
                                </a>
                              </div>
                            ) : (
                              <div className="mb-3 small text-muted fst-italic">No uploaded resume attachment provided.</div>
                            )}

                            {/* Statement of Purpose */}
                            <div className="mb-3">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <span className="small fw-bold text-secondary">Statement of Purpose (SOP):</span>
                                <span className="badge bg-light text-muted border">{sopWords} words</span>
                              </div>
                              <p className="small mb-0 p-2 bg-light rounded border text-body pre-line" style={{ maxHeight: "150px", overflowY: "auto" }}>
                                {sopText || "No statement provided."}
                              </p>
                            </div>

                            {/* Review Status Action Buttons */}
                            <div className="d-flex align-items-center gap-2 pt-2 border-top">
                              <span className="small text-muted fw-bold">Update Status:</span>
                              <div className="btn-group btn-group-sm" role="group" aria-label={`Review status for ${candName}`}>
                                {[
                                  { val: "under_review", label: "Under Review", variant: "outline-warning text-dark" },
                                  { val: "shortlisted", label: "Shortlisted", variant: "outline-success" },
                                  { val: "rejected", label: "Rejected", variant: "outline-danger" },
                                ].map((btn) => (
                                  <button
                                    key={btn.val}
                                    type="button"
                                    disabled={isUpdating}
                                    className={`btn btn-sm ${
                                      app.status === btn.val
                                        ? btn.val === "shortlisted"
                                          ? "btn-success"
                                          : btn.val === "rejected"
                                          ? "btn-danger"
                                          : "btn-warning text-dark"
                                        : `btn-${btn.variant}`
                                    }`}
                                    aria-pressed={app.status === btn.val}
                                    onClick={() => handleUpdateStatus(app._id, btn.val)}
                                  >
                                    {btn.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
