"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useHospitals, MUMBAI_LOCALITIES } from "@medreach/core";
import { productApi } from "../lib/productApi";
import EmergencyIcon from "../components/EmergencyIcons";
import GoogleMapView from "../components/GoogleMapView";
import AmbulanceBookingModal from "../components/AmbulanceBookingModal";
import BloodBankActionModal from "../components/BloodBankActionModal";
import "./landing.css";

const CATEGORIES = [
  { value: "all", label: "All", icon: "pin" },
  { value: "hospitals", label: "Hospitals", singular: "Hospital", icon: "hospital" },
  { value: "blood-banks", label: "Blood Banks", singular: "Blood bank", icon: "blood" },
  { value: "diagnostics", label: "Diagnostics", singular: "Diagnostic centre", icon: "diagnostic" },
  { value: "ambulances", label: "Ambulances", singular: "Ambulance provider", icon: "ambulance" },
];
const SERVICE_LINKS = [
  { title: "Hospitals", icon: "hospital", href: "/hospitals", description: "Find a hospital, review its listing and start a standard bed request." },
  { title: "Emergency", icon: "siren", href: "/emergency", description: "Find emergency care and use the dedicated emergency bed request flow." },
  { title: "Blood services", icon: "blood", href: "/blood-banks", description: "Find a blood bank to request units or make a donation pledge." },
  { title: "Diagnostics", icon: "diagnostic", href: "/diagnostics", description: "Explore listed labs, diagnostic services and contact information." },
  { title: "Ambulances", icon: "ambulance", href: "/ambulances", description: "Choose a provider, contact them or record a booking request." },
];
const MAP_COLORS = { hospitals: "#0b789b", "blood-banks": "#c23b50", diagnostics: "#7157b4", ambulances: "#8b5b10" };
const matchesLabel = (count) => `${count} ${count === 1 ? "match" : "matches"}`;
const recordDate = (value) => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
};

function SectionHead({ id, label, title, children }) {
  return <div className="home-section-head"><div><span className="home-label">{label}</span><h2 id={id}>{title}</h2></div><div className="home-section-description">{children}</div></div>;
}

function ProviderCard({ item, selected, onSelect, onBlood, onAmbulance }) {
  const category = CATEGORIES.find((entry) => entry.value === item.category);
  const coords = item.location?.coordinates;
  const hasCoordinates = coords?.length === 2 && coords.every(Number.isFinite);
  const updated = recordDate(item.observedAt || item.updatedAt);
  return (
    <article className={`home-provider-card ${selected ? "is-selected" : ""}`} data-provider-id={String(item._id)}>
      <button className="home-provider-select" type="button" aria-pressed={selected} onClick={onSelect}>
        <span className="home-provider-icon"><EmergencyIcon name={category.icon} size={22} /></span>
        <span><span className="home-provider-kind">{category.singular}</span><strong>{item.name}</strong><span className="home-provider-address">{item.locality || item.address || item.city || "Location not recorded"}</span></span>
      </button>
      <div className="home-provider-badges">
        <span className={item.verificationStatus === "verified" ? "home-status is-verified" : "home-status"}>{item.verificationStatus || "Verification unknown"}</span>
        {(item.specialties || item.services || []).slice(0, 2).map((service) => <span className="home-status" key={service}>{service}</span>)}
      </div>
      {selected && <div className="home-provider-detail">
        {item.address && <p>{item.address}</p>}
        <p className="home-source">{item.sourceName ? `Source: ${item.sourceName}` : item.category === "hospitals" ? "Source evidence is available on the hospital details page." : "Source not recorded."}{updated && <><br />{item.observedAt ? "Observed" : "Record updated"} {updated}</>}</p>
        <div className="home-provider-actions">
          {item.phone && <a className="btn btn-sm btn-primary" href={`tel:${item.phone}`}><EmergencyIcon name="phone" size={14} /> Call</a>}
          {hasCoordinates && <a className="btn btn-sm btn-outline-secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`} target="_blank" rel="noopener noreferrer"><EmergencyIcon name="navigate" size={14} /> Directions</a>}
          {item.category === "hospitals" && item.slug && <><Link className="btn btn-sm btn-outline-secondary" href={`/hospitals/${item.slug}`}>Details</Link><Link className="btn btn-sm btn-outline-secondary" href={`/requests/new?hospital=${encodeURIComponent(item.hospitalId || item._id)}&flow=standard`}>Bed Request</Link></>}
          {item.category === "blood-banks" && <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => onBlood(item)}>Request / Donate</button>}
          {item.category === "ambulances" && <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => onAmbulance(item)}>Book Ambulance</button>}
          {item.category !== "hospitals" && <Link className="btn btn-sm btn-outline-secondary" href={`/${item.category}`}>Directory</Link>}
        </div>
        {!item.phone && <p className="home-source mt-2 mb-0">Phone number not recorded. Use the directory to review other contact details.</p>}
      </div>}
    </article>
  );
}

