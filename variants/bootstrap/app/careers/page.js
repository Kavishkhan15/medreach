"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi } from "../../lib/productApi";
export default function Careers() { const [jobs, setJobs] = useState([]); const [q, setQ] = useState(""); const [category, setCategory] = useState(""); const [status, setStatus] = useState("loading");
  useEffect(() => { let live = true; setStatus("loading"); productApi(`/api/jobs?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`)
    .then((r) => { if (live) { setJobs(r.data || []); setStatus("ready"); } }).catch((e) => { if (live) setStatus(e.message); }); return () => { live = false; }; }, [q, category]);
  return <><div className="page-head mb-4"><span className="eyebrow">Healthcare careers</span><h1>Work where care happens</h1><p>Search verified hospital opportunities. Applications are tracked in your account.</p></div>
    <div className="row g-2 mb-4"><div className="col-md-8"><label htmlFor="jobSearch" className="form-label">Search roles</label><input id="jobSearch" className="form-control" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Doctor, nurse, technician…" /></div><div className="col-md-4"><label htmlFor="jobCategory" className="form-label">Category</label><select id="jobCategory" className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{["Doctor", "Nurse", "Technician", "Pharmacist", "Administrative", "Emergency Staff", "Internship", "Other"].map((c) => <option key={c}>{c}</option>)}</select></div></div>
    {status === "loading" && <p role="status">Loading jobs…</p>}{status !== "ready" && status !== "loading" && <div className="alert alert-danger">{status}</div>}{status === "ready" && !jobs.length && <div className="surface">No published roles match your search.</div>}
    <div className="row g-3">{jobs.map((job) => <div className="col-md-6" key={job._id}><Link href={`/jobs/${job._id}`} className="surface h-100 d-block text-decoration-none text-reset"><span className="eyebrow">{job.category}</span><h2 className="h5 mt-1">{job.title}</h2><p className="small text-secondary">{job.hospital?.name} · {job.location || job.hospital?.locality || "Mumbai"}</p><p className="disclaimer mb-0">{job.employmentType.replaceAll("_", " ")} · {job.verificationStatus}{job.demo ? " · DEMO" : ""}</p></Link></div>)}</div>
  </>;
}
