"use client";

import Link from "next/link";
import { useEffect, useState, useMemo, useCallback } from "react";
import { productApi, post } from "../../lib/productApi";
import EmergencyIcon from "../../components/EmergencyIcons";

// Badge color tone resolver for Bootstrap
function getOrgTypeBadgeTone(orgType) {
  switch (orgType) {
    case "hospital":
      return "tone-info";
    case "diagnostic":
      return "tone-success";
    case "blood_bank":
      return "tone-danger";
    case "ambulance":
      return "tone-warning";
    default:
      return "tone-neutral";
  }
}

function getOrgTypeIcon(orgType) {
  switch (orgType) {
    case "hospital":
      return <EmergencyIcon name="hospital" size={18} className="me-2" />;
    case "diagnostic":
      return <EmergencyIcon name="diagnostic" size={18} className="me-2" />;
    case "blood_bank":
      return <EmergencyIcon name="blood" size={18} className="me-2" />;
    case "ambulance":
      return <EmergencyIcon name="ambulance" size={18} className="me-2" />;
    default:
      return <EmergencyIcon name="building" size={18} className="me-2" />;
  }
}

function getOrgTypeDisplay(orgType) {
  switch (orgType) {
    case "hospital":
      return "Hospital";
    case "diagnostic":
      return "Diagnostic Centre";
    case "blood_bank":
      return "Blood Bank";
    case "ambulance":
      return "Ambulance Service";
    default:
      return "Organization";
  }
}

