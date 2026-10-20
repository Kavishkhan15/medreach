"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useHospitals, MUMBAI_LOCALITIES, useHomeResources } from "@medreach/core";
import { productApi } from "../lib/productApi";
import EmergencyIcon from "../components/EmergencyIcons";
const GoogleMapView = dynamic(() => import("../components/GoogleMapView"), { ssr: false });
const AmbulanceBookingModal = dynamic(() => import("../components/AmbulanceBookingModal"));
const BloodBankActionModal = dynamic(() => import("../components/BloodBankActionModal"));
import "./landing.css";
import ProviderApplicationForm from "../components/ProviderApplicationForm";
import WebsiteDemo from "../components/WebsiteDemo";

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
  return <div className="tw-home-section-head"><div><span className="tw-home-label">{label}</span><h2 id={id}>{title}</h2></div><div className="tw-home-section-description">{children}</div></div>;
}

function ProviderCard({ item, selected, onSelect, onBlood, onAmbulance }) {
  const category = CATEGORIES.find((entry) => entry.value === item.category);
  const coords = item.location?.coordinates;
  const hasCoordinates = coords?.length === 2 && coords.every(Number.isFinite);

  return (
    <article className={`tw-home-provider-card ${selected ? "is-selected" : ""}`} data-provider-id={String(item._id)}>
      <button className="tw-home-provider-select" type="button" aria-pressed={selected} onClick={onSelect}>
        <span className="tw-home-provider-icon"><EmergencyIcon name={category.icon} size={22} /></span>
        <span><span className="tw-home-provider-kind">{category.singular}</span><strong>{item.name}</strong><span className="tw-home-provider-address">{item.locality || item.address || item.city || "Location not recorded"}</span></span>
      </button>
      <div className="tw-home-provider-badges">

        {(item.specialties || item.services || []).slice(0, 2).map((service) => <span className="tw-home-status" key={service}>{service}</span>)}
      </div>
      {selected && <div className="tw-home-provider-detail">
        {item.address && <p>{item.address}</p>}

        <div className="tw-home-provider-actions">
          {item.phone && <a className="tw-action tw-action-sm tw-action-primary" href={`tel:${item.phone}`}><EmergencyIcon name="phone" size={14} /> Call</a>}
          {hasCoordinates && <a className="tw-action tw-action-sm tw-action-outline" href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`} target="_blank" rel="noopener noreferrer"><EmergencyIcon name="navigate" size={14} /> Directions</a>}
          {item.category === "hospitals" && item.slug && <><Link className="tw-action tw-action-sm tw-action-outline" href={`/hospitals/${item.slug}`}>Details</Link><Link className="tw-action tw-action-sm tw-action-outline" href={`/requests/new?hospital=${encodeURIComponent(item.hospitalId || item._id)}&flow=standard`}>Bed Request</Link></>}
          {item.category === "blood-banks" && <button className="tw-action tw-action-sm tw-action-outline" type="button" onClick={() => onBlood(item)}>Request / Donate</button>}
          {item.category === "ambulances" && <button className="tw-action tw-action-sm tw-action-outline" type="button" onClick={() => onAmbulance(item)}>Book Ambulance</button>}
          {item.category !== "hospitals" && <Link className="tw-action tw-action-sm tw-action-outline" href={`/${item.category}`}>Directory</Link>}
        </div>
        {!item.phone && <p className="tw-home-source mt-2 mb-0">Phone number not recorded. Use the directory to review other contact details.</p>}
      </div>}
    </article>
  );
}

export default function HomePage() {
  const { data: hospitals, loading: hospitalsLoading, error: hospitalsError, retry: retryHospitals } = useHospitals({}, { sort: "updated" });
  const { resources, resourcesLoading, resourceLoading, resourceErrors, retryResource, careersRef, campaignsRef } = useHomeResources(productApi);
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
  const retryDirectory = () => {
    if (hospitalsError) retryHospitals();
    ["blood-banks", "diagnostics", "ambulances"].filter(key => resourceErrors[key]).forEach(retryResource);
  };
  const mapCategoryLabel = category === "all" ? "Healthcare resources" : CATEGORIES.find((entry) => entry.value === category).label;

  return (
    <div className="tw-landing">
      <div className="tw-home-hero-wrap"><section className="tw-home-hero" aria-labelledby="tw-home-title">
        <Image className="tw-home-hero-photo" src="/landing/hero.jpg" alt="A healthcare professional using a phone; illustrative photograph" fill priority sizes="100vw" />
        <div className="tw-home-hero-content">
          <span className="tw-home-label tw-home-hero-label"><span aria-hidden="true" /> Connected healthcare · Mumbai</span>
          <h1 id="tw-home-title">Your trusted partner in modern healthcare.</h1>
          <p>Find hospitals, blood banks, diagnostics and ambulance providers. Start the right request, and follow what happens next.</p>
          <div className="tw-home-hero-actions"><Link className="tw-action tw-action-primary" href="/hospitals">Explore healthcare <span aria-hidden="true">→</span></Link><Link className="tw-action tw-action-light" href="/emergency">Emergency care <span aria-hidden="true">→</span></Link></div>
          <div className="tw-home-hero-notes"><span><EmergencyIcon name="hospital" size={16} /> Provider directory</span><span><EmergencyIcon name="pin" size={16} /> Map discovery</span><span><EmergencyIcon name="check" size={16} /> Request tracking</span></div>
        </div>
      </section></div>

      <section className="tw-home-section tw-home-directory" id="discover" aria-labelledby="directory-title">
        <div className="tw-home-container"><SectionHead id="directory-title" label="Geospatial Directory" title="Find healthcare around you."><p>Search the directory, select a provider and explore its location. Availability and dispatch must be confirmed directly with providers.</p><Link className="tw-home-text-link" href="/map">Full Map View →</Link></SectionHead>
          <div className="tw-home-directory-layout">
            <aside className="tw-home-directory-sidebar" aria-label="Healthcare directory">
              <div className="tw-home-directory-filters">
                <p className="tw-home-location"><EmergencyIcon name="pin" size={15} /> Mumbai, Maharashtra</p>
                <label htmlFor="tw-home-provider-search" className="sr-only">Search healthcare providers</label>
                <div className="tw-home-search"><EmergencyIcon name="search" size={18} /><input id="tw-home-provider-search" type="search" placeholder="Search providers, tests, blood groups..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></div>
                <div className="tw-home-category-chips" role="group" aria-label="Provider Categories">{CATEGORIES.map((entry) => <button key={entry.value} type="button" aria-pressed={category === entry.value} className={category === entry.value ? "is-active" : ""} onClick={() => setCategory(entry.value)}>{entry.label}</button>)}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0"><label htmlFor="tw-home-locality" className="tw-field-label">Locality</label><select id="tw-home-locality" className="tw-field-select" value={locality} onChange={(event) => setLocality(event.target.value)}><option value="all">All Mumbai</option>{MUMBAI_LOCALITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                  <div className="min-w-0"><label htmlFor="tw-home-specialty" className="tw-field-label">Specialty / service</label><select id="tw-home-specialty" className="tw-field-select" value={specialty} onChange={(event) => setSpecialty(event.target.value)}><option value="all">All services</option>{specialties.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                </div>
                <div className="tw-home-filter-tools"><label className="tw-home-check"><input type="checkbox" checked={emergencyOnly} onChange={(event) => setEmergencyOnly(event.target.checked)} /> Listed emergency capabilities</label><button type="button" className="tw-home-text-button" onClick={resetFilters}>Reset filters</button></div>
              </div>
              <div className="tw-home-results-heading" aria-live="polite"><strong>Provider listings</strong><span>{loading ? "Loading…" : matchesLabel(filtered.length)}</span></div>
              {directoryErrors.length > 0 && <div className="tw-home-directory-error" role="alert"><p>{directoryErrors.join(", ")} could not be loaded. Other available listings remain usable.</p><button type="button" className="tw-action tw-action-sm tw-action-outline" onClick={retryDirectory}>Retry directory</button></div>}
              <div className="tw-home-provider-results" ref={resultsRef} aria-busy={loading}>
                {loading && <p role="status" className="tw-home-empty">Loading provider listings…</p>}
                {!loading && !filtered.length && <div className="tw-home-empty"><strong>{directoryErrors.length ? "Listings are temporarily unavailable." : "No matching providers."}</strong><p>{directoryErrors.length ? "Retry the directory or open a service page." : "Try another search, locality or service."}</p><button className="tw-action tw-action-sm tw-action-outline" type="button" onClick={resetFilters}>Clear filters</button><Link className="tw-home-text-link mt-3 block" href="/hospitals">Open hospital directory →</Link></div>}
                {filtered.map((item) => <ProviderCard key={item._id} item={item} selected={selected === String(item._id)} onSelect={() => setSelected(String(item._id))} onBlood={setActionBloodBank} onAmbulance={setBookingAmbulance} />)}
              </div>
            </aside>
            <div className="tw-home-directory-map" aria-label="Provider locations"><GoogleMapView items={filtered} selected={selected} onSelect={setSelected} category={category} categoryLabel={mapCategoryLabel} markerColors={MAP_COLORS} /><div className="tw-home-map-note">Only recorded coordinates appear on the map. Listings without coordinates remain available in the directory.</div></div>
          </div>
        </div>
      </section>

      <section className="tw-home-section tw-home-about" id="about" aria-labelledby="about-title"><div className="tw-home-container grid items-center gap-8 lg:grid-cols-2">
        <div className="min-w-0"><div className="tw-home-about-art tw-home-about-demo"><WebsiteDemo /></div></div>
        <div className="min-w-0"><span className="tw-home-label">About us</span><h2 id="about-title">People and healthcare,<br />closer together.</h2><p className="tw-home-muted">From finding a hospital to following a request, MedReach brings useful information and practical actions into one place.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="min-w-0"><div className="tw-home-info-card"><EmergencyIcon name="pin" size={24} /><h3>Care discovery</h3><p>Provider details, contact information and directions to help you decide what to do next.</p></div></div><div className="min-w-0"><div className="tw-home-info-card"><EmergencyIcon name="document" size={24} /><h3>Information with context</h3><p>Review contact details and listed services. Contact the provider to confirm availability.</p></div></div></div></div>
      </div></section>

      <section className="tw-home-section" id="services" aria-labelledby="services-title"><div className="tw-home-container"><SectionHead id="services-title" label="Our services" title={<>Everything you need<br />to reach care.</>}><p>Choose a service and move into its existing MedReach directory or request flow.</p></SectionHead><div className="tw-home-services">{SERVICE_LINKS.map((service) => <Link key={service.href} href={service.href} className="tw-home-service"><span className="tw-home-service-icon"><EmergencyIcon name={service.icon} size={26} /></span><h3>{service.title}</h3><p>{service.description}</p><span className="tw-home-service-arrow" aria-hidden="true">↗</span></Link>)}</div></div></section>

      <section className="tw-home-section tw-home-emergency" id="emergency" aria-labelledby="emergency-title"><div className="tw-home-container"><SectionHead id="emergency-title" label="Emergency care" title={<>A clearer path to<br />critical care.</>}><p>For immediate danger, call 112 or 108. Recording a request does not confirm a bed or arrange emergency dispatch.</p></SectionHead><div className="grid items-center gap-7 lg:grid-cols-2"><div className="min-w-0"><div className="tw-home-photo-panel"><Image src="/landing/emergency.jpg" alt="Healthcare staff walking through a hospital; illustrative photograph" fill sizes="(max-width: 991px) 92vw, 560px" /><div className="tw-home-photo-caption"><strong>Emergency hospital discovery</strong><span>Find a listed provider and contact them directly.</span></div></div></div><div className="min-w-0"><h3 className="tw-home-feature-title">When time matters,<br />keep the next step clear.</h3><p className="tw-home-muted">Use the dedicated emergency bed request flow. You can submit an emergency request without signing in; ambulance assistance within a bed request is arranged by the hospital.</p><div className="tw-home-inline-actions"><Link className="tw-action tw-action-danger" href="/emergency">Find emergency care →</Link><a className="tw-action tw-action-outline" href="tel:112"><EmergencyIcon name="phone" size={16} /> Call 112</a><a className="tw-action tw-action-outline" href="tel:108">Call 108</a></div></div></div></div></section>

      <section className="tw-home-section" id="blood" ref={campaignsRef} aria-labelledby="blood-title"><div className="tw-home-container"><SectionHead id="blood-title" label="Blood services" title={<>Blood support with<br />clear next steps.</>}><p>Normal requests, urgent requirements and donation pledges have their own flows. Contact the blood bank to confirm inventory.</p></SectionHead><div className="grid gap-4 sm:grid-cols-2"><div className="min-w-0"><div className="tw-home-blood-card"><EmergencyIcon name="blood" size={30} /><h3>Request blood units</h3><p>Find a blood bank and submit a normal request. For urgent requirements, use the dedicated urgent blood flow.</p><div className="tw-home-inline-actions"><Link className="tw-action tw-action-primary" href="/blood-banks">Request blood →</Link><Link className="tw-action tw-action-outline-danger" href="/urgent-blood">Urgent blood →</Link></div></div></div><div className="min-w-0"><div className="tw-home-blood-card"><EmergencyIcon name="cardiac" size={30} /><h3>Make a donation pledge</h3><p>Explore blood banks and their listed services, then use Request / Donate for your selected provider.</p><Link className="tw-action tw-action-outline" href="/blood-banks">Find blood banks →</Link></div></div></div>
        {resources.campaigns.length > 0 && <div className="tw-home-campaigns"><h3>Listed donation campaigns</h3><div className="grid gap-4 sm:grid-cols-2">{resources.campaigns.slice(0, 2).map((campaign) => <div className="min-w-0" key={campaign._id}><article className="tw-home-info-card"><h4>{campaign.name}</h4><p>{[campaign.organizer, campaign.location].filter(Boolean).join(" · ")}</p>{recordDate(campaign.date) && <p>{recordDate(campaign.date)}</p>}{campaign.targetDonors > 0 && <p>Organizer’s target: {campaign.targetDonors} donors</p>}<Link className="tw-home-text-link" href="/blood-banks">View donation options →</Link></article></div>)}</div></div>}
        {resourceErrors.campaigns && <div className="tw-home-inline-error" role="alert">Donation campaigns are temporarily unavailable. <button type="button" className="tw-home-text-button" onClick={() => retryResource("campaigns")}>Retry campaigns</button></div>}
      </div></section>

      <section className="tw-home-section tw-home-ambulance" id="ambulance" aria-labelledby="ambulance-title"><div className="tw-home-container"><SectionHead id="ambulance-title" label="Ambulance providers" title={<>Reach the right provider<br />without the hunt.</>}><p>Choose a provider, review its contact details and record a booking request. Confirm availability and dispatch directly.</p></SectionHead><div className="tw-home-photo-panel tw-home-wide-photo"><Image src="/landing/medreach-ambulance.png" alt="MedReach-branded ambulance at a hospital entrance; illustrative image" fill sizes="92vw" style={{ objectPosition: "60% center" }} /><div className="tw-home-photo-caption"><div><span className="tw-home-label">Provider-specific assistance</span><strong>Start with the provider. Choose your next action.</strong></div><Link className="tw-action tw-action-light" href="/ambulances">Explore ambulance providers →</Link></div></div></div></section>

      <section className="tw-home-section tw-home-careers" id="careers" ref={careersRef} aria-labelledby="careers-title"><div className="tw-home-container"><SectionHead id="careers-title" label="Healthcare careers" title={<>Grow your career<br />in healthcare.</>}><p>Explore roles listed by healthcare organizations. Review the job and its organization before applying.</p></SectionHead><div className="tw-home-career-grid"><div className="tw-home-career-photo"><Image src="/landing/careers.jpg" alt="Two people discussing work; illustrative photograph" fill sizes="(max-width: 991px) 92vw, 600px" /><div className="tw-home-career-copy"><span className="tw-home-label">Healthcare careers</span><h3>Find work that<br />makes an impact.</h3><p>Clinical, diagnostic, operations and support opportunities from the MedReach job portal.</p><Link className="tw-action tw-action-light" href="/careers">Explore jobs →</Link></div></div><div className="tw-home-jobs-panel" aria-busy={resourceLoading.jobs}><div className="tw-home-jobs-heading"><h3>Listed opportunities</h3><span aria-live="polite">{resourceLoading.jobs ? "Loading…" : resourceErrors.jobs ? "Unavailable" : matchesLabel(filteredJobs.length)}</span></div><label className="sr-only" htmlFor="tw-home-job-search">Search healthcare jobs</label><div className="tw-home-search"><EmergencyIcon name="search" size={17} /><input id="tw-home-job-search" type="search" placeholder="Search role, organization or location..." value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} /></div><div className="tw-home-job-list">
        {resourceLoading.jobs && <p className="tw-home-empty" role="status">Loading healthcare jobs…</p>}
        {!resourceLoading.jobs && resourceErrors.jobs && <div className="tw-home-empty" role="alert"><p>Job listings could not be loaded.</p><button className="tw-action tw-action-sm tw-action-outline" type="button" onClick={() => retryResource("jobs")}>Retry jobs</button></div>}
        {!resourceLoading.jobs && !resourceErrors.jobs && !filteredJobs.length && <div className="tw-home-empty"><p>{jobSearch ? "No jobs match your search." : "No healthcare jobs are currently listed."}</p>{jobSearch && <button className="tw-home-text-button" type="button" onClick={() => setJobSearch("")}>Clear job search</button>}<Link className="tw-home-text-link mt-2 block" href="/careers">Open Careers →</Link></div>}
        {filteredJobs.map((job) => <Link key={job._id} className="tw-home-job-card" href={`/jobs/${job._id}`}><h4>{job.title}</h4><p>{job.organizationName || "Organization details on job page"}{(job.locality || job.location) && ` · ${job.locality || job.location}`}</p><div><span>{job.employmentType?.replaceAll("_", " ") || "Type not recorded"}</span><strong>View / Apply →</strong></div></Link>)}
      </div></div></div></div></section>

      <section className="tw-home-section" id="insights" aria-labelledby="insights-title"><div className="tw-home-container"><SectionHead id="insights-title" label="Using MedReach" title={<>Useful context for<br />your healthcare journey.</>}><p>Understand the information on a listing, choose the right request and keep track of what happens after submission.</p></SectionHead><div className="tw-home-insights"><article className="tw-home-insight"><span className="tw-home-label">Provider information</span><h3>Understand the provider listing.</h3><p>Review listed services and contact information. Confirm availability directly with the provider.</p></article><Link className="tw-home-insight" href="/hospitals"><span className="tw-home-label">Finding care</span><h3>Start with the hospital listing.</h3><p>Review specialties, recorded facilities and contact details before starting a standard bed request.</p><strong>Explore hospital listings →</strong></Link><Link className="tw-home-insight" href="/track"><span className="tw-home-label">After submission</span><h3>Keep your request reference close.</h3><p>Check request status using your reference. Keep any private tracking link safe for access to personal details.</p><strong>Track a request →</strong></Link></div></div></section>
      <ProviderApplicationForm />
      {bookingAmbulance && <AmbulanceBookingModal provider={bookingAmbulance} onClose={() => setBookingAmbulance(null)} />}
      {actionBloodBank && <BloodBankActionModal bloodBank={actionBloodBank} onClose={() => setActionBloodBank(null)} />}
    </div>
  );
}
