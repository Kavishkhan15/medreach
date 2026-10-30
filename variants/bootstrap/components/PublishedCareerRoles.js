"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi } from "../lib/productApi";
import CareerAvailability from "./CareerAvailability";

export default function PublishedCareerRoles() {
  const [search, setSearch] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [filters, setFilters] = useState({ q: "", employmentType: "" });
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ status: "loading", data: [], hasMore: false });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ status: "loading", data: [], hasMore: false });
    const query = new URLSearchParams({ view: "summary", page: String(page), limit: "12" });
    if (filters.q) query.set("q", filters.q);
    if (filters.employmentType) query.set("employmentType", filters.employmentType);
    productApi(`/api/jobs?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(value => { if (!controller.signal.aborted) setResult({ status: "success", data: value.data || [], hasMore: value.pagination?.hasMore === true }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ status: "error", data: [], hasMore: false }); });
    return () => controller.abort();
  }, [filters, page, revision]);
  return <section className="mb-5" aria-labelledby="published-career-roles">
    <div className="d-flex justify-content-between gap-3 flex-wrap mb-3">
      <div><h2 id="published-career-roles">Open roles</h2><p className="text-secondary mb-0">Published opportunities with employer-reported position counts.</p></div>
      <Link className="btn btn-outline-primary align-self-start" href="/provider/jobs">Manage provider roles</Link>
    </div>
    <form className="surface mb-3" onSubmit={event => { event.preventDefault(); setPage(1); setFilters({ q: search.trim(), employmentType }); }}>
      <div className="row g-3 align-items-end">
        <div className="col-md-6"><label className="form-label" htmlFor="career-role-search">Search roles or locations</label><input id="career-role-search" className="form-control" maxLength={80} value={search} onChange={event => setSearch(event.target.value)} placeholder="Nurse, pathology, Andheri…" /></div>
        <div className="col-md-3"><label className="form-label" htmlFor="career-employment-type">Employment type</label><select id="career-employment-type" className="form-select" value={employmentType} onChange={event => setEmploymentType(event.target.value)}><option value="">All types</option><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></div>
        <div className="col-md-3 d-flex gap-2"><button className="btn btn-primary" type="submit">Find roles</button><button className="btn btn-outline-secondary" type="button" onClick={() => setRevision(value => value + 1)}>Refresh roles</button></div>
      </div>
    </form>
    {result.status === "loading" && <p role="status">Loading published roles…</p>}
    {result.status === "error" && <p role="alert">Roles could not be loaded. <button type="button" className="btn btn-outline-secondary" onClick={() => setRevision(value => value + 1)}>Retry roles</button></p>}
    {result.status === "success" && result.data.length === 0 && <div className="surface"><p className="mb-0">No published roles match this search. General expressions of interest are available below; they are not advertised vacancies.</p></div>}
    <div className="row g-3">{result.data.map(job => <div className="col-md-6 col-xl-4" key={job._id}><article className="surface h-100 d-flex flex-column">
      <h3 className="h5">{job.title}</h3><p>{job.organizationName || job.hospital?.name || job.provider?.name || "Healthcare provider"}</p>
      <p className="text-secondary">{job.location || "Location not reported"} · {job.employmentType?.replaceAll("_", " ")}</p>
      <CareerAvailability job={job} />
      {job.salaryText && <p>{job.salaryText}</p>}
      {job.deadline && <p>Apply by {new Date(job.deadline).toLocaleDateString("en-IN")}</p>}
      <Link className="btn btn-outline-primary mt-auto align-self-start" href={`/jobs/${encodeURIComponent(job._id)}`}>{job.availability?.acceptingApplications === false ? "View role — applications closed" : "View role and apply"}</Link>
    </article></div>)}</div>
    {result.status === "success" && (page > 1 || result.hasMore) && <nav className="d-flex align-items-center gap-3 mt-3" aria-label="Published role pages"><button className="btn btn-outline-secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous roles</button><span>Page {page}</span><button className="btn btn-outline-secondary" disabled={!result.hasMore} onClick={() => setPage(value => value + 1)}>Next roles</button></nav>}
  </section>;
}
