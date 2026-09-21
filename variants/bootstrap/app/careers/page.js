"use client";

import Link from "next/link";
import { useEffect, useState, useMemo, useCallback } from "react";
import { productApi, post } from "../../lib/productApi";

// Normalizes or infers organization type
function inferOrgType(job) {
  if (job?.organizationType) {
    const t = job.organizationType.toLowerCase();
    if (t === "hospital") return "Hospital";
    if (t === "diagnostic") return "Diagnostic Centre";
    if (t === "blood_bank") return "Blood Bank";
    if (t === "ambulance") return "Ambulance Service";
  }
  if (job?.provider?.kind) {
    const k = job.provider.kind.toLowerCase();
    if (k === "diagnostic") return "Diagnostic Centre";
    if (k === "blood_bank") return "Blood Bank";
    if (k === "ambulance") return "Ambulance Service";
  }
  const name = (job?.hospital?.name || job?.provider?.name || job?.organizationName || "").toLowerCase();
  const dept = (job?.department || "").toLowerCase();
  if (name.includes("blood") || dept.includes("blood") || dept.includes("apheresis") || dept.includes("transfusion")) return "Blood Bank";
  if (name.includes("diagnostic") || name.includes("pathology") || name.includes("lab") || dept.includes("radiology") || dept.includes("imaging")) return "Diagnostic Centre";
  if (name.includes("ambulance") || name.includes("ems") || name.includes("mems") || dept.includes("pre-hospital") || dept.includes("fleet")) return "Ambulance Service";
  return "Hospital";
}

// Badge color tone resolver for Bootstrap
function getOrgTypeBadgeTone(orgType) {
  switch (orgType) {
    case "Hospital":
      return "tone-info";
    case "Diagnostic Centre":
      return "tone-success";
    case "Blood Bank":
      return "tone-danger";
    case "Ambulance Service":
      return "tone-warning";
    default:
      return "tone-neutral";
  }
}

function getOrgTypeIcon(orgType) {
  switch (orgType) {
    case "Hospital":
      return "🏥";
    case "Diagnostic Centre":
      return "🔬";
    case "Blood Bank":
      return "🩸";
    case "Ambulance Service":
      return "🚑";
    default:
      return "🏢";
  }
}

// Format employment types
function formatEmploymentType(val) {
  if (!val) return "Full Time";
  const normalized = val.toLowerCase().replace("-", "_");
  if (normalized === "full_time") return "Full Time";
  if (normalized === "part_time") return "Part Time";
  if (normalized === "contract") return "Contract";
  if (normalized === "internship") return "Internship";
  return val.replace(/_/g, " ");
}

