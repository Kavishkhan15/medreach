"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useAuth, useAdminResource, useAdminAction, adminList, adminEntity } from "@medreach/core";
import AdminDataState from "../../../components/AdminDataState";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
import { productApi, post } from "../../../lib/productApi";
import EmergencyIcon from "../../../components/EmergencyIcons";
import CareerVacancyEditor from "../../../components/CareerVacancyEditor";
import ProviderNav from "../../../components/ProviderNav";

const initialForm = {
  hospital: "",
  title: "",
  category: "Nurse",
  description: "",
  employmentType: "full_time",
  location: "Mumbai",
  department: "",
  vacancies: "",
  requirements: "",
  salaryText: "",
  deadline: "",
};

function isSafeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
    return (["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password) ||
      /^data:application\/(?:pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,[A-Za-z0-9+/]+={0,2}$/i.test(url);
  } catch {
    return false;
  }
}

const loadHospitals = (signal) => productApi("/api/hospital-admin/hospitals", { signal });
const loadProviders = (signal) => productApi("/api/providers/mine", { signal });
const parseProviders = adminList("organization");
const loadJobs = (signal) => productApi("/api/jobs/manage", { signal });
const parseHospitals = adminList("hospital"), parseJobs = adminList("job"), parseApplications = adminList("application");

export default function HospitalJobs({ providerMode = false }) {
  const { user, ready } = useAuth();
  const enabled = ready && ["system_admin", "provider_admin", "hospital_admin"].includes(user?.role);
  const hospitalResource = useAdminResource(providerMode ? loadProviders : loadHospitals, providerMode ? parseProviders : parseHospitals, enabled);
  const jobsResource = useAdminResource(loadJobs, parseJobs, enabled);
  const hospitals = hospitalResource.status === "success" ? hospitalResource.data : [];
  const jobs = jobsResource.status === "success" ? jobsResource.data : [];
  const [form, setForm] = useState(initialForm);
  const [expandedJobId, setExpandedJobId] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const visibleJobs = jobs.filter(job => (!jobStatus || job.status === jobStatus)
    && `${job.title} ${job.hospital?.name || job.provider?.name || job.organizationName || ""}`.toLowerCase().includes(jobSearch.trim().toLowerCase()));
  const loadApplicants = useCallback((signal) => productApi(`/api/jobs/${expandedJobId}/applications`, { signal }), [expandedJobId]);
  const applicantResource = useAdminResource(loadApplicants, parseApplications, enabled && Boolean(expandedJobId));
  const applications = applicantResource.status === "success" ? applicantResource.data : [];
  const action = useAdminAction();
  useEffect(() => {
    if (hospitalResource.status === "success") setForm((previous) => ({ ...previous, hospital: hospitalResource.data.some((h) => h._id === previous.hospital) ? previous.hospital : hospitalResource.data[0]?._id || "" }));
  }, [hospitalResource.status, hospitalResource.data]);
  const act = (fn, success = "Job update confirmed.") => action.run(fn, { validate: adminEntity("job"), success, refresh: jobsResource.reload });
  const loadApplications = (jobId) => setExpandedJobId((previous) => previous === jobId ? "" : jobId);
  const handleUpdateStatus = (appId, newStatus) => action.run(() => productApi(`/api/applications/${appId}`, { method: "PATCH", body: { status: newStatus } }), { validate: adminEntity("application"), success: `Applicant update to ${newStatus.replaceAll("_", " ")} confirmed.`, refresh: applicantResource.reload, target: appId });
  if (!ready) return <><h1>Job Listings &amp; Applications</h1><p role="status">Loading hospital careers…</p></>;
  if (!enabled) return <><h1>Job Listings &amp; Applications</h1><p>Provider administrator access is required. <Link href={`/login?returnTo=${encodeURIComponent(providerMode ? "/provider/jobs" : "/hospital/jobs")}`}>Sign in</Link></p></>;
  return (
    <div className="provider-workspace provider-jobs">
      <Link href={providerMode ? "/provider" : "/hospital"} className="text-decoration-none">
        ← Back to {providerMode ? "Provider" : "Hospital"} Workspace
      </Link>

      <div className="page-head my-3">
        <h1>Job Listings & Applications</h1>
        <p>Create a role, send it for review and manage the people who apply. Job applications are separate from general organisation applications.</p>
      </div>
      {providerMode && <ProviderNav />}
      <ol className="provider-job-steps" aria-label="How job publishing works"><li><strong>1. Save a draft</strong><span>Add the role, requirements and position count.</span></li><li><strong>2. Submit for review</strong><span>A System Admin reviews the listing before it appears in Careers.</span></li><li><strong>3. Review applicants</strong><span>Shortlist candidates and update filled positions after hiring.</span></li></ol>
      <nav className="provider-jump-links" aria-label="On this jobs page"><a href="#provider-job-listings">Review your listings</a><a href="#provider-job-draft">Create a job draft</a></nav>

      <AdminActionFeedback action={action} refresh={action.target ? applicantResource.reload : jobsResource.reload} />

      <div className="row g-4">
        {/* Left Column: Create Job Draft */}
        <div className="col-lg-5">
          <AdminDataState resource={hospitalResource} label="career hospital assignments" emptyMessage="No organisation assigned for job creation. Contact your System Admin to request access."><form
            id="provider-job-draft"
            className="surface vstack gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const payload = { ...form, vacancies: form.vacancies === "" ? null : Number(form.vacancies), deadline: form.deadline ? `${form.deadline}T23:59:59+05:30` : undefined };
              const organization = hospitals.find((item) => item._id === form.hospital);
              const saved = await act(() => post("/api/jobs", providerMode ? { ...payload, hospital: organization?.kind === "hospital" ? form.hospital : undefined, provider: organization?.kind !== "hospital" ? form.hospital : undefined } : payload), "Job draft created successfully.");
              if (saved) setForm(previous => ({ ...initialForm, hospital: previous.hospital }));
            }}
          >
            <fieldset disabled={action.disabled} className="vstack gap-2">
            <h2 className="h4 mb-2">Create a job draft</h2>
            <p className="text-secondary">Saving a draft keeps it private. Submit it for review from your listings when it is ready.</p>

            <div>
              <label className="form-label small fw-bold" htmlFor="jhospital">
                Assigned organisation
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
                maxLength={160}
                required
                placeholder="e.g. Senior Emergency Resident"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="row g-3">
              <div className="col-sm-6">
                <label className="form-label" htmlFor="jdepartment">Department</label>
                <input id="jdepartment" className="form-control" maxLength={100} value={form.department}
                  onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="e.g. Emergency medicine" />
              </div>
              <div className="col-sm-6">
                <label className="form-label" htmlFor="jvacancies">Total positions (optional)</label>
                <input id="jvacancies" className="form-control" type="number" min="0" max="10000" step="1" value={form.vacancies}
                  onChange={(event) => setForm({ ...form, vacancies: event.target.value })} placeholder="Not reported" />
              </div>
            </div>
            <p className="text-secondary mb-2">Only report authorised positions. Leaving the count blank shows availability as unknown.</p>

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
                Role description
              </label>
              <textarea
                id="jdescription"
                className="form-control form-control-sm"
                rows={4}
                minLength={10}
                maxLength={4000}
                required
                placeholder="Outline clinical expectations, shift schedules, and ICU/ward responsibilities…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label" htmlFor="jrequirements">Qualifications and requirements</label>
              <textarea id="jrequirements" className="form-control" rows={3} maxLength={2000} value={form.requirements}
                onChange={(event) => setForm({ ...form, requirements: event.target.value })} placeholder="Required qualifications, experience and certifications" />
            </div>
            <div>
              <label className="form-label" htmlFor="jlocation">Work location</label>
              <input id="jlocation" className="form-control" maxLength={160} value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })} />
            </div>
            <div>
              <label className="form-label" htmlFor="jsalary">Salary or compensation (optional)</label>
              <input id="jsalary" className="form-control" maxLength={100} value={form.salaryText}
                onChange={(event) => setForm({ ...form, salaryText: event.target.value })} placeholder="e.g. ₹40,000–₹50,000 per month" />
            </div>
            <div>
              <label className="form-label" htmlFor="jdeadline">Application deadline (optional)</label>
              <input id="jdeadline" className="form-control" type="date" value={form.deadline}
                onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
            </div>

            <button className="btn btn-primary btn-sm mt-2 fw-bold" disabled={action.disabled || !form.hospital}>
              Save Job Draft
            </button>
            </fieldset>
          </form></AdminDataState>
        </div>

        {/* Right Column: Listings & Review Applicants */}
        <div className="col-lg-7">
          <div className="surface" id="provider-job-listings">
            <div className="d-flex flex-wrap justify-content-between gap-2 mb-3"><h2 className="h4 mb-0">Your job listings</h2><button type="button" className="btn btn-outline-primary" disabled={jobsResource.status === "loading" || action.disabled} onClick={jobsResource.reload}>Refresh listings</button></div>
            <div className="row g-3 mb-3"><div className="col-sm-7"><label className="form-label" htmlFor="managed-job-search">Find a role or organisation</label><input id="managed-job-search" className="form-control" value={jobSearch} onChange={event => { setJobSearch(event.target.value); setExpandedJobId(""); }} placeholder="Search your listings" /></div><div className="col-sm-5"><label className="form-label" htmlFor="managed-job-status">Listing status</label><select id="managed-job-status" className="form-select" value={jobStatus} onChange={event => { setJobStatus(event.target.value); setExpandedJobId(""); }}><option value="">All statuses</option><option value="draft">Draft</option><option value="pending">Awaiting review</option><option value="published">Published</option><option value="closed">Closed</option><option value="rejected">Not approved</option></select></div></div>
            <AdminDataState resource={jobsResource} label="managed jobs" emptyMessage="No job listings found for your managed hospitals.">

            {jobs.length > 0 && visibleJobs.length === 0 && <p role="status">No listings match your filters. <button type="button" className="btn btn-link" onClick={() => { setJobSearch(""); setJobStatus(""); }}>Clear job filters</button></p>}
            {visibleJobs.map((job) => {
              const isExpanded = expandedJobId === job._id;
              return (
                <article key={job._id} className="border-top py-3" aria-label={job.title}>
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div>
                      <strong className="h6 d-block mb-1">{job.title}</strong>
                      <p className="small text-secondary mb-2">
                        {job.hospital?.name || job.provider?.name} · <span className="text-capitalize">{job.category}</span> · {job.employmentType?.replaceAll("_", " ")}
                      </p>
                    </div>
                    <span className={`status-pill ${job.status === "published" ? "tone-success" : job.status === "pending" ? "tone-warning" : job.status === "rejected" ? "tone-danger" : "tone-neutral"}`}>{job.status === "pending" ? "Awaiting review" : job.status === "rejected" ? "Not approved" : job.status.charAt(0).toUpperCase() + job.status.slice(1)}</span>
                  </div>
                  <p className="text-secondary">{({ draft: "Private draft. Submit it when the details are ready.", pending: "Waiting for System Admin review. This role is not public yet.", published: "Visible in Careers. Applicants can apply while positions remain open and the deadline has not passed.", closed: "This listing is closed to new applications. Existing candidates remain available for review.", rejected: "This listing was not approved. Contact your System Admin before revising the role." })[job.status]}</p>

                  <CareerVacancyEditor job={job} disabled={action.disabled} onSave={(body) => act(
                    () => productApi(`/api/jobs/${job._id}/availability`, { method: "PATCH", body }),
                    "Position counts updated. A full listing no longer accepts new applications.",
                  )} />

                  <div className="d-flex flex-wrap gap-2 mb-2">
                    {job.status === "draft" && (
                      <button disabled={action.disabled}
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => act(() => post(`/api/jobs/${job._id}/status`, { status: "published" }), "Listing submission confirmed. Check its status for publication or pending review.")}
                      >
                        {user.role === "system_admin" ? "Publish listing" : "Submit for review"}
                      </button>
                    )}
                    {job.status === "published" && (
                      <button disabled={action.disabled}
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => act(() => post(`/api/jobs/${job._id}/status`, { status: "closed" }), "Listing closed.")}
                      >
                        Close Listing
                      </button>
                    )}
                    <button disabled={action.disabled}
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
                    <div id={`apps-${job._id}`} className="mt-3 bg-light p-3 rounded">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h3 className="h6 fw-bold mb-0">Candidate Applications{applicantResource.status === "success" ? ` (${applications.length})` : ""}</h3>
                      </div>

                      <AdminDataState resource={applicantResource} label="applicants" emptyMessage="No candidates have applied for this listing yet.">
                      {applications.map((app) => {
                        const candName = app.candidateName || app.applicant?.name || "Candidate";
                        const candEmail = app.contactEmail || app.applicant?.email || "Not specified";
                        const candPhone = app.candidatePhone || app.phone || app.applicant?.emergencyContact || "Not specified";
                        const candQual = app.qualifications || app.qualification || app.degree || "Not provided";
                        const candExp = app.experienceYears !== undefined ? `${app.experienceYears} Year(s)` : app.experience !== undefined ? `${app.experience} Year(s)` : "Not provided";
                        const sopText = app.sop || app.statement || "";
                        const sopWords = sopText.trim() ? sopText.trim().split(/\s+/).filter(Boolean).length : 0;
                        const isUpdating = action.disabled;

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
                      </AdminDataState>
                    </div>
                  )}
                </article>
              );
            })}
            </AdminDataState>
          </div>
        </div>
      </div>
    </div>
  );
}