export default function HomePage() {
  const { data: hospitals, loading: hospitalsLoading, error: hospitalsError, retry: retryHospitals } = useHospitals({}, { sort: "updated" });
  const [resources, setResources] = useState({ "blood-banks": [], diagnostics: [], ambulances: [], campaigns: [], jobs: [] });
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourceErrors, setResourceErrors] = useState({});
  const [revision, setRevision] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [locality, setLocality] = useState("all");
  const [specialty, setSpecialty] = useState("all");
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [selected, setSelected] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [bookingAmbulance, setBookingAmbulance] = useState(null);
  const [actionBloodBank, setActionBloodBank] = useState(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    let active = true;
    setResourcesLoading(true);
    setResourceErrors({});
    const endpoints = [
      ["blood-banks", "/api/blood-banks"], ["diagnostics", "/api/diagnostics"],
      ["ambulances", "/api/ambulances"], ["campaigns", "/api/blood-banks/campaigns?status=active"],
      ["jobs", "/api/jobs"],
    ];
    Promise.allSettled(endpoints.map(([, path]) => productApi(path))).then((results) => {
      if (!active) return;
      const next = {}, errors = {};
      results.forEach((result, index) => {
        const key = endpoints[index][0];
        next[key] = result.status === "fulfilled" ? result.value?.data || result.value?.jobs || [] : [];
        if (result.status === "rejected") errors[key] = result.reason?.message || "Temporarily unavailable.";
      });
      setResources(next);
      setResourceErrors(errors);
      setResourcesLoading(false);
    });
    return () => { active = false; };
  }, [revision]);

  const providers = useMemo(() => [
    ...(hospitals || []).map((item) => ({ ...item, category: "hospitals" })),
    ...["blood-banks", "diagnostics", "ambulances"].flatMap((key) => resources[key].map((item) => ({ ...item, category: key }))),
  ], [hospitals, resources]);
  const specialties = useMemo(() => [...new Set(providers.flatMap((item) => [...(item.specialties || []), ...(item.services || [])]))].sort(), [providers]);
  const filtered = useMemo(() => providers.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (locality !== "all" && !(item.locality || item.city || "").toLowerCase().includes(locality.toLowerCase())) return false;
    const services = [...(item.specialties || []), ...(item.services || []), ...(item.facilities || []).map((entry) => entry.facility || ""), item.providerType || ""];
    if (specialty !== "all" && !services.some((entry) => entry.toLowerCase().includes(specialty.toLowerCase()))) return false;
    if (emergencyOnly) {
      const emergency = item.emergencyStatus === "available"
        || item.facilities?.some((entry) => entry.facility === "Emergency Department" && entry.capability === "yes")
        || services.some((entry) => /emergency|trauma|advanced life support/i.test(entry))
        || item.category === "blood-banks" && /24/.test(item.operatingHours || "");
      if (!emergency) return false;
    }
    const text = [item.name, item.address, item.locality, item.city, ...services, ...(item.listedBloodGroups || [])].filter(Boolean).join(" ").toLowerCase();
    return !searchQuery.trim() || text.includes(searchQuery.trim().toLowerCase());
  }), [providers, category, locality, specialty, emergencyOnly, searchQuery]);

  useEffect(() => {
    if (selected && !filtered.some((item) => String(item._id) === selected)) setSelected("");
  }, [filtered, selected]);
  useEffect(() => {
    if (!selected) return;
    const card = [...(resultsRef.current?.querySelectorAll("[data-provider-id]") || [])].find((node) => node.dataset.providerId === selected);
    if (card && resultsRef.current) {
      // Scroll the results panel without moving the surrounding page.
      const panel = resultsRef.current;
      if (card.offsetTop < panel.scrollTop || card.offsetTop + card.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = card.offsetTop;
    }
  }, [selected]);

  const filteredJobs = useMemo(() => resources.jobs.filter((job) => [job.title, job.department, job.organizationName, job.locality, job.location].filter(Boolean).join(" ").toLowerCase().includes(jobSearch.trim().toLowerCase())), [resources.jobs, jobSearch]);
  const loading = hospitalsLoading || resourcesLoading;
  const directoryErrors = [hospitalsError && "Hospitals", ...["blood-banks", "diagnostics", "ambulances"].filter((key) => resourceErrors[key]).map((key) => CATEGORIES.find((entry) => entry.value === key).label)].filter(Boolean);
  const resetFilters = () => { setSearchQuery(""); setCategory("all"); setLocality("all"); setSpecialty("all"); setEmergencyOnly(false); setSelected(""); };
  const retryDirectory = () => { retryHospitals(); setRevision((value) => value + 1); };
  const mapCategoryLabel = category === "all" ? "Healthcare resources" : CATEGORIES.find((entry) => entry.value === category).label;

  return (
    <div className="landing-home">
      <div className="home-hero-wrap"><section className="home-hero" aria-labelledby="home-title">
        <Image className="home-hero-photo" src="/landing/hero.jpg" alt="A healthcare professional using a phone; illustrative photograph" fill priority sizes="100vw" />
        <div className="home-hero-content">
          <span className="home-label home-hero-label"><span aria-hidden="true" /> Connected healthcare · Mumbai</span>
          <h1 id="home-title">Your trusted partner in modern healthcare.</h1>
          <p>Find hospitals, blood banks, diagnostics and ambulance providers. Start the right request, and follow what happens next.</p>
          <div className="home-hero-actions"><Link className="btn btn-primary" href="/hospitals">Explore healthcare <span aria-hidden="true">→</span></Link><Link className="btn btn-light" href="/emergency">Emergency care <span aria-hidden="true">→</span></Link></div>
          <div className="home-hero-notes"><span><EmergencyIcon name="hospital" size={16} /> Provider directory</span><span><EmergencyIcon name="pin" size={16} /> Map discovery</span><span><EmergencyIcon name="check" size={16} /> Request tracking</span></div>
        </div>
      </section></div>

      <section className="home-section home-directory" id="discover" aria-labelledby="directory-title">
        <div className="home-container"><SectionHead id="directory-title" label="Geospatial Directory" title="Find healthcare around you."><p>Search the directory, select a provider and explore its location. Availability and dispatch must be confirmed directly with providers.</p><Link className="home-text-link" href="/map">Full Map View →</Link></SectionHead>
          <div className="home-directory-layout">
            <aside className="home-directory-sidebar" aria-label="Healthcare directory">
              <div className="home-directory-filters">
                <p className="home-location"><EmergencyIcon name="pin" size={15} /> Mumbai, Maharashtra</p>
                <label htmlFor="home-provider-search" className="visually-hidden">Search healthcare providers</label>
                <div className="home-search"><EmergencyIcon name="search" size={18} /><input id="home-provider-search" type="search" placeholder="Search providers, tests, blood groups..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></div>
                <div className="home-category-chips" role="group" aria-label="Provider Categories">{CATEGORIES.map((entry) => <button key={entry.value} type="button" aria-pressed={category === entry.value} className={category === entry.value ? "is-active" : ""} onClick={() => setCategory(entry.value)}>{entry.label}</button>)}</div>
                <div className="row g-2">
                  <div className="col-6"><label htmlFor="home-locality" className="form-label">Locality</label><select id="home-locality" className="form-select form-select-sm" value={locality} onChange={(event) => setLocality(event.target.value)}><option value="all">All Mumbai</option>{MUMBAI_LOCALITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                  <div className="col-6"><label htmlFor="home-specialty" className="form-label">Specialty / service</label><select id="home-specialty" className="form-select form-select-sm" value={specialty} onChange={(event) => setSpecialty(event.target.value)}><option value="all">All services</option>{specialties.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                </div>
                <div className="home-filter-tools"><label className="home-check"><input type="checkbox" checked={emergencyOnly} onChange={(event) => setEmergencyOnly(event.target.checked)} /> Listed emergency capabilities</label><button type="button" className="home-text-button" onClick={resetFilters}>Reset filters</button></div>
              </div>
              <div className="home-results-heading" aria-live="polite"><strong>Provider listings</strong><span>{loading ? "Loading…" : matchesLabel(filtered.length)}</span></div>
              {directoryErrors.length > 0 && <div className="home-directory-error" role="alert"><p>{directoryErrors.join(", ")} could not be loaded. Other available listings remain usable.</p><button type="button" className="btn btn-sm btn-outline-secondary" onClick={retryDirectory}>Retry directory</button></div>}
              <div className="home-provider-results" ref={resultsRef} aria-busy={loading}>
                {loading && <p role="status" className="home-empty">Loading provider listings…</p>}
                {!loading && !filtered.length && <div className="home-empty"><strong>{directoryErrors.length ? "Listings are temporarily unavailable." : "No matching providers."}</strong><p>{directoryErrors.length ? "Retry the directory or open a service page." : "Try another search, locality or service."}</p><button className="btn btn-sm btn-outline-secondary" type="button" onClick={resetFilters}>Clear filters</button><Link className="home-text-link d-block mt-3" href="/hospitals">Open hospital directory →</Link></div>}
                {filtered.map((item) => <ProviderCard key={item._id} item={item} selected={selected === String(item._id)} onSelect={() => setSelected(String(item._id))} onBlood={setActionBloodBank} onAmbulance={setBookingAmbulance} />)}
              </div>
            </aside>
            <div className="home-directory-map" aria-label="Provider locations"><GoogleMapView items={filtered} selected={selected} onSelect={setSelected} category={category} categoryLabel={mapCategoryLabel} markerColors={MAP_COLORS} /><div className="home-map-note">Only recorded coordinates appear on the map. Listings without coordinates remain available in the directory.</div></div>
          </div>
        </div>
      </section>

      <section className="home-section home-about" id="about" aria-labelledby="about-title"><div className="home-container row g-5 align-items-center">
        <div className="col-lg-6"><div className="home-about-art"><span className="home-about-cross" aria-hidden="true">+</span><div><span className="home-label">Care, connected</span><strong>A clearer next step.</strong><p>Discover a provider. Review the information. Reach out directly.</p></div></div></div>
        <div className="col-lg-6"><span className="home-label">About us</span><h2 id="about-title">People and healthcare,<br />closer together.</h2><p className="home-muted">From finding a hospital to following a request, MedReach brings useful information and practical actions into one place.</p><div className="row g-3 mt-2"><div className="col-sm-6"><div className="home-info-card"><EmergencyIcon name="pin" size={24} /><h3>Care discovery</h3><p>Provider details, contact information and directions to help you decide what to do next.</p></div></div><div className="col-sm-6"><div className="home-info-card"><EmergencyIcon name="verified" size={24} /><h3>Information with context</h3><p>Review each listing’s source and verification status. Unknown information stays unknown.</p></div></div></div></div>
      </div></section>

      <section className="home-section" id="services" aria-labelledby="services-title"><div className="home-container"><SectionHead id="services-title" label="Our services" title={<>Everything you need<br />to reach care.</>}><p>Choose a service and move into its existing MedReach directory or request flow.</p></SectionHead><div className="home-services">{SERVICE_LINKS.map((service) => <Link key={service.href} href={service.href} className="home-service"><span className="home-service-icon"><EmergencyIcon name={service.icon} size={26} /></span><h3>{service.title}</h3><p>{service.description}</p><span className="home-service-arrow" aria-hidden="true">↗</span></Link>)}</div></div></section>

      <section className="home-section home-emergency" id="emergency" aria-labelledby="emergency-title"><div className="home-container"><SectionHead id="emergency-title" label="Emergency care" title={<>A clearer path to<br />critical care.</>}><p>For immediate danger, call 112 or 108. Recording a request does not confirm a bed or arrange emergency dispatch.</p></SectionHead><div className="row g-4 align-items-center"><div className="col-lg-6"><div className="home-photo-panel"><Image src="/landing/emergency.jpg" alt="Healthcare staff walking through a hospital; illustrative photograph" fill sizes="(max-width: 991px) 92vw, 560px" /><div className="home-photo-caption"><strong>Emergency hospital discovery</strong><span>Find a listed provider and contact them directly.</span></div></div></div><div className="col-lg-6"><h3 className="home-feature-title">When time matters,<br />keep the next step clear.</h3><p className="home-muted">Use the dedicated emergency bed request flow. You can submit an emergency request without signing in; ambulance assistance within a bed request is arranged by the hospital.</p><div className="home-inline-actions"><Link className="btn btn-danger" href="/emergency">Find emergency care →</Link><a className="btn btn-outline-secondary" href="tel:112"><EmergencyIcon name="phone" size={16} /> Call 112</a><a className="btn btn-outline-secondary" href="tel:108">Call 108</a></div></div></div></div></section>

      <section className="home-section" id="blood" aria-labelledby="blood-title"><div className="home-container"><SectionHead id="blood-title" label="Blood services" title={<>Blood support with<br />clear next steps.</>}><p>Normal requests, urgent requirements and donation pledges have their own flows. Contact the blood bank to confirm inventory.</p></SectionHead><div className="row g-3"><div className="col-md-6"><div className="home-blood-card"><EmergencyIcon name="blood" size={30} /><h3>Request blood units</h3><p>Find a blood bank and submit a normal request. For urgent requirements, use the dedicated urgent blood flow.</p><div className="home-inline-actions"><Link className="btn btn-primary" href="/blood-banks">Request blood →</Link><Link className="btn btn-outline-danger" href="/urgent-blood">Urgent blood →</Link></div></div></div><div className="col-md-6"><div className="home-blood-card"><EmergencyIcon name="cardiac" size={30} /><h3>Make a donation pledge</h3><p>Explore blood banks and their listed services, then use Request / Donate for your selected provider.</p><Link className="btn btn-outline-secondary" href="/blood-banks">Find blood banks →</Link></div></div></div>
        {resources.campaigns.length > 0 && <div className="home-campaigns"><h3>Listed donation campaigns</h3><div className="row g-3">{resources.campaigns.slice(0, 2).map((campaign) => <div className="col-md-6" key={campaign._id}><article className="home-info-card"><h4>{campaign.name}</h4><p>{[campaign.organizer, campaign.location].filter(Boolean).join(" · ")}</p>{recordDate(campaign.date) && <p>{recordDate(campaign.date)}</p>}{campaign.targetDonors > 0 && <p>Organizer’s target: {campaign.targetDonors} donors</p>}<Link className="home-text-link" href="/blood-banks">View donation options →</Link></article></div>)}</div></div>}
        {resourceErrors.campaigns && <div className="home-inline-error" role="alert">Donation campaigns are temporarily unavailable. <button type="button" className="home-text-button" onClick={() => setRevision((value) => value + 1)}>Retry campaigns</button></div>}
      </div></section>

      <section className="home-section home-ambulance" id="ambulance" aria-labelledby="ambulance-title"><div className="home-container"><SectionHead id="ambulance-title" label="Ambulance providers" title={<>Reach the right provider<br />without the hunt.</>}><p>Choose a provider, review its contact details and record a booking request. Confirm availability and dispatch directly.</p></SectionHead><div className="home-photo-panel home-wide-photo"><Image src="/landing/medreach-ambulance.png" alt="MedReach-branded ambulance at a hospital entrance; illustrative image" fill sizes="92vw" style={{ objectPosition: "60% center" }} /><div className="home-photo-caption"><div><span className="home-label">Provider-specific assistance</span><strong>Start with the provider. Choose your next action.</strong></div><Link className="btn btn-light" href="/ambulances">Explore ambulance providers →</Link></div></div></div></section>

      <section className="home-section home-careers" id="careers" aria-labelledby="careers-title"><div className="home-container"><SectionHead id="careers-title" label="Healthcare careers" title={<>Grow your career<br />in healthcare.</>}><p>Explore roles listed by healthcare organizations. Review the job and its organization before applying.</p></SectionHead><div className="home-career-grid"><div className="home-career-photo"><Image src="/landing/careers.jpg" alt="Two people discussing work; illustrative photograph" fill sizes="(max-width: 991px) 92vw, 600px" /><div className="home-career-copy"><span className="home-label">Healthcare careers</span><h3>Find work that<br />makes an impact.</h3><p>Clinical, diagnostic, operations and support opportunities from the MedReach job portal.</p><Link className="btn btn-light" href="/careers">Explore jobs →</Link></div></div><div className="home-jobs-panel" aria-busy={resourcesLoading}><div className="home-jobs-heading"><h3>Listed opportunities</h3><span aria-live="polite">{resourcesLoading ? "Loading…" : resourceErrors.jobs ? "Unavailable" : matchesLabel(filteredJobs.length)}</span></div><label className="visually-hidden" htmlFor="home-job-search">Search healthcare jobs</label><div className="home-search"><EmergencyIcon name="search" size={17} /><input id="home-job-search" type="search" placeholder="Search role, organization or location..." value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} /></div><div className="home-job-list">
        {resourcesLoading && <p className="home-empty" role="status">Loading healthcare jobs…</p>}
        {!resourcesLoading && resourceErrors.jobs && <div className="home-empty" role="alert"><p>Job listings could not be loaded.</p><button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setRevision((value) => value + 1)}>Retry jobs</button></div>}
        {!resourcesLoading && !resourceErrors.jobs && !filteredJobs.length && <div className="home-empty"><p>{jobSearch ? "No jobs match your search." : "No healthcare jobs are currently listed."}</p>{jobSearch && <button className="home-text-button" type="button" onClick={() => setJobSearch("")}>Clear job search</button>}<Link className="home-text-link d-block mt-2" href="/careers">Open Careers →</Link></div>}
        {filteredJobs.map((job) => <Link key={job._id} className="home-job-card" href={`/jobs/${job._id}`}><h4>{job.title}</h4><p>{job.organizationName || "Organization details on job page"}{(job.locality || job.location) && ` · ${job.locality || job.location}`}</p><div><span>{job.employmentType?.replaceAll("_", " ") || "Type not recorded"} · {job.verificationStatus || "Verification unknown"}</span><strong>View / Apply →</strong></div></Link>)}
      </div></div></div></div></section>

      <section className="home-section" id="insights" aria-labelledby="insights-title"><div className="home-container"><SectionHead id="insights-title" label="Using MedReach" title={<>Useful context for<br />your healthcare journey.</>}><p>Understand the information on a listing, choose the right request and keep track of what happens after submission.</p></SectionHead><div className="home-insights"><article className="home-insight"><span className="home-label">Provider information</span><h3>Understand sources and verification.</h3><p>Provider listings show sources and verification where available. Unknown availability stays unknown.</p></article><Link className="home-insight" href="/hospitals"><span className="home-label">Finding care</span><h3>Start with the hospital listing.</h3><p>Review specialties, recorded facilities and contact details before starting a standard bed request.</p><strong>Explore hospital listings →</strong></Link><Link className="home-insight" href="/track"><span className="home-label">After submission</span><h3>Keep your request reference close.</h3><p>Check request status using your reference. Keep any private tracking link safe for access to personal details.</p><strong>Track a request →</strong></Link></div></div></section>
      {bookingAmbulance && <AmbulanceBookingModal provider={bookingAmbulance} onClose={() => setBookingAmbulance(null)} />}
      {actionBloodBank && <BloodBankActionModal bloodBank={actionBloodBank} onClose={() => setActionBloodBank(null)} />}
    </div>
  );
}