export default function Careers() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [orgTypeFilter, setOrgTypeFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState("All");

  // Application Modal State
  const [selectedJobForApply, setSelectedJobForApply] = useState(null);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [qualification, setQualification] = useState("MBBS / MD");
  const [experienceYears, setExperienceYears] = useState("2");
  const [sop, setSop] = useState("");
  const [resumeMode, setResumeMode] = useState("file");
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeUrl, setResumeUrl] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalFeedback, setModalFeedback] = useState(null);

  // Fetch jobs dynamically from backend API
  useEffect(() => {
    let live = true;
    setLoading(true);

    productApi("/api/jobs")
      .then((res) => {
        if (!live) return;
        setJobs(res.data || []);
        setError("");
      })
      .catch((err) => {
        if (!live) return;
        const msg =
          err.message === "Authentication required" || err.message?.includes("Authentication required")
            ? "Login required"
            : (err.message || "Failed to load jobs");
        setError(msg);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, []);

  // Filter jobs based on active search & selector criteria
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const orgType = inferOrgType(job);

      // 1. Organization Type filter
      if (orgTypeFilter !== "All" && orgType !== orgTypeFilter) {
        return false;
      }

      // 2. Category filter
      if (categoryFilter !== "All" && job.category !== categoryFilter) {
        return false;
      }

      // 3. Employment Type filter
      if (employmentTypeFilter !== "All") {
        const formattedType = formatEmploymentType(job.employmentType);
        if (formattedType.toLowerCase() !== employmentTypeFilter.toLowerCase()) {
          return false;
        }
      }

      // 4. Keyword / search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const orgName = (job.hospital?.name || job.provider?.name || job.organizationName || "").toLowerCase();
        const matchTitle = job.title?.toLowerCase().includes(q);
        const matchDept = job.department?.toLowerCase().includes(q);
        const matchDesc = job.description?.toLowerCase().includes(q);
        const matchReq = job.requirements?.toLowerCase().includes(q);
        const matchOrg = orgName.includes(q);
        const matchLoc = (job.location || job.hospital?.locality || job.provider?.locality || "").toLowerCase().includes(q);
        const matchCategory = job.category?.toLowerCase().includes(q);

        if (!matchTitle && !matchDept && !matchDesc && !matchReq && !matchOrg && !matchLoc && !matchCategory) {
          return false;
        }
      }

      return true;
    });
  }, [jobs, orgTypeFilter, categoryFilter, employmentTypeFilter, searchQuery]);

  // Group filtered jobs by organization dynamically from crawled/verified provider data
  const groupedByOrganization = useMemo(() => {
    const groups = {};

    filteredJobs.forEach((job) => {
      const orgName = job.hospital?.name || job.provider?.name || job.organizationName || "Healthcare Provider";
      const orgKey = job.hospital?._id || job.provider?._id || orgName;

      if (!groups[orgKey]) {
        const orgType = inferOrgType(job);
        const locality = job.hospital?.locality || job.provider?.locality || job.location || "Mumbai";
        const city = job.hospital?.city || job.provider?.city || "Mumbai";
        const verificationBadge = job.hospital?.verificationStatus === "verified" || job.provider?.verificationStatus === "verified" || job.verificationStatus === "verified"
          ? "MedReach Verified"
          : "Registered Provider";

        groups[orgKey] = {
          id: orgKey,
          name: orgName,
          type: orgType,
          locality: `${locality}${city && city !== locality ? `, ${city}` : ""}`,
          verificationBadge,
          jobs: [],
        };
      }

      groups[orgKey].jobs.push(job);
    });

    return Object.values(groups);
  }, [filteredJobs]);

  // Metrics summary
  const stats = useMemo(() => {
    const totalJobs = jobs.length;
    const orgNames = new Set(jobs.map((j) => j.hospital?.name || j.provider?.name || j.organizationName).filter(Boolean));
    const emergencyCount = jobs.filter((j) =>
      j.category === "Emergency Staff" ||
      j.department?.toLowerCase().includes("trauma") ||
      j.department?.toLowerCase().includes("emergency") ||
      j.department?.toLowerCase().includes("icu")
    ).length;
    return { totalJobs, orgCount: orgNames.size, emergencyCount };
  }, [jobs]);

  // Reset all search and filter criteria
  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setOrgTypeFilter("All");
    setCategoryFilter("All");
    setEmploymentTypeFilter("All");
  }, []);

  // Modal open & close handlers
  const openApplyModal = useCallback((job) => {
    setSelectedJobForApply(job);
    setCandidateName("");
    setCandidateEmail("");
    setCandidatePhone("");
    setQualification("MBBS / MD");
    setExperienceYears("2");
    setSop("");
    setResumeFile(null);
    setResumeUrl("");
    setModalFeedback(null);
  }, []);

  const closeApplyModal = useCallback(() => {
    setSelectedJobForApply(null);
    setModalFeedback(null);
  }, []);

  // Keyboard escape listener for modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && selectedJobForApply) {
        closeApplyModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedJobForApply, closeApplyModal]);

  // Handle file attachment
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setModalFeedback({
        type: "danger",
        message: "File size exceeds 4MB. Please attach a smaller PDF/DOCX or provide a URL link.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setResumeFile({
        fileName: file.name,
        fileType: file.type || "application/pdf",
        fileUrl: reader.result,
        fileSize: file.size,
      });
      setModalFeedback(null);
    };
    reader.readAsDataURL(file);
  };

  // Submit application handler
  const handleApplicationSubmit = async (e) => {
    e.preventDefault();
    if (!selectedJobForApply) return;

    if (!candidateName.trim()) {
      setModalFeedback({ type: "warning", message: "Please provide candidate full name." });
      return;
    }
    if (!candidateEmail.trim() || !candidateEmail.includes("@")) {
      setModalFeedback({ type: "warning", message: "Please provide a valid email address." });
      return;
    }
    if (!candidatePhone.trim()) {
      setModalFeedback({ type: "warning", message: "Please provide candidate contact phone number." });
      return;
    }

    const trimmedSop = sop.trim();
    const wordCount = trimmedSop ? trimmedSop.split(/\s+/).filter(Boolean).length : 0;

    if (wordCount < 15) {
      setModalFeedback({
        type: "warning",
        message: "Please write a concise Statement of Purpose (target ~200 words, minimum 15 words).",
      });
      return;
    }

    let finalResume = resumeFile;
    if (resumeMode === "link") {
      if (!resumeUrl.trim()) {
        setModalFeedback({
          type: "warning",
          message: "Please provide a valid resume or portfolio URL link.",
        });
        return;
      }
      finalResume = {
        fileName: "Resume Link",
        fileUrl: resumeUrl.trim(),
        fileType: "link",
      };
    }

    setModalSubmitting(true);
    setModalFeedback(null);

    try {
      const payload = {
        candidateName: candidateName.trim(),
        contactEmail: candidateEmail.trim().toLowerCase(),
        contactPhone: candidatePhone.trim(),
        qualifications: qualification,
        qualification: qualification,
        experienceYears: Number(experienceYears) || 0,
        experience: Number(experienceYears) || 0,
        sop: trimmedSop,
        statement: trimmedSop,
        resume: finalResume,
      };

      const response = await post(`/api/jobs/${selectedJobForApply._id}/apply`, payload);

      setModalFeedback({
        type: "success",
        message: response.demo
          ? "Demo application recorded! This verified posting is part of our simulation dataset."
          : `Application submitted successfully! Reference ID: ${response.application?._id || "MED-APP"}. The healthcare facility has received your application.`,
      });
      setSop("");
      setResumeFile(null);
      setResumeUrl("");
    } catch (err) {
      const msg =
        err.message === "Authentication required" || err.message?.includes("Authentication required")
          ? "Login required"
          : (err.message || "Failed to submit application. Please check your credentials or log in.");
      setModalFeedback({
        type: "danger",
        message: msg,
      });
    } finally {
      setModalSubmitting(false);
    }
  };

  // Word count calculation
  const sopWordCount = useMemo(() => {
    const trimmed = sop.trim();
    return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  }, [sop]);

  return (
    <div className="careers-portal">
      {/* Portal Header */}
      <header className="page-head mb-4 pb-2 border-bottom">
        <span className="eyebrow d-block mb-1">MedReach Healthcare Network</span>
        <h1 className="h2 fw-bold text-dark mb-2">
          Mumbai Healthcare Careers Portal — Verified Opportunities Across Hospitals, Labs, Blood Banks & EMS
        </h1>
        <p className="lead text-secondary mb-3">
          Explore and apply for verified clinical, diagnostic, and emergency services positions across discovered Mumbai healthcare organizations. Applications are tracked in real-time.
        </p>

        {/* Live Metrics Ribbon */}
        <div className="d-flex flex-wrap gap-3 align-items-center pt-2">
          <span className="badge bg-white text-dark border px-3 py-2 rounded-pill shadow-sm">
            🏥 <strong>{stats.orgCount}</strong> Discovered Healthcare Organizations
          </span>
          <span className="badge bg-white text-dark border px-3 py-2 rounded-pill shadow-sm">
            💼 <strong>{stats.totalJobs}</strong> Active Job Openings
          </span>
          <span className="badge bg-white text-dark border px-3 py-2 rounded-pill shadow-sm">
            🚨 <strong>{stats.emergencyCount}</strong> High-Priority Trauma & EMS Openings
          </span>
          <span className="badge bg-light text-success border border-success-subtle px-3 py-2 rounded-pill">
            ✓ Populated from Crawled & Verified Healthcare Data
          </span>
        </div>
      </header>

      {/* Search & Filter Control Bar */}
      <section className="surface mb-4 shadow-sm" aria-label="Search and Filter Roles">
        <div className="row g-3">
          {/* Keyword Search */}
          <div className="col-12 col-lg-5">
            <label htmlFor="roleSearchInput" className="form-label fw-semibold small text-uppercase text-muted mb-1">
              Search Role, Department or Facility
            </label>
            <div className="input-group">
              <span className="input-group-text bg-light text-muted border-end-0">🔍</span>
              <input
                id="roleSearchInput"
                type="text"
                className="form-control border-start-0 ps-0"
                placeholder="Doctor, ICU nurse, radiographer, paramedic, Bandra..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-outline-secondary border-start-0"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search input"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Organization Type Selector */}
          <div className="col-6 col-md-4 col-lg-2">
            <label htmlFor="orgTypeSelect" className="form-label fw-semibold small text-uppercase text-muted mb-1">
              Organization Type
            </label>
            <select
              id="orgTypeSelect"
              className="form-select"
              value={orgTypeFilter}
              onChange={(e) => setOrgTypeFilter(e.target.value)}
            >
              <option value="All">All Providers</option>
              <option value="Hospital">Hospital</option>
              <option value="Diagnostic Centre">Diagnostic Centre</option>
              <option value="Blood Bank">Blood Bank</option>
              <option value="Ambulance Service">Ambulance Service</option>
            </select>
          </div>

          {/* Category Selector */}
          <div className="col-6 col-md-4 col-lg-2">
            <label htmlFor="categorySelect" className="form-label fw-semibold small text-uppercase text-muted mb-1">
              Role Category
            </label>
            <select
              id="categorySelect"
              className="form-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="All">All Categories</option>
              <option value="Doctor">Doctor</option>
              <option value="Nurse">Nurse</option>
              <option value="Technician">Technician</option>
              <option value="Pharmacist">Pharmacist</option>
              <option value="Emergency Staff">Emergency Staff</option>
              <option value="Administrative">Administrative</option>
              <option value="Internship">Internship</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Employment Type Selector */}
          <div className="col-6 col-md-4 col-lg-2">
            <label htmlFor="employmentTypeSelect" className="form-label fw-semibold small text-uppercase text-muted mb-1">
              Engagement
            </label>
            <select
              id="employmentTypeSelect"
              className="form-select"
              value={employmentTypeFilter}
              onChange={(e) => setEmploymentTypeFilter(e.target.value)}
            >
              <option value="All">All Engagements</option>
              <option value="Full Time">Full Time</option>
              <option value="Part Time">Part Time</option>
              <option value="Contract">Contract</option>
              <option value="Internship">Internship</option>
            </select>
          </div>

          {/* Reset Filters CTA */}
          <div className="col-6 col-md-12 col-lg-1 d-flex align-items-end">
            <button
              type="button"
              className="btn btn-outline-secondary w-100 py-2"
              onClick={resetFilters}
              title="Reset all search queries and active filters"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Quick-Pill Filter Shortcuts */}
        <div className="d-flex flex-wrap gap-2 mt-3 pt-2 border-top align-items-center">
          <span className="small text-muted fw-semibold me-1">Fast Filters:</span>
          {["All", "Hospital", "Diagnostic Centre", "Blood Bank", "Ambulance Service"].map((type) => (
            <button
              key={type}
              type="button"
              className={`btn btn-sm ${orgTypeFilter === type ? "btn-dark fw-bold" : "btn-light text-secondary border"}`}
              onClick={() => setOrgTypeFilter(type)}
            >
              {type === "All" ? "🏢 All Providers" : type === "Hospital" ? "🏥 Hospitals" : type === "Diagnostic Centre" ? "🔬 Diagnostic Labs" : type === "Blood Bank" ? "🩸 Blood Banks" : "🚑 EMS & Ambulances"}
            </button>
          ))}
          <div className="vr d-none d-md-inline-block mx-1" />
          {["Doctor", "Nurse", "Emergency Staff", "Technician"].map((cat) => (
            <button
              key={cat}
              type="button"
              className={`btn btn-sm ${categoryFilter === cat ? "btn-primary fw-bold" : "btn-light text-secondary border"}`}
              onClick={() => setCategoryFilter(categoryFilter === cat ? "All" : cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Results Counter & Active Filter Indicators */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <span className="fw-bold text-dark">{filteredJobs.length}</span> verified{" "}
          {filteredJobs.length === 1 ? "opening" : "openings"} across{" "}
          <span className="fw-bold text-dark">{groupedByOrganization.length}</span> healthcare{" "}
          {groupedByOrganization.length === 1 ? "organization" : "organizations"}
        </div>
        {(searchQuery || orgTypeFilter !== "All" || categoryFilter !== "All" || employmentTypeFilter !== "All") && (
          <button
            type="button"
            className="btn btn-link btn-sm text-decoration-none text-danger p-0"
            onClick={resetFilters}
          >
            Clear active filters (×)
          </button>
        )}
      </div>

      {/* Loading & API Error Feedback */}
      {loading && (
        <div className="surface p-4 text-center my-4" role="status">
          <div className="spinner-border text-danger me-2" role="status" style={{ width: "1.75rem", height: "1.75rem" }}>
            <span className="visually-hidden">Loading opportunities...</span>
          </div>
          <span className="text-secondary fw-semibold">Loading verified healthcare opportunities across Mumbai...</span>
        </div>
      )}

      {error && !loading && (
        <div className="alert alert-danger py-2 mb-4" role="alert">
          {error === "Authentication required" ? "Login required" : error}
          {(error === "Login required" || error === "Authentication required") && (
            <> · <Link href="/login" className="alert-link">Sign in</Link></>
          )}
        </div>
      )}

      {/* Empty State when zero jobs match */}
      {!loading && filteredJobs.length === 0 && (
        <div className="surface text-center py-5 px-3 my-4">
          <div className="display-6 mb-3">🔎</div>
          <h2 className="h4 fw-bold text-dark mb-2">No Verified Positions Found</h2>
          <p className="text-secondary mx-auto mb-4" style={{ maxWidth: "480px" }}>
            No healthcare openings match your selected filters. Try broadening your keywords or resetting filters.
          </p>
          <button type="button" className="btn btn-primary px-4" onClick={resetFilters}>
            Reset All Filters
          </button>
        </div>
      )}

      {/* Organization Sections with Open Jobs List */}
      <div className="d-flex flex-column gap-4">
        {groupedByOrganization.map((org) => (
          <section key={org.id} className="surface border rounded-3 p-4 shadow-sm" aria-labelledby={`org-${org.id}-title`}>
            {/* Organization Header Card */}
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 pb-3 mb-3 border-bottom">
              <div>
                <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                  <span className={`status-pill ${getOrgTypeBadgeTone(org.type)}`}>
                    {getOrgTypeIcon(org.type)} {org.type}
                  </span>
                  <span className="badge bg-light text-success border border-success-subtle">
                    ✓ {org.verificationBadge}
                  </span>
                </div>
                <h2 id={`org-${org.id}-title`} className="h4 fw-bold text-dark mb-1">
                  {org.name}
                </h2>
                <p className="text-muted small mb-0">
                  📍 {org.locality} · Open Positions ({org.jobs.length})
                </p>
              </div>

              <div className="text-end">
                <span className="badge bg-dark px-3 py-2 rounded-pill">
                  {org.jobs.length} {org.jobs.length === 1 ? "Open Role" : "Open Roles"}
                </span>
              </div>
            </div>

            {/* List of Open Jobs for this Organization */}
            <div className="row g-3">
              {org.jobs.map((job) => (
                <div key={job._id} className="col-12 col-xl-6">
                  <article className="card h-100 border p-3 d-flex flex-column justify-content-between bg-white hover-shadow">
                    <div>
                      {/* Category & Employment Type Pill */}
                      <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                        <span className="eyebrow">{job.category}</span>
                        <div className="d-flex gap-1">
                          <span className="status-pill tone-info">
                            {formatEmploymentType(job.employmentType)}
                          </span>
                          {job.demo && (
                            <span className="badge bg-warning-subtle text-warning-emphasis border">
                              Demo
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Job Title & Department */}
                      <h3 className="h5 fw-bold mb-1 text-dark">
                        <Link
                          href={`/jobs/${job._id}`}
                          className="text-decoration-none text-reset hover-primary"
                        >
                          {job.title}
                        </Link>
                      </h3>
                      <div className="text-secondary small fw-medium mb-2">
                        🏢 {job.department || "General Medical Services"}
                      </div>

                      {/* Location & Compensation */}
                      <div className="d-flex flex-wrap gap-2 text-muted small mb-3">
                        <span>📍 {job.location || org.locality || "Mumbai"}</span>
                        {job.salaryText && (
                          <>
                            <span>·</span>
                            <span className="text-dark fw-semibold">💵 {job.salaryText}</span>
                          </>
                        )}
                      </div>

                      {/* Requirements Preview */}
                      <div className="p-2 mb-3 bg-light rounded-2 small text-secondary border">
                        <strong className="text-dark d-block mb-1">Requirements:</strong>
                        <p className="mb-0 text-truncate-2">
                          {job.requirements || job.description?.slice(0, 160) + "..."}
                        </p>
                      </div>
                    </div>

                    {/* Footer Actions: Deadline & Apply Button */}
                    <div className="d-flex justify-content-between align-items-center pt-2 border-top mt-auto">
                      <div className="small text-muted">
                        {job.deadline ? (
                          <span>⏳ Apply by {new Date(job.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                        ) : (
                          <span className="text-success fw-medium">● Actively Reviewing</span>
                        )}
                      </div>

                      <div className="btn-group">
                        <Link
                          href={`/jobs/${job._id}`}
                          className="btn btn-sm btn-outline-secondary px-3"
                          title="View full job details and requirements"
                        >
                          View Details
                        </Link>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary px-3 fw-bold"
                          onClick={() => openApplyModal(job)}
                          aria-label={`Apply Now for ${job.title} at ${org.name}`}
                        >
                          Apply Now
                        </button>
                      </div>
                    </div>
                  </article>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Application Modal */}
      {selectedJobForApply && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="applyModalLabel"
          style={{ backgroundColor: "rgba(16, 24, 40, 0.65)" }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
            <div className="modal-content border-0 shadow-lg rounded-3">
              <div className="modal-header bg-light border-bottom">
                <div>
                  <span className="eyebrow d-block mb-1">Direct Healthcare Application</span>
                  <h2 className="modal-title h5 fw-bold mb-0" id="applyModalLabel">
                    {selectedJobForApply.title}
                  </h2>
                  <p className="text-muted small mb-0">
                    {selectedJobForApply.hospital?.name || selectedJobForApply.provider?.name || selectedJobForApply.organizationName} · {selectedJobForApply.location || selectedJobForApply.hospital?.locality || "Mumbai"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closeApplyModal}
                  aria-label="Close application dialog"
                />
              </div>

              <form onSubmit={handleApplicationSubmit}>
                <div className="modal-body p-4">
                  {/* Position Overview Banner */}
                  <div className="p-3 mb-4 rounded-2 bg-light border d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div>
                      <span className="badge bg-secondary me-2">{selectedJobForApply.category}</span>
                      <span className="badge bg-dark me-2">{formatEmploymentType(selectedJobForApply.employmentType)}</span>
                      {selectedJobForApply.salaryText && (
                        <span className="text-dark small fw-semibold">💵 {selectedJobForApply.salaryText}</span>
                      )}
                    </div>
                    <Link
                      href={`/jobs/${selectedJobForApply._id}`}
                      className="small text-decoration-none fw-semibold"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Full Role Description ↗
                    </Link>
                  </div>

                  {/* Feedback Message */}
                  {modalFeedback && (
                    <div className={`alert alert-${modalFeedback.type} mb-4 small`} role="alert">
                      {modalFeedback.message === "Authentication required" ? "Login required" : modalFeedback.message}
                      {(modalFeedback.message === "Login required" || modalFeedback.message === "Authentication required") && (
                        <> · <Link href="/login" className="alert-link">Sign in</Link></>
                      )}
                    </div>
                  )}

                  {/* Candidate Details Grid */}
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <label htmlFor="modalCandidateName" className="form-label fw-bold small mb-1">
                        Full Name <span className="text-danger">*</span>
                      </label>
                      <input
                        id="modalCandidateName"
                        type="text"
                        required
                        className="form-control form-control-sm"
                        placeholder="e.g. Dr. Ramesh Gupta"
                        value={candidateName}
                        onChange={(e) => setCandidateName(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="modalCandidateEmail" className="form-label fw-bold small mb-1">
                        Email Address <span className="text-danger">*</span>
                      </label>
                      <input
                        id="modalCandidateEmail"
                        type="email"
                        required
                        className="form-control form-control-sm"
                        placeholder="doctor@hospital.org"
                        value={candidateEmail}
                        onChange={(e) => setCandidateEmail(e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label htmlFor="modalCandidatePhone" className="form-label fw-bold small mb-1">
                        Contact Phone <span className="text-danger">*</span>
                      </label>
                      <input
                        id="modalCandidatePhone"
                        type="tel"
                        required
                        className="form-control form-control-sm"
                        placeholder="+91 98765 43210"
                        value={candidatePhone}
                        onChange={(e) => setCandidatePhone(e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label htmlFor="modalQualification" className="form-label fw-bold small mb-1">
                        Highest Qualification
                      </label>
                      <select
                        id="modalQualification"
                        className="form-select form-select-sm"
                        value={qualification}
                        onChange={(e) => setQualification(e.target.value)}
                      >
                        <option value="MBBS / MD">MBBS / MD</option>
                        <option value="MS / DNB">MS / DNB</option>
                        <option value="B.Sc Nursing">B.Sc Nursing</option>
                        <option value="GNM / Post-Basic">GNM / Post-Basic</option>
                        <option value="B.Pharm / M.Pharm">B.Pharm / M.Pharm</option>
                        <option value="DMLT / MLT">DMLT / MLT</option>
                        <option value="EMT-Paramedic">EMT-Paramedic</option>
                        <option value="BPT / MPT">BPT / MPT</option>
                        <option value="Other">Other Healthcare Credential</option>
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label htmlFor="modalExperience" className="form-label fw-bold small mb-1">
                        Years of Experience
                      </label>
                      <select
                        id="modalExperience"
                        className="form-select form-select-sm"
                        value={experienceYears}
                        onChange={(e) => setExperienceYears(e.target.value)}
                      >
                        <option value="0">Fresher / Intern (&lt; 1 yr)</option>
                        <option value="1">1 Year</option>
                        <option value="2">2 Years</option>
                        <option value="3">3-4 Years</option>
                        <option value="5">5-7 Years</option>
                        <option value="8">8+ Years</option>
                      </select>
                    </div>
                  </div>

                  {/* Resume / CV Section */}
                  <div className="mb-4">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label htmlFor="resumeFileInput" className="form-label fw-bold mb-0 small">
                        Candidate Resume / CV
                      </label>
                      <div className="btn-group btn-group-sm" role="group" aria-label="Resume submission type">
                        <button
                          type="button"
                          className={`btn btn-sm ${resumeMode === "file" ? "btn-secondary" : "btn-outline-secondary"}`}
                          onClick={() => setResumeMode("file")}
                        >
                          Document Upload
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${resumeMode === "link" ? "btn-secondary" : "btn-outline-secondary"}`}
                          onClick={() => setResumeMode("link")}
                        >
                          Online URL Link
                        </button>
                      </div>
                    </div>

                    {resumeMode === "file" ? (
                      <div>
                        {!resumeFile ? (
                          <>
                            <input
                              id="resumeFileInput"
                              type="file"
                              className="form-control form-control-sm"
                              accept=".pdf,.doc,.docx,.txt"
                              onChange={handleFileChange}
                            />
                            <div className="form-text small text-muted">
                              Accepted formats: PDF, DOCX, TXT (Maximum file size: 4MB).
                            </div>
                          </>
                        ) : (
                          <div className="d-flex justify-content-between align-items-center p-2 border rounded bg-light">
                            <div className="text-truncate small me-2">
                              📄 <strong>{resumeFile.fileName}</strong>{" "}
                              <span className="text-muted">({(resumeFile.fileSize / 1024).toFixed(0)} KB)</span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger py-0 px-2"
                              onClick={() => setResumeFile(null)}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <input
                          id="resumeUrlInput"
                          type="url"
                          className="form-control form-control-sm"
                          placeholder="https://linkedin.com/in/username or https://drive.google.com/..."
                          value={resumeUrl}
                          onChange={(e) => setResumeUrl(e.target.value)}
                        />
                        <div className="form-text small text-muted">
                          Public link to Google Drive, LinkedIn, or Cloud CV.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Statement of Purpose (SOP) Section */}
                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label htmlFor="sopTextarea" className="form-label fw-bold mb-0 small">
                        Statement of Purpose (SOP) <span className="text-danger">*</span>
                      </label>
                      <span
                        className={`badge ${
                          sopWordCount >= 150 && sopWordCount <= 260
                            ? "bg-success"
                            : sopWordCount >= 80
                            ? "bg-primary"
                            : sopWordCount > 0
                            ? "bg-secondary"
                            : "bg-light text-dark"
                        }`}
                      >
                        {sopWordCount} / ~200 words
                      </span>
                    </div>

                    <textarea
                      id="sopTextarea"
                      className="form-control form-control-sm"
                      rows={5}
                      required
                      placeholder="Outline your medical background, registration credentials (MMC/MNC), clinical competencies, and why you are applying to this healthcare organization..."
                      value={sop}
                      onChange={(e) => setSop(e.target.value)}
                    />

                    <div className="d-flex justify-content-between align-items-center mt-1">
                      <div className="form-text small">
                        {sopWordCount === 0 ? (
                          "Target: ~200 words covering clinical qualifications and availability."
                        ) : sopWordCount < 100 ? (
                          <span className="text-muted">{100 - sopWordCount} more words recommended for optimal review.</span>
                        ) : sopWordCount <= 260 ? (
                          <span className="text-success fw-bold">✓ Recommended length reached.</span>
                        ) : (
                          <span className="text-muted">{sopWordCount - 200} words over concise target.</span>
                        )}
                      </div>
                      <div className="text-muted small">{sop.length} chars</div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer bg-light border-top d-flex justify-content-between">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={closeApplyModal}
                    disabled={modalSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm px-4 fw-bold"
                    disabled={modalSubmitting}
                  >
                    {modalSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                        Submitting Application...
                      </>
                    ) : (
                      "Submit Application"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
