"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi, post } from "../../../lib/productApi";

export default function JobDetail({ params }) {
  const [job, setJob] = useState(null);
  const [sop, setSop] = useState("");
  const [resume, setResume] = useState(null);
  const [resumeUrlInput, setResumeUrlInput] = useState("");
  const [resumeMode, setResumeMode] = useState("file"); // "file" | "link"
  const [resumeError, setResumeError] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    productApi(`/api/jobs/${params.id}`)
      .then((r) => setJob(r.job))
      .catch((e) => setStatus(e.message));
  }, [params.id]);

  // Calculate word count
  const trimmed = sop.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 4MB
    if (file.size > 4 * 1024 * 1024) {
      setResumeError("Resume file size must be less than 4MB");
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

  const apply = async (e) => {
    e.preventDefault();
    if (wordCount < 40) {
      setStatus("Please provide a more detailed Statement of Purpose (aim for about 200 words).");
      return;
    }

    let finalResume = resume;
    if (resumeMode === "link" && resumeUrlInput.trim()) {
      finalResume = {
        fileName: "Resume Link",
        fileUrl: resumeUrlInput.trim(),
        fileType: "link",
      };
    }

    if (!finalResume || !finalResume.fileUrl) {
      setStatus("Please upload or provide a link to your resume.");
      return;
    }

    setSubmitting(true);
    setStatus("Submitting application…");

    try {
      const result = await post(`/api/jobs/${params.id}/apply`, {
        sop,
        statement: sop,
        resume: finalResume,
      });
      setStatus(
        result.demo
          ? "Demo application recorded; it was not delivered as a real hospital application."
          : "Application submitted successfully! Track it from your dashboard."
      );
      setSop("");
      setResume(null);
      setResumeUrlInput("");
    } catch (err) {
      setStatus(err.message || "Failed to submit application");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Link href="/careers" className="small text-decoration-none">
        ← Back to Careers
      </Link>

      {!job && <p className="mt-3 text-secondary">{status || "Loading role details…"}</p>}

      {job && (
        <div className="row g-4 mt-2">
          {/* Job description & requirements */}
          <div className="col-lg-7">
            <article className="surface h-100">
              <span className="eyebrow">{job.category}</span>
              <h1 className="h3 mt-1 mb-2">{job.title}</h1>
              <p className="text-secondary mb-3">
                <strong>{job.hospital?.name}</strong> · {job.location || job.hospital?.locality || "Mumbai"}
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
                {job.requirements || "Contact hospital administration for specific clinical prerequisites."}
              </p>

              {job.salaryText && (
                <div className="p-3 bg-light rounded-2 border">
                  <strong>Compensation:</strong> {job.salaryText}
                </div>
              )}
            </article>
          </div>

          {/* Application Form */}
          <div className="col-lg-5">
            <form className="surface sticky-top" style={{ top: "1.5rem" }} onSubmit={apply}>
              <h2 className="h5 mb-3">Apply for this Position</h2>

              {/* Resume Section */}
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label className="form-label fw-bold mb-0">Resume / CV</label>
                  <div className="btn-group btn-group-sm">
                    <button
                      type="button"
                      className={`btn btn-sm ${resumeMode === "file" ? "btn-secondary" : "btn-outline-secondary"}`}
                      onClick={() => setResumeMode("file")}
                    >
                      File Upload
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${resumeMode === "link" ? "btn-secondary" : "btn-outline-secondary"}`}
                      onClick={() => setResumeMode("link")}
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
                          className="form-control"
                          accept=".pdf,.doc,.docx,.txt"
                          onChange={handleFileChange}
                        />
                        <div className="form-text small">Accepted formats: PDF, DOCX, TXT (Max 4MB)</div>
                      </>
                    ) : (
                      <div className="d-flex justify-content-between align-items-center p-2 border rounded bg-light">
                        <div className="text-truncate me-2 small">
                          📄 <strong>{resume.fileName}</strong>{" "}
                          <span className="text-muted">({(resume.fileSize / 1024).toFixed(0)} KB)</span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger py-0 px-2"
                          onClick={removeResume}
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
                      className="form-control"
                      placeholder="https://drive.google.com/file/... or LinkedIn"
                      value={resumeUrlInput}
                      onChange={(e) => setResumeUrlInput(e.target.value)}
                    />
                    <div className="form-text small">Link to your public CV, Google Drive, or portfolio</div>
                  </div>
                )}
                {resumeError && <div className="text-danger small mt-1">{resumeError}</div>}
              </div>

              {/* Statement of Purpose (SOP) Section */}
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label htmlFor="sop" className="form-label fw-bold mb-0">
                    Statement of Purpose (SOP)
                  </label>
                  <span
                    className={`badge ${
                      wordCount >= 160 && wordCount <= 250
                        ? "bg-success"
                        : wordCount >= 100
                        ? "bg-primary"
                        : wordCount > 0
                        ? "bg-secondary"
                        : "bg-light text-dark"
                    }`}
                  >
                    {wordCount} / ~200 words
                  </span>
                </div>

                <textarea
                  id="sop"
                  className="form-control"
                  rows={8}
                  required
                  placeholder="Write a concise Statement of Purpose (~200 words) highlighting:&#10;• Your medical/clinical background and key skills&#10;• Why you want to work at this specific healthcare facility&#10;• How your qualifications fulfill the role's requirements"
                  value={sop}
                  onChange={(e) => setSop(e.target.value)}
                />

                <div className="d-flex justify-content-between align-items-center mt-1">
                  <div className="form-text small">
                    {wordCount === 0 ? (
                      "Target: ~200 words"
                    ) : wordCount < 150 ? (
                      <span className="text-muted">{150 - wordCount} more words recommended</span>
                    ) : wordCount <= 260 ? (
                      <span className="text-success fw-bold">✓ Optimal length (~200 words)</span>
                    ) : (
                      <span className="text-muted">{wordCount - 200} words over 200-word target</span>
                    )}
                  </div>
                  <div className="text-muted small">{sop.length} chars</div>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-100 py-2"
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Submit Application"}
              </button>

              {status && (
                <div
                  className={`alert mt-3 mb-0 small ${
                    status.includes("successfully") || status.includes("recorded")
                      ? "alert-success"
                      : status.includes("Submitting")
                      ? "alert-info"
                      : "alert-warning"
                  }`}
                  role="status"
                >
                  {status}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
