"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@medreach/core";
import { productApi, post } from "../../../lib/productApi";
import EmergencyIcon from "../../../components/EmergencyIcons";

const QUALIFICATIONS = [
  "MBBS",
  "MD / MS / DNB",
  "B.Sc Nursing",
  "M.Sc Nursing / GNM",
  "B.Pharm / M.Pharm",
  "DMLT / Medical Lab Tech",
  "EMT-B (Basic EMT)",
  "EMT-P (Paramedic)",
  "BPT / MPT (Physiotherapy)",
  "BHA / MHA (Hospital Administration)",
  "Other Clinical / Healthcare Credential",
];

function isValidHttpUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

export default function JobDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [jobRevision, setJobRevision] = useState(0);

  // Candidate Form Fields
  const [candidateName, setCandidateName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [qualification, setQualification] = useState("MBBS");
  const [customQualification, setCustomQualification] = useState("");
  const [experience, setExperience] = useState("2");
  const [sop, setSop] = useState("");

  // Resume State
  const [resume, setResume] = useState(null);
  const [resumeUrlInput, setResumeUrlInput] = useState("");
  const [resumeMode, setResumeMode] = useState("file"); // "file" | "link"
  const [resumeError, setResumeError] = useState("");

  // Submission / Confirmation State
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionRecap, setSubmissionRecap] = useState(null);

  // Track if user manually modified prefillable fields
  const isDirtyRef = useRef(false);

  // Fetch Job details with unmount cleanup
  useEffect(() => {
    let active = true;
    setLoadingJob(true);
    setStatus("");
    productApi(`/api/jobs/${id}`)
      .then((res) => {
        if (active) {
          setJob(res.job);
          setLoadingJob(false);
        }
      })
      .catch((err) => {
        if (active) {
          const msg =
            err.message === "Authentication required" || err.message?.includes("Authentication required")
              ? "Login required"
              : (err.message || "Failed to load job details.");
          setStatus(msg);
          setLoadingJob(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, jobRevision]);

  // Pre-fill user details if logged in and form is untouched
  useEffect(() => {
    if (user && !isDirtyRef.current) {
      if (user.name) setCandidateName((prev) => prev || user.name);
      if (user.email) setContactEmail((prev) => prev || user.email);
      if (user.emergencyContact || user.phone) {
        setContactPhone((prev) => prev || user.emergencyContact || user.phone || "");
      }
    }
  }, [user]);

  // Live word count calculation for SOP
  const trimmedSop = sop.trim();
  const wordCount = trimmedSop ? trimmedSop.split(/\s+/).filter(Boolean).length : 0;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      setResumeError("Resume file size must be less than 4MB.");
      e.target.value = "";
      return;
    }
    setResumeError("");

    const reader = new FileReader();
    reader.onload = () => {
      setResume({
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileUrl: reader.result,
        fileSize: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  const removeResume = () => {
    setResume(null);
    setResumeUrlInput("");
    setResumeError("");
  };

  const handleApply = async (e) => {
    e.preventDefault();
    setStatus("");

    if (!candidateName.trim()) {
      setStatus("Please provide candidate full name.");
      return;
    }
    if (!contactEmail.trim() || !contactEmail.includes("@")) {
      setStatus("Please provide a valid contact email.");
      return;
    }
    if (!contactPhone.trim()) {
      setStatus("Please provide candidate contact phone number.");
      return;
    }

    // Word count target validation (~200 words, minimum 20 words)
    if (wordCount < 20) {
      setStatus("Please provide a more detailed Statement of Purpose (minimum 20 words, target ~200 words).");
      return;
    }

    // Resume resolution & strict scheme validation
    let finalResume = resume;
    if (resumeMode === "link") {
      const cleanUrl = resumeUrlInput.trim();
      if (!cleanUrl) {
        setStatus("Please provide a link to your resume or switch to file upload.");
        return;
      }
      if (!isValidHttpUrl(cleanUrl)) {
        setResumeError("Invalid resume URL. Only secure http:// or https:// links are permitted.");
        return;
      }
      finalResume = {
        fileName: "Online Resume / Portfolio",
        fileUrl: cleanUrl,
        fileType: "link",
        fileSize: 0,
      };
    }

    if (!finalResume || !finalResume.fileUrl) {
      setStatus("Please upload your resume file or provide a valid URL link.");
      return;
    }

    const effectiveQualification =
      qualification === "Other Clinical / Healthcare Credential" && customQualification.trim()
        ? customQualification.trim()
        : qualification;

    setSubmitting(true);
    setStatus("Submitting your clinical application…");

    try {
      const payload = {
        candidateName: candidateName.trim(),
        contactEmail: contactEmail.trim().toLowerCase(),
        contactPhone: contactPhone.trim(),
        qualifications: effectiveQualification,
        qualification: effectiveQualification,
        experienceYears: Number(experience) || 0,
        experience: Number(experience) || 0,
        sop: sop.trim(),
        statement: sop.trim(),
        resume: finalResume,
      };

      const result = await post(`/api/jobs/${id}/apply`, payload);

      const refId = result.application?.reference || null;

      const orgName = job?.hospital?.name || job?.provider?.name || job?.organizationName || "Healthcare Facility";

      setSubmissionRecap({
        referenceId: refId,
        jobTitle: job?.title,
        hospitalName: orgName,
        candidateName: candidateName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        qualification: effectiveQualification,
        experience: `${experience} Year(s)`,
        sop: sop.trim(),
        wordCount,
        resumeName: finalResume.fileName,
        resumeUrl: finalResume.fileUrl,
        isLink: finalResume.fileType === "link",
        submittedAt: new Date().toLocaleString(),
        isDemo: Boolean(result.demo || job?.demo),
      });

      setStatus("");
    } catch (err) {
      const msg =
        err.message === "Authentication required" || err.message?.includes("Authentication required")
          ? "Login required"
          : (err.message || "Failed to submit application. Please check all fields and try again.");
      setStatus(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const orgName = job?.hospital?.name || job?.provider?.name || job?.organizationName || "Healthcare Provider";
  const orgLocation = job?.location || job?.hospital?.locality || job?.provider?.locality || "Mumbai";

  return (
    <>
      <div className="d-print-none mb-3">
        <Link href="/careers" className="small text-decoration-none">
          ← Back to Careers
        </Link>
      </div>

      {loadingJob && <p className="mt-3 text-secondary">Loading role details…</p>}

      {!loadingJob && !job && (
        <div className="alert alert-warning mt-3" role="alert">
          {status === "Authentication required" ? "Login required" : (status || "Job listing not found or is no longer active.")}
          {(status === "Login required" || status === "Authentication required") && (
            <> · <Link href={`/login?returnTo=${encodeURIComponent(`/jobs/${id}`)}`} className="alert-link">Sign in</Link></>
          )}
          {status && status !== "Login required" && status !== "Authentication required" && (
            <> · <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setJobRevision((value) => value + 1)}>Retry</button></>
          )}
        </div>
      )}

      {job && (
        <div className="row g-4 mt-1">
          {/* Left Column: Job Description & Details */}
          <div className="col-lg-6 d-print-none">
            <article className="surface h-100">
              <span className="eyebrow">{job.category}</span>
              <h1 className="h3 mt-1 mb-2">{job.title}</h1>
              <p className="text-secondary mb-3">
                <strong>{orgName}</strong> · {orgLocation}
              </p>

              <div className="d-flex flex-wrap gap-2 mb-4">
                <span className="status-pill tone-info">
                  {job.employmentType?.replaceAll("_", " ")}
                </span>
                <span className="status-pill tone-success">
                  {job.verificationStatus}
                </span>
                {job.demo && <span className="status-pill tone-warning">DEMO ROLE</span>}
              </div>

              <h2 className="h6 text-uppercase text-muted fw-bold">Role Description</h2>
              <p className="pre-line text-body mb-4">{job.description}</p>

              <h2 className="h6 text-uppercase text-muted fw-bold">Requirements & Qualifications</h2>
              <p className="pre-line text-body mb-4">
                {job.requirements || "Standard clinical registration and medical council clearance required."}
              </p>

              {job.salaryText && (
                <div className="p-3 bg-light rounded-2 border mb-3">
                  <strong>Compensation:</strong> {job.salaryText}
                </div>
              )}

              {job.deadline && (
                <div className="small text-muted">
                  <strong>Application Deadline:</strong>{" "}
                  {new Date(job.deadline).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              )}
            </article>
          </div>

          {/* Right Column: Application Form OR Confirmation View */}
          <div className="col-lg-6">
            {submissionRecap ? (
              /* CLEAN CONFIRMATION VIEW UPON SUBMISSION */
              <div className="surface border-success shadow-sm">
                <div className="text-center pb-3 border-bottom mb-3">
                  <div className="badge bg-success-subtle text-success border border-success-subtle px-3 py-2 fs-6 mb-2">
                    <EmergencyIcon name="verified" size={20} className="text-success me-2" /> Application Submitted Successfully
                  </div>
                  <h2 className="h4 mb-1">{submissionRecap.jobTitle}</h2>
                  <p className="text-secondary small mb-0">{submissionRecap.hospitalName}</p>
                </div>

                {submissionRecap.isDemo && (
                  <div className="alert alert-warning small py-2">
                    <strong>Demo Notice:</strong> This application was recorded in demo simulation mode.
                  </div>
                )}

                {/* Reference ID Card */}
                <div className="p-3 bg-light rounded border text-center mb-3">
                  {submissionRecap.referenceId ? (
                    <><span className="text-muted small text-uppercase fw-semibold d-block">Application Reference ID</span><code className="fs-5 fw-bold text-primary">{submissionRecap.referenceId}</code></>
                  ) : (
                    <span className="text-muted small">Application recorded. No reference ID was returned.</span>
                  )}
                  <div className="text-muted small mt-1">Submitted on {submissionRecap.submittedAt}</div>
                  {submissionRecap.referenceId && (
                    <Link href={`/track?type=career&reference=${encodeURIComponent(submissionRecap.referenceId)}`} className="small">Track application</Link>
                  )}
                </div>

                {/* Candidate Details Recap */}
                <h3 className="h6 text-uppercase text-muted fw-bold mb-2">Candidate Details Recap</h3>
                <dl className="row small mb-3">
                  <dt className="col-sm-4 text-muted">Full Name</dt>
                  <dd className="col-sm-8 fw-semibold">{submissionRecap.candidateName}</dd>

                  <dt className="col-sm-4 text-muted">Contact Email</dt>
                  <dd className="col-sm-8">{submissionRecap.contactEmail}</dd>

                  <dt className="col-sm-4 text-muted">Contact Phone</dt>
                  <dd className="col-sm-8">{submissionRecap.contactPhone}</dd>

                  <dt className="col-sm-4 text-muted">Qualification</dt>
                  <dd className="col-sm-8 fw-semibold">{submissionRecap.qualification}</dd>

                  <dt className="col-sm-4 text-muted">Experience</dt>
                  <dd className="col-sm-8">{submissionRecap.experience}</dd>

                  <dt className="col-sm-4 text-muted">Resume / CV</dt>
                  <dd className="col-sm-8 text-truncate">
                    <EmergencyIcon name="file" size={16} className="me-2" /> {submissionRecap.resumeName}
                  </dd>
                </dl>

                {/* Statement of Purpose Recap */}
                <div className="mb-4">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="small text-muted fw-bold text-uppercase">Statement of Purpose</span>
                    <span className="badge bg-secondary">{submissionRecap.wordCount} words</span>
                  </div>
                  <div className="p-3 bg-light rounded border small pre-line text-secondary" style={{ maxHeight: "180px", overflowY: "auto" }}>
                    {submissionRecap.sop}
                  </div>
                </div>

                {/* Action Buttons: Print, Dashboard, Back to Careers */}
                <div className="d-flex flex-wrap gap-2 d-print-none">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="btn btn-outline-secondary flex-grow-1"
                  >
                    <EmergencyIcon name="printer" size={16} className="me-1" /> Print Application
                  </button>
                  <Link href="/dashboard" className="btn btn-primary flex-grow-1">
                    Go to Dashboard
                  </Link>
                </div>
                <div className="mt-3 text-center d-print-none">
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-decoration-none"
                    onClick={() => {
                      setSubmissionRecap(null);
                      setSop("");
                      removeResume();
                    }}
                  >
                    Submit another application
                  </button>
                </div>
              </div>
            ) : (
              /* PROPER APPLICATION FORM */
              <form className="surface sticky-top" style={{ top: "1.5rem" }} onSubmit={handleApply} noValidate>
                <h2 className="h5 mb-3">Apply for this Position</h2>

                {user && (
                  <div className="alert alert-info py-2 px-3 small mb-3">
                    Logged in as <strong>{user.name || user.email}</strong>. Candidate details pre-filled below.
                  </div>
                )}

                {/* Candidate Full Name */}
                <div className="mb-3">
                  <label htmlFor="candidateName" className="form-label fw-bold small mb-1">
                    Full Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    id="candidateName"
                    required
                    className="form-control form-control-sm"
                    placeholder="e.g. Dr. Aditi Sharma"
                    value={candidateName}
                    onChange={(e) => {
                      isDirtyRef.current = true;
                      setCandidateName(e.target.value);
                    }}
                  />
                </div>

                {/* Email and Phone Grid */}
                <div className="row g-2 mb-3">
                  <div className="col-sm-6">
                    <label htmlFor="contactEmail" className="form-label fw-bold small mb-1">
                      Email Address <span className="text-danger">*</span>
                    </label>
                    <input
                      type="email"
                      id="contactEmail"
                      required
                      className="form-control form-control-sm"
                      placeholder="name@hospital.org"
                      value={contactEmail}
                      onChange={(e) => {
                        isDirtyRef.current = true;
                        setContactEmail(e.target.value);
                      }}
                    />
                  </div>
                  <div className="col-sm-6">
                    <label htmlFor="contactPhone" className="form-label fw-bold small mb-1">
                      Contact Phone <span className="text-danger">*</span>
                    </label>
                    <input
                      type="tel"
                      id="contactPhone"
                      required
                      className="form-control form-control-sm"
                      placeholder="+91 98765 43210"
                      value={contactPhone}
                      onChange={(e) => {
                        isDirtyRef.current = true;
                        setContactPhone(e.target.value);
                      }}
                    />
                  </div>
                </div>

                {/* Highest Qualification & Experience Grid */}
                <div className="row g-2 mb-3">
                  <div className="col-sm-7">
                    <label htmlFor="qualification" className="form-label fw-bold small mb-1">
                      Highest Qualification <span className="text-danger">*</span>
                    </label>
                    <select
                      id="qualification"
                      className="form-select form-select-sm"
                      value={qualification}
                      onChange={(e) => setQualification(e.target.value)}
                    >
                      {QUALIFICATIONS.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                    {qualification === "Other Clinical / Healthcare Credential" && (
                      <input
                        type="text"
                        className="form-control form-control-sm mt-1"
                        placeholder="Specify degree / credentials"
                        required
                        value={customQualification}
                        onChange={(e) => setCustomQualification(e.target.value)}
                      />
                    )}
                  </div>
                  <div className="col-sm-5">
                    <label htmlFor="experience" className="form-label fw-bold small mb-1">
                      Years of Experience <span className="text-danger">*</span>
                    </label>
                    <select
                      id="experience"
                      className="form-select form-select-sm"
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                    >
                      <option value="0">Fresher / Intern (&lt; 1 yr)</option>
                      <option value="1">1 Year</option>
                      <option value="2">2 Years</option>
                      <option value="3">3-4 Years</option>
                      <option value="5">5-7 Years</option>
                      <option value="8">8-10 Years</option>
                      <option value="10">10+ Years</option>
                    </select>
                  </div>
                </div>

                {/* Resume Section */}
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label htmlFor="resumeFile" className="form-label fw-bold small mb-0">
                      Resume / CV <span className="text-danger">*</span>
                    </label>
                    <div className="btn-group btn-group-sm" role="group" aria-label="Resume upload mode">
                      <button
                        type="button"
                        className={`btn btn-sm ${resumeMode === "file" ? "btn-secondary" : "btn-outline-secondary"}`}
                        onClick={() => setResumeMode("file")}
                        aria-pressed={resumeMode === "file"}
                      >
                        File Upload
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${resumeMode === "link" ? "btn-secondary" : "btn-outline-secondary"}`}
                        onClick={() => setResumeMode("link")}
                        aria-pressed={resumeMode === "link"}
                      >
                        URL Link
                      </button>
                    </div>
                  </div>

                  {resumeMode === "file" ? (
                    <div>
                      {!resume ? (
                        <>
                          <input
                            type="file"
                            id="resumeFile"
                            className="form-control form-control-sm"
                            accept=".pdf,.doc,.docx,.txt"
                            onChange={handleFileChange}
                            aria-describedby="resumeHelp"
                          />
                          <div id="resumeHelp" className="form-text small">
                            Accepted formats: PDF, DOCX, TXT (Maximum size: 4MB)
                          </div>
                        </>
                      ) : (
                        <div className="d-flex justify-content-between align-items-center p-2 border rounded bg-light">
                          <div className="text-truncate me-2 small">
                            <EmergencyIcon name="file" size={16} className="me-1" /> <strong>{resume.fileName}</strong>{" "}
                            <span className="text-muted">({(resume.fileSize / 1024).toFixed(0)} KB)</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger py-0 px-2"
                            onClick={removeResume}
                            aria-label="Remove uploaded resume"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <input
                        type="url"
                        id="resumeUrl"
                        className="form-control form-control-sm"
                        placeholder="https://drive.google.com/... or portfolio link"
                        value={resumeUrlInput}
                        onChange={(e) => setResumeUrlInput(e.target.value)}
                        aria-describedby="resumeUrlHelp"
                      />
                      <div id="resumeUrlHelp" className="form-text small">
                        Public link to Google Drive, LinkedIn, or Cloud CV (http/https only)
                      </div>
                    </div>
                  )}
                  {resumeError && <div className="text-danger small mt-1">{resumeError}</div>}
                </div>

                {/* Statement of Purpose (SOP) Section */}
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label htmlFor="sop" className="form-label fw-bold small mb-0">
                      Statement of Purpose (SOP) <span className="text-danger">*</span>
                    </label>
                    <span
                      className={`badge ${
                        wordCount >= 160 && wordCount <= 250
                          ? "bg-success"
                          : wordCount >= 100
                          ? "bg-primary"
                          : wordCount > 0
                          ? "bg-secondary"
                          : "bg-light text-dark border"
                      }`}
                      aria-live="polite"
                    >
                      {wordCount} / ~200 words
                    </span>
                  </div>

                  <textarea
                    id="sop"
                    className="form-control form-control-sm"
                    rows={6}
                    required
                    placeholder="Write a concise Statement of Purpose (~200 words) describing:&#10;• Clinical competencies and registrations (MMC/MNC)&#10;• Motivation to serve at this healthcare facility&#10;• Availability and emergency department readiness"
                    value={sop}
                    onChange={(e) => setSop(e.target.value)}
                    aria-describedby="sopHelp"
                  />

                  <div id="sopHelp" className="d-flex justify-content-between align-items-center mt-1">
                    <div className="form-text small">
                      {wordCount === 0 ? (
                        "Target: ~200 words"
                      ) : wordCount < 150 ? (
                        <span className="text-muted">{150 - wordCount} more words recommended</span>
                      ) : wordCount <= 250 ? (
                        <span className="text-success fw-bold"><EmergencyIcon name="check" size={14} className="me-1" /> Optimal length (~200 words)</span>
                      ) : (
                        <span className="text-muted">{wordCount - 200} words over target</span>
                      )}
                    </div>
                    <div className="text-muted small">{sop.length} chars</div>
                  </div>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  className="btn btn-primary w-100 py-2 fw-bold"
                  disabled={submitting}
                  aria-busy={submitting}
                >
                  {submitting ? "Submitting Application…" : "Submit Application"}
                </button>

                {status && (
                  <div
                    className={`alert mt-3 mb-0 small ${
                      status.includes("Submitting") ? "alert-info" : "alert-warning"
                    }`}
                    role="status"
                  >
                    {status === "Authentication required" ? "Login required" : status}
                    {(status === "Login required" || status === "Authentication required") && (
                      <> · <Link href={`/login?returnTo=${encodeURIComponent(`/jobs/${id}`)}`} className="alert-link">Sign in</Link></>
                    )}
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