export default function Careers() {
  const [organizations, setOrganizations] = useState([]);
  const [apiStats, setApiStats] = useState({
    totalOrganizations: 0,
    hospitalCount: 0,
    bloodBankCount: 0,
    diagnosticCount: 0,
    ambulanceCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [orgTypeFilter, setOrgTypeFilter] = useState("All");

  // Application Modal State
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [roleInterested, setRoleInterested] = useState("");
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

  // Fetch organizations dynamically from backend API
  useEffect(() => {
    let live = true;
    setLoading(true);

    productApi("/api/organizations/careers")
      .then((res) => {
        if (!live) return;
        setOrganizations(res.data || []);
        if (res.stats) {
          setApiStats(res.stats);
        } else if (res.totalOrganizations !== undefined) {
          setApiStats({
            totalOrganizations: res.totalOrganizations,
            hospitalCount: res.hospitalCount || 0,
            bloodBankCount: res.bloodBankCount || 0,
            diagnosticCount: res.diagnosticCount || 0,
            ambulanceCount: res.ambulanceCount || 0,
          });
        }
        setError("");
      })
      .catch((err) => {
        if (!live) return;
        const msg =
          err.message === "Authentication required" || err.message?.includes("Authentication required")
            ? "Login required"
            : (err.message || "Failed to load organizations");
        setError(msg);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [revision]);

  // Filter organizations based on active search & selector criteria
  const filteredOrgs = useMemo(() => {
    return organizations.filter((org) => {
      // 1. Organization Type filter
      if (orgTypeFilter !== "All" && org.type !== orgTypeFilter) {
        return false;
      }

      // 2. Keyword / search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const orgName = (org.name || "").toLowerCase();
        const matchLoc = (org.locality || org.city || "").toLowerCase().includes(q);
        const matchName = orgName.includes(q);

        if (!matchName && !matchLoc) {
          return false;
        }
      }

      return true;
    });
  }, [organizations, orgTypeFilter, searchQuery]);

  // Group filtered orgs by type
  const groupedOrganizations = useMemo(() => {
    const groups = {
      hospital: [],
      blood_bank: [],
      diagnostic: [],
      ambulance: []
    };

    filteredOrgs.forEach((org) => {
      if (groups[org.type]) {
        groups[org.type].push(org);
      }
    });

    return [
      { type: "hospital", label: "Hospitals", orgs: groups.hospital },
      { type: "blood_bank", label: "Blood Banks", orgs: groups.blood_bank },
      { type: "diagnostic", label: "Diagnostic Centres", orgs: groups.diagnostic },
      { type: "ambulance", label: "Ambulances", orgs: groups.ambulance },
    ].filter(g => g.orgs.length > 0);
  }, [filteredOrgs]);

  // Reset all search and filter criteria
  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setOrgTypeFilter("All");
  }, []);

  // Modal open & close handlers
  const openApplyModal = useCallback((org) => {
    setSelectedOrg(org);
    setRoleInterested("");
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
    setSelectedOrg(null);
    setModalFeedback(null);
  }, []);

  // Keyboard escape listener for modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && selectedOrg) {
        closeApplyModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedOrg, closeApplyModal]);

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
    if (!selectedOrg) return;

    if (!roleInterested) {
      setModalFeedback({ type: "warning", message: "Please select a role you are interested in." });
      return;
    }
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
        organizationType: selectedOrg.type,
        roleInterested: roleInterested,
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

      const response = await post(`/api/organizations/${selectedOrg._id}/apply`, payload);

      setModalFeedback({
        type: "success",
        reference: response.application?.reference || null,
        message: (response.demo
          ? "Demo application recorded. No healthcare organization was contacted."
          : "Application recorded successfully.") + (response.application?.reference ? ` Reference: ${response.application.reference}.` : ""),
      });
      setSop("");
      setResumeFile(null);
      setResumeUrl("");
      setRoleInterested("");
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
          Explore and apply directly for clinical, diagnostic, and emergency services positions across discovered Mumbai healthcare organizations. Applications are tracked in real-time.
        </p>

        {/* Live Metrics Ribbon */}
        <div className="d-flex flex-wrap gap-3 align-items-center pt-2">
          <span className="badge bg-white text-dark border px-3 py-2 rounded-pill shadow-sm">
            <EmergencyIcon name="hospital" size={16} className="text-primary me-1" /> <strong>{apiStats.hospitalCount}</strong> Hospitals
          </span>
          <span className="badge bg-white text-dark border px-3 py-2 rounded-pill shadow-sm">
            <EmergencyIcon name="blood" size={16} className="text-danger me-1" /> <strong>{apiStats.bloodBankCount}</strong> Blood Banks
          </span>
          <span className="badge bg-white text-dark border px-3 py-2 rounded-pill shadow-sm">
            <EmergencyIcon name="diagnostic" size={16} className="text-success me-1" /> <strong>{apiStats.diagnosticCount}</strong> Diagnostic Centres
          </span>
          <span className="badge bg-white text-dark border px-3 py-2 rounded-pill shadow-sm">
            <EmergencyIcon name="ambulance" size={16} className="text-warning me-1" /> <strong>{apiStats.ambulanceCount}</strong> Ambulance Services
          </span>
          <span className="badge bg-white text-dark border px-3 py-2 rounded-pill shadow-sm">
            <EmergencyIcon name="building" size={16} className="text-dark me-1" /> <strong>{apiStats.totalOrganizations}</strong> Total Organizations
          </span>
          <span className="badge bg-light text-success border border-success-subtle px-3 py-2 rounded-pill">
            <EmergencyIcon name="check" size={14} className="text-success me-1" /> Populated from Crawled & Verified Healthcare Data
          </span>
        </div>
      </header>

      {/* Search & Filter Control Bar */}
      <section className="surface mb-4 shadow-sm" aria-label="Search and Filter Organizations">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Keyword Search */}
          <div className="col-12 col-lg-7">
            <label htmlFor="orgSearchInput" className="form-label fw-semibold small text-uppercase text-muted mb-1">
              Search Facility Name or Locality
            </label>
            <div className="input-group">
              <span className="input-group-text bg-light text-muted border-end-0"><EmergencyIcon name="search" size={16} /></span>
              <input
                id="orgSearchInput"
                type="text"
                className="form-control border-start-0 ps-0"
                placeholder="Search facility name, Bandra, Andheri..."
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
                  <EmergencyIcon name="close" size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Organization Type Selector */}
          <div className="col-12 col-lg-3">
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
              <option value="hospital">Hospital</option>
              <option value="diagnostic">Diagnostic Centre</option>
              <option value="blood_bank">Blood Bank</option>
              <option value="ambulance">Ambulance Service</option>
            </select>
          </div>

          {/* Reset Filters CTA */}
          <div className="col-12 col-lg-2 d-flex align-items-end">
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
          {[{val: "All", label: "All Providers", icon: "building"}, {val: "hospital", label: "Hospitals", icon: "hospital"}, {val: "diagnostic", label: "Diagnostic Labs", icon: "diagnostic"}, {val: "blood_bank", label: "Blood Banks", icon: "blood"}, {val: "ambulance", label: "EMS & Ambulances", icon: "ambulance"}].map((type) => (
            <button
              key={type.val}
              type="button"
              className={`btn btn-sm ${orgTypeFilter === type.val ? "btn-dark fw-bold" : "btn-light text-secondary border"}`}
              onClick={() => setOrgTypeFilter(type.val)}
            >
              <EmergencyIcon name={type.icon} size={14} className="me-1" /> {type.label}
            </button>
          ))}
        </div>
      </section>

      {/* Results Counter & Active Filter Indicators */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <span className="fw-bold text-dark">{filteredOrgs.length}</span> verified{" "}
          {filteredOrgs.length === 1 ? "organization" : "organizations"} available
        </div>
        {(searchQuery || orgTypeFilter !== "All") && (
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
          <span className="text-secondary fw-semibold">Loading verified healthcare organizations across Mumbai...</span>
        </div>
      )}

      {error && !loading && (
        <div className="alert alert-danger py-2 mb-4" role="alert">
          {error === "Authentication required" ? "Login required" : error}
          {(error === "Login required" || error === "Authentication required") && (
            <> · <Link href="/login?returnTo=%2Fcareers" className="alert-link">Sign in</Link></>
          )}
          {error !== "Login required" && error !== "Authentication required" && (
            <> · <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setRevision((value) => value + 1)}>Retry</button></>
          )}
        </div>
      )}

      {/* Empty State when zero orgs match */}
      {!loading && !error && filteredOrgs.length === 0 && (
        <div className="surface text-center py-5 px-3 my-4">
          <div className="mb-3 text-muted"><EmergencyIcon name="search" size={48} /></div>
          <h2 className="h4 fw-bold text-dark mb-2">No Verified Organizations Found</h2>
          <p className="text-secondary mx-auto mb-4" style={{ maxWidth: "480px" }}>
            No healthcare organizations match your selected filters. Try broadening your keywords or resetting filters.
          </p>
          <button type="button" className="btn btn-primary px-4" onClick={resetFilters}>
            Reset All Filters
          </button>
        </div>
      )}

      {/* Organization Sections */}
      <div className="d-flex flex-column gap-4">
        {groupedOrganizations.map((group) => (
          <section key={group.type} className="surface border rounded-3 p-4 shadow-sm" aria-labelledby={`group-${group.type}-title`}>
            {/* Group Header Card */}
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 pb-3 mb-3 border-bottom">
              <div>
                <h2 id={`group-${group.type}-title`} className="h4 fw-bold text-dark mb-1 d-flex align-items-center gap-2">
                  <span>{getOrgTypeIcon(group.type)}</span> {group.label}
                </h2>
              </div>
              <div className="text-end">
                <span className="badge bg-dark px-3 py-2 rounded-pill">
                  {group.orgs.length} {group.orgs.length === 1 ? "Organization" : "Organizations"}
                </span>
              </div>
            </div>

            {/* List of Organizations for this Group */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.orgs.map((org) => (
                <div key={org._id} className="col-12 col-xl-6">
                  <article className="card h-100 border p-3 d-flex flex-column justify-content-between bg-white hover-shadow">
                    <div>
                      {/* Category & Status Pill */}
                      <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                        <span className={`status-pill ${getOrgTypeBadgeTone(org.type)}`}>
                          {getOrgTypeDisplay(org.type)}
                        </span>
                        <span className="badge bg-light text-success border border-success-subtle">
                          <EmergencyIcon name="verified" size={14} className="text-success me-1" /> {org.verificationStatus === "verified" ? "MedReach Verified" : "Registered"}
                        </span>
                      </div>

                      {/* Org Name */}
                      <h3 className="h5 fw-bold mb-2 text-dark">
                        {org.name}
                      </h3>

                      {/* Location & Contact */}
                      <div className="d-flex flex-wrap gap-2 text-muted small mb-3">
                        {org.locality && <span><EmergencyIcon name="pin" size={14} className="text-muted me-1" /> {org.locality}{org.city && org.city !== org.locality ? `, ${org.city}` : ""}</span>}
                        {org.phone && (
                          <>
                            <span>·</span>
                            <span><EmergencyIcon name="phone" size={14} className="text-muted me-1" /> {org.phone}</span>
                          </>
                        )}
                      </div>

                      {/* Services/Specialties Preview */}
                      {((org.specialties && org.specialties.length > 0) || (org.services && org.services.length > 0)) && (
                        <div className="d-flex flex-wrap gap-1 mb-3">
                          {((org.specialties || []).concat(org.services || [])).slice(0, 4).map((item, idx) => (
                            <span key={idx} className="badge bg-light text-secondary border fw-normal">
                              {item}
                            </span>
                          ))}
                          {((org.specialties || []).concat(org.services || [])).length > 4 && (
                            <span className="badge bg-light text-secondary border fw-normal">...</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer Actions: Apply Button */}
                    <div className="d-flex justify-content-end align-items-center pt-3 border-top mt-auto">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary px-3 fw-bold"
                        onClick={() => openApplyModal(org)}
                        aria-label={`Apply Now for roles at ${org.name}`}
                      >
                        Apply Now
                      </button>
                    </div>
                  </article>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Application Modal */}
      {selectedOrg && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="applyModalLabel"
          style={{ backgroundColor: "rgba(16, 24, 40, 0.65)" }}
        >
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden my-8" role="document">
            <div className="modal-content border-0 shadow-lg rounded-3">
              <div className="modal-header bg-light border-bottom">
                <div>
                  <span className="eyebrow d-block mb-1">Direct Healthcare Application</span>
                  <h2 className="modal-title h5 fw-bold mb-0" id="applyModalLabel">
                    {selectedOrg.name}
                  </h2>
                  <p className="text-muted small mb-0">
                    {getOrgTypeDisplay(selectedOrg.type)} · {selectedOrg.locality || selectedOrg.city || "Mumbai"}
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
                <div className="p-6 overflow-y-auto max-h-[80vh]">
                  {/* Position Overview Banner */}
                  <div className="p-3 mb-4 rounded-2 bg-light border d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div>
                      <span className={`badge ${getOrgTypeBadgeTone(selectedOrg.type)} me-2`}>{getOrgTypeDisplay(selectedOrg.type)}</span>
                      <span className="badge bg-success-subtle text-success-emphasis border border-success-subtle">
                        {selectedOrg.verificationStatus === "verified" ? "Verified Partner" : "Registered"}
                      </span>
                    </div>
                  </div>

                  {/* Feedback Message */}
                  {modalFeedback && (
                    <div className={`alert alert-${modalFeedback.type} mb-4 small`} role="alert">
                      {modalFeedback.message === "Authentication required" ? "Login required" : modalFeedback.message}
                      {modalFeedback.reference && (
                        <> · <Link href={`/track?type=career&reference=${encodeURIComponent(modalFeedback.reference)}`} className="alert-link">Track application</Link></>
                      )}
                      {(modalFeedback.message === "Login required" || modalFeedback.message === "Authentication required") && (
                        <> · <Link href="/login?returnTo=%2Fcareers" className="alert-link">Sign in</Link></>
                      )}
                    </div>
                  )}

                  {/* Candidate Details Grid */}
                  <div className="row g-3 mb-3">
                    <div className="col-md-12">
                      <label htmlFor="modalRoleInterested" className="form-label fw-bold small mb-1">
                        Role Interested In <span className="text-danger">*</span>
                      </label>
                      <select
                        id="modalRoleInterested"
                        required
                        className="form-select form-select-sm"
                        value={roleInterested}
                        onChange={(e) => setRoleInterested(e.target.value)}
                      >
                        <option value="" disabled>Select a role...</option>
                        <option value="Doctor / Physician">Doctor / Physician</option>
                        <option value="Nurse / Nursing Staff">Nurse / Nursing Staff</option>
                        <option value="Lab Technician">Lab Technician</option>
                        <option value="Pharmacist">Pharmacist</option>
                        <option value="Paramedic / EMT">Paramedic / EMT</option>
                        <option value="Radiographer / Imaging Tech">Radiographer / Imaging Tech</option>
                        <option value="Physiotherapist">Physiotherapist</option>
                        <option value="Hospital Administrator">Hospital Administrator</option>
                        <option value="Blood Bank Technician">Blood Bank Technician</option>
                        <option value="Ambulance Driver / Pilot">Ambulance Driver / Pilot</option>
                        <option value="Receptionist / Front Desk">Receptionist / Front Desk</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div >
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
                    <div >
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
                              <EmergencyIcon name="file" size={15} className="me-1" /> <strong>{resumeFile.fileName}</strong>{" "}
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
                          <span className="text-success fw-bold"><EmergencyIcon name="check" size={13} className="me-1" /> Recommended length reached.</span>
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
