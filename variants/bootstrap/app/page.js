"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useHospitals, MUMBAI_LOCALITIES, fixtures } from "@medreach/core";
import { productApi } from "../lib/productApi";
import EmergencyIcon from "../components/EmergencyIcons";
import LiveFeatureIcon from "../components/LiveFeatureIcon";
import GoogleMapView from "../components/GoogleMapView";
import AmbulanceBookingModal from "../components/AmbulanceBookingModal";
import BloodBankActionModal from "../components/BloodBankActionModal";

// Fallback seed items when backend API is offline
const FALLBACK_BLOOD_BANKS = [
  {
    _id: "bb-kem",
    name: "KEM Hospital Blood Centre",
    locality: "Parel",
    address: "Acharya Donde Marg, Parel, Mumbai 400012",
    phone: "+91-22-2410-7000",
    operatingHours: "24/7 Emergency Blood Bank",
    providerType: "Government / Municipal Blood Centre",
    services: ["Whole Blood", "PRBC", "Fresh Frozen Plasma", "Platelet Apheresis"],
    location: { type: "Point", coordinates: [72.842, 19.0] },
    verificationStatus: "verified",
    sourceName: "BMC Mumbai Blood Transfusion Council",
  },
  {
    _id: "bb-lilavati",
    name: "Lilavati Hospital Blood Bank",
    locality: "Bandra",
    address: "A-791, Bandra Reclamation, Bandra West, Mumbai 400050",
    phone: "+91-22-2675-1000",
    operatingHours: "24/7",
    providerType: "NABH Accredited Blood Centre",
    services: ["Single Donor Platelets (SDP)", "Cryoprecipitate", "Voluntary Donation Camps"],
    location: { type: "Point", coordinates: [72.828, 19.051] },
    verificationStatus: "verified",
    sourceName: "FDA Maharashtra Blood Directory",
  },
  {
    _id: "bb-tata",
    name: "Tata Memorial Hospital Blood Bank",
    locality: "Parel",
    address: "Dr. E Borges Road, Parel, Mumbai 400012",
    phone: "+91-22-2417-7000",
    operatingHours: "24 Hours Open",
    providerType: "Oncology Specialty Transfusion Center",
    services: ["Irradiated Blood Components", "Leukoreduced PRBC", "Emergency Transfusion"],
    location: { type: "Point", coordinates: [72.843, 19.004] },
    verificationStatus: "verified",
    sourceName: "Tata Memorial Healthcare Network",
  },
  {
    _id: "bb-hinduja",
    name: "P.D. Hinduja Hospital Blood Bank",
    locality: "Mahim",
    address: "Veer Savarkar Marg, Mahim, Mumbai 400016",
    phone: "+91-22-2445-1515",
    operatingHours: "24/7",
    providerType: "Tertiary Care Transfusion Medicine",
    services: ["Stem Cell Apheresis", "Cross Matching", "Rare Blood Group Registry"],
    location: { type: "Point", coordinates: [72.839, 19.033] },
    verificationStatus: "verified",
    sourceName: "FDA Maharashtra",
  },
];

const FALLBACK_DIAGNOSTICS = [
  {
    _id: "diag-suburban",
    name: "Suburban Diagnostics Central Lab",
    locality: "Andheri",
    address: "Near Fun Republic, Andheri West, Mumbai 400053",
    phone: "+91-22-6170-0000",
    operatingHours: "06:30 AM – 10:00 PM",
    providerType: "NABL / CAP Accredited Diagnostic Centre",
    services: ["3T MRI", "128-Slice CT Scan", "Digital X-Ray", "Pathology", "2D Echo"],
    location: { type: "Point", coordinates: [72.834, 19.136] },
    verificationStatus: "verified",
    sourceName: "NABL Certified Directory",
  },
  {
    _id: "diag-metropolis",
    name: "Metropolis Healthcare Reference Laboratory",
    locality: "Vidyavihar",
    address: "Kohinoor City, Commercial 1, Kurla West, Mumbai 400070",
    phone: "+91-22-3399-3939",
    operatingHours: "24/7 Reference Lab",
    providerType: "Advanced Pathology & Molecular Genetics",
    services: ["Molecular Diagnostics", "Oncology Markers", "Biochemistry", "Hormone Profiles"],
    location: { type: "Point", coordinates: [72.889, 19.074] },
    verificationStatus: "verified",
    sourceName: "Metropolis Network",
  },
  {
    _id: "diag-srl",
    name: "Agilus Diagnostics (SRL) Dadar",
    locality: "Dadar",
    address: "Swami Gyan Jivandas Marg, Dadar East, Mumbai 400014",
    phone: "+91-22-2410-1234",
    operatingHours: "07:00 AM – 09:00 PM",
    providerType: "Multi-Specialty Imaging & Laboratory",
    services: ["Ultra-Sound & Doppler", "Mammography", "Health Checkups", "Cardiology Workup"],
    location: { type: "Point", coordinates: [72.844, 19.018] },
    verificationStatus: "verified",
    sourceName: "Agilus Network",
  },
  {
    _id: "diag-neuropath",
    name: "NM Medical Imaging & Health Centre",
    locality: "Bandra",
    address: "Bandra West, Linking Road, Mumbai 400052",
    phone: "+91-22-2640-1000",
    operatingHours: "07:00 AM – 09:30 PM",
    providerType: "Advanced Imaging & Preventive Health",
    services: ["High-Field MRI", "Multi-Detector CT", "Bone Densitometry (DEXA)", "Stress Test (TMT)"],
    location: { type: "Point", coordinates: [72.831, 19.06] },
    verificationStatus: "verified",
    sourceName: "NM Medical Records",
  },
];

const FALLBACK_AMBULANCES = [
  {
    _id: "amb-lifeline",
    name: "LifeLine Critical Care Ambulance Mumbai",
    locality: "Bandra",
    address: "Bandra Reclamation, Near Lilavati, Mumbai 400050",
    phone: "+91-98200-10800",
    operatingHours: "24/7 Rapid Response",
    providerType: "Advanced Life Support (ALS)",
    services: ["ALS Transport", "Ventilator Support", "Defibrillator", "Paramedic Onboard"],
    location: { type: "Point", coordinates: [72.8295, 19.0522] },
    verificationStatus: "verified",
    sourceName: "BMC Mumbai EMS Directory",
  },
  {
    _id: "amb-citycare",
    name: "City Care Emergency Ambulance Service",
    locality: "Andheri",
    address: "Opposite Andheri Railway Station East, Mumbai 400069",
    phone: "+91-98200-24700",
    operatingHours: "24/7",
    providerType: "Cardiac ICU Mobile Unit",
    services: ["Cardiac ICU Mobile", "ECG Monitoring", "Infusion Pumps", "Oxygen Pipeline"],
    location: { type: "Point", coordinates: [72.853, 19.119] },
    verificationStatus: "verified",
    sourceName: "Mumbai EMS Alliance",
  },
  {
    _id: "amb-apex",
    name: "Apex Mumbai Emergency Transit",
    locality: "Dadar",
    address: "Dadar TT Circle, Dadar East, Mumbai 400014",
    phone: "+91-98200-33300",
    operatingHours: "24 Hours Dispatch",
    providerType: "Basic & Advanced Transport",
    services: ["BLS Transport", "Patient Shift", "Airway Management", "Stretcher Transit"],
    location: { type: "Point", coordinates: [72.843, 19.019] },
    verificationStatus: "verified",
    sourceName: "Apex Medical Transport",
  },
  {
    _id: "amb-navimumbai",
    name: "Navi Mumbai Express EMS Fleet",
    locality: "Vashi",
    address: "Sector 17, Vashi, Navi Mumbai 400703",
    phone: "+91-98200-55500",
    operatingHours: "24/7 Highway & City EMS",
    providerType: "Trauma Response Mobile Unit",
    services: ["High-Speed Highway Trauma", "Neonatal Transport (NICU)", "Spine Board"],
    location: { type: "Point", coordinates: [73.003, 19.076] },
    verificationStatus: "verified",
    sourceName: "Navi Mumbai EMS",
  },
];

const FALLBACK_CAMPAIGNS = [
  {
    _id: "camp-1",
    name: "Bandra Community Mega Blood Donation Drive",
    organizer: "Rotary Club of Bandra & Lilavati Blood Centre",
    location: "Bandra Reclamation Promenade Hall, Bandra West",
    date: new Date(Date.now() + 86400000 * 2).toISOString(),
    bloodGroups: ["All"],
    targetDonors: 150,
    status: "active",
    contact: "+91 98200 12345",
  },
  {
    _id: "camp-2",
    name: "Dadar Red Cross Lifesaver Camp",
    organizer: "Indian Red Cross Society Maharashtra Branch",
    location: "Shivaji Park Community Center, Dadar West",
    date: new Date(Date.now() + 86400000 * 4).toISOString(),
    bloodGroups: ["O-", "B-", "A-", "AB-"],
    targetDonors: 100,
    status: "active",
    contact: "+91 98200 67890",
  },
];

const FALLBACK_JOBS = [
  {
    _id: "job-1",
    title: "ICU Staff Nurse (Critical Care)",
    organizationName: "Lilavati Hospital and Research Centre",
    organizationType: "hospital",
    locality: "Bandra West",
    employmentType: "Full-Time",
    experienceYears: "2-4 years",
  },
  {
    _id: "job-2",
    title: "Emergency Medical Officer (EMO - Trauma)",
    organizationName: "KEM Hospital",
    organizationType: "hospital",
    locality: "Parel",
    employmentType: "Full-Time",
    experienceYears: "1-3 years",
  },
  {
    _id: "job-3",
    title: "Blood Bank Apheresis Technician",
    organizationName: "Tata Memorial Blood Centre",
    organizationType: "blood_bank",
    locality: "Parel",
    employmentType: "Full-Time",
    experienceYears: "2+ years",
  },
  {
    _id: "job-4",
    title: "Advanced Paramedic / EMT Specialist",
    organizationName: "LifeLine Critical Care Ambulance",
    organizationType: "ambulance",
    locality: "Mumbai Metropolitan",
    employmentType: "Shift-based",
    experienceYears: "1+ year",
  },
];

export default function HomePage() {
  // 1. Hospital dataset from core hook (with built-in offline fixtures fallback)
  const { data: hospitalsData, loading: hospitalsLoading } = useHospitals({}, { sort: "updated" });

  // 2. Extra provider states
  const [bloodBanks, setBloodBanks] = useState(FALLBACK_BLOOD_BANKS);
  const [diagnostics, setDiagnostics] = useState(FALLBACK_DIAGNOSTICS);
  const [ambulances, setAmbulances] = useState(FALLBACK_AMBULANCES);
  const [campaigns, setCampaigns] = useState(FALLBACK_CAMPAIGNS);
  const [jobs, setJobs] = useState(FALLBACK_JOBS);
  const [resourcesLoading, setResourcesLoading] = useState(true);

  // 3. Modals state
  const [bookingAmbulance, setBookingAmbulance] = useState(null);
  const [actionBloodBank, setActionBloodBank] = useState(null);

  // 4. Interactive Search & Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all"); // 'all' | 'hospitals' | 'blood-banks' | 'diagnostics' | 'ambulances'
  const [selectedLocality, setSelectedLocality] = useState("all");
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [selectedSpecialty, setSelectedSpecialty] = useState("all");

  // 5. Map state
  const [mapCategory, setMapCategory] = useState("hospitals");
  const [mapSelectedId, setMapSelectedId] = useState(null);

  // Load real API data on mount
  useEffect(() => {
    let isLive = true;
    setResourcesLoading(true);

    Promise.allSettled([
      productApi("/api/blood-banks"),
      productApi("/api/diagnostics"),
      productApi("/api/ambulances"),
      productApi("/api/blood-banks/campaigns?status=active"),
      productApi("/api/jobs"),
    ])
      .then(([bbRes, diagRes, ambRes, campRes, jobRes]) => {
        if (!isLive) return;
        if (bbRes.status === "fulfilled" && bbRes.value?.data?.length) {
          setBloodBanks(bbRes.value.data);
        }
        if (diagRes.status === "fulfilled" && diagRes.value?.data?.length) {
          setDiagnostics(diagRes.value.data);
        }
        if (ambRes.status === "fulfilled" && ambRes.value?.data?.length) {
          setAmbulances(ambRes.value.data);
        }
        if (campRes.status === "fulfilled" && campRes.value?.data?.length) {
          setCampaigns(campRes.value.data);
        }
        if (jobRes.status === "fulfilled" && (jobRes.value?.jobs?.length || jobRes.value?.data?.length)) {
          setJobs(jobRes.value.jobs || jobRes.value.data);
        }
      })
      .catch((err) => {
        console.warn("Using offline fallback data for landing page:", err);
      })
      .finally(() => {
        if (isLive) setResourcesLoading(false);
      });

    return () => {
      isLive = false;
    };
  }, []);

  // Compute live dataset stats from actual loaded items
  const stats = useMemo(() => {
    const totalHospitals = hospitalsData?.length || 0;
    const erHospitals = hospitalsData?.filter(
      (h) => h.emergencyStatus === "available" || h.specialties?.includes("Emergency") || h.facilities?.some((f) => f.facility?.includes("Emergency"))
    ).length || 0;
    const icuHospitals = hospitalsData?.filter(
      (h) => h.facilities?.some((f) => f.facility?.includes("ICU") && f.status === "available")
    ).length || 0;
    const totalBloodBanks = bloodBanks?.length || 0;
    const totalDiagnostics = diagnostics?.length || 0;
    const totalAmbulances = ambulances?.length || 0;
    const totalCareers = jobs?.length || 0;

    return {
      hospitals: totalHospitals,
      erCount: erHospitals,
      icuCount: icuHospitals,
      bloodBanks: totalBloodBanks,
      diagnostics: totalDiagnostics,
      ambulances: totalAmbulances,
      careers: totalCareers,
      totalProviders: totalHospitals + totalBloodBanks + totalDiagnostics + totalAmbulances,
    };
  }, [hospitalsData, bloodBanks, diagnostics, ambulances, jobs]);

  // Combined providers list for search & filtering
  const allProviders = useMemo(() => {
    const list = [];
    (hospitalsData || []).forEach((h) => {
      list.push({ ...h, category: "hospitals", categoryName: "Hospital" });
    });
    (bloodBanks || []).forEach((b) => {
      list.push({ ...b, category: "blood-banks", categoryName: "Blood Bank" });
    });
    (diagnostics || []).forEach((d) => {
      list.push({ ...d, category: "diagnostics", categoryName: "Diagnostic Lab" });
    });
    (ambulances || []).forEach((a) => {
      list.push({ ...a, category: "ambulances", categoryName: "Ambulance Provider" });
    });
    return list;
  }, [hospitalsData, bloodBanks, diagnostics, ambulances]);

  // Filtered providers based on active search parameters
  const filteredProviders = useMemo(() => {
    return allProviders.filter((item) => {
      // 1. Category filter
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }

      // 2. Locality filter
      if (selectedLocality !== "all") {
        const loc = (item.locality || item.city || "").toLowerCase();
        if (!loc.includes(selectedLocality.toLowerCase())) {
          return false;
        }
      }

      // 3. Emergency only filter
      if (emergencyOnly) {
        if (item.category === "hospitals") {
          const isEr =
            item.emergencyStatus === "available" ||
            item.specialties?.includes("Emergency") ||
            item.facilities?.some((f) => f.facility?.includes("Emergency"));
          if (!isEr) return false;
        } else if (item.category === "ambulances") {
          // All ambulances qualify for emergency transit
        } else if (item.category === "blood-banks") {
          // Keep 24/7 or emergency blood banks
          if (!item.operatingHours?.includes("24")) return false;
        } else {
          return false;
        }
      }

      // 4. Specialty filter
      if (selectedSpecialty !== "all") {
        const specLower = selectedSpecialty.toLowerCase();
        const hasSpec =
          item.specialties?.some((s) => s.toLowerCase().includes(specLower)) ||
          item.services?.some((s) => s.toLowerCase().includes(specLower)) ||
          item.facilities?.some((f) => f.facility?.toLowerCase().includes(specLower)) ||
          item.providerType?.toLowerCase().includes(specLower);
        if (!hasSpec) return false;
      }

      // 5. Keyword search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = item.name?.toLowerCase().includes(q);
        const locMatch = (item.locality || item.address || "").toLowerCase().includes(q);
        const specMatch =
          item.specialties?.some((s) => s.toLowerCase().includes(q)) ||
          item.services?.some((s) => s.toLowerCase().includes(q)) ||
          item.providerType?.toLowerCase().includes(q);
        if (!nameMatch && !locMatch && !specMatch) {
          return false;
        }
      }

      return true;
    });
  }, [allProviders, selectedCategory, selectedLocality, emergencyOnly, selectedSpecialty, searchQuery]);

  // Providers specifically plotted on the map
  const mapItems = useMemo(() => {
    if (mapCategory === "all") return filteredProviders;
    return allProviders.filter((p) => p.category === mapCategory);
  }, [allProviders, filteredProviders, mapCategory]);

  // Reset search filters
  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedLocality("all");
    setEmergencyOnly(false);
    setSelectedSpecialty("all");
  }, []);

  return (
    <div className="landing-page-root">
      {/* 1. LIVE HEALTHCARE NETWORK STATUS BAR */}
      <div className="bg-white border rounded-pill shadow-sm px-3 py-2 mb-4 d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="d-flex align-items-center gap-2">
          <span className="spinner-grow spinner-grow-sm text-success" role="status" aria-hidden="true"></span>
          <span className="small fw-bold text-dark">Live Mumbai Healthcare Grid</span>
          <span className="badge bg-light text-secondary border d-none d-sm-inline">24/7 Verified Network</span>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2 small">
          <span className="text-secondary">
            <strong className="text-dark">{stats.hospitals}</strong> Hospitals
          </span>
          <span className="text-muted">·</span>
          <span className="text-secondary">
            <strong className="text-danger">{stats.bloodBanks}</strong> Blood Banks
          </span>
          <span className="text-muted">·</span>
          <span className="text-secondary">
            <strong className="text-primary">{stats.diagnostics}</strong> Labs
          </span>
          <span className="text-muted">·</span>
          <span className="text-secondary">
            <strong className="text-warning">{stats.ambulances}</strong> Ambulances
          </span>
        </div>
      </div>

      {/* 2. HERO SECTION */}
      <section className="hero-premium mb-4">
        <div className="row align-items-center g-4">
          <div className="col-lg-8">
            <div className="d-inline-flex align-items-center gap-2 bg-white bg-opacity-20 px-3 py-1 rounded-pill mb-3 text-white small fw-bold">
              <EmergencyIcon name="verified" size={16} /> Source-Backed Mumbai Health Directory
            </div>
            <h1 className="mb-3">
              Find verified healthcare & critical emergency care when seconds count.
            </h1>
            <p className="lead mb-4">
              Real-time access to Mumbai hospitals, ICU availability, emergency trauma response, blood banks, diagnostic labs, and 24/7 ambulance fleets. Provenance backed by factual public datasets.
            </p>

            {/* Quick Action Navigation Buttons */}
            <div className="d-flex flex-wrap gap-2 mb-2">
              <Link href="/emergency" className="btn btn-emergency btn-lg d-inline-flex align-items-center gap-2">
                <EmergencyIcon name="siren" size={20} className="text-danger" />
                Find Emergency Hospital
              </Link>
              <Link href="/urgent-blood" className="hero-quick-pill">
                <EmergencyIcon name="blood" size={18} /> Urgent Blood Requisition
              </Link>
              <button
                type="button"
                className="hero-quick-pill border-0"
                onClick={() => {
                  if (ambulances.length > 0) setBookingAmbulance(ambulances[0]);
                }}
              >
                <EmergencyIcon name="ambulance" size={18} /> Book Ambulance
              </button>
              <Link href="/map" className="hero-quick-pill">
                <EmergencyIcon name="navigate" size={18} /> Care Map
              </Link>
              <Link href="/hospitals" className="hero-quick-pill">
                <EmergencyIcon name="hospital" size={18} /> Hospitals ({stats.hospitals})
              </Link>
              <Link href="/diagnostics" className="hero-quick-pill">
                <EmergencyIcon name="diagnostic" size={18} /> Diagnostics ({stats.diagnostics})
              </Link>
            </div>
          </div>

          <div className="col-lg-4 d-none d-lg-block">
            <div className="bg-white bg-opacity-10 p-4 rounded-4 border border-white border-opacity-25 shadow-sm text-white">
              <div className="d-flex align-items-center gap-2 mb-3">
                <EmergencyIcon name="shield" size={24} className="text-warning" />
                <h3 className="h6 fw-bold mb-0 text-white">MedReach Safety Commitments</h3>
              </div>
              <ul className="list-unstyled small mb-0 d-flex flex-column gap-2 opacity-90">
                <li className="d-flex gap-2">
                  <EmergencyIcon name="check" size={16} className="text-white flex-shrink-0 mt-1" />
                  <span><strong>Zero Hallucinated Beds:</strong> Real hospital telemetry, never synthetic approximations.</span>
                </li>
                <li className="d-flex gap-2">
                  <EmergencyIcon name="check" size={16} className="text-white flex-shrink-0 mt-1" />
                  <span><strong>Live Coordination:</strong> Dedicated triage pipeline directly connected to admitting staff.</span>
                </li>
                <li className="d-flex gap-2">
                  <EmergencyIcon name="check" size={16} className="text-white flex-shrink-0 mt-1" />
                  <span><strong>Multi-Modal Care:</strong> Cross-functional map spanning trauma, blood, scans, and ambulances.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE SEARCH & FILTER BAR */}
      <section className="search-floating-card mb-5" aria-label="Interactive Healthcare Resource Search">
        <div className="row g-3 align-items-end">
          {/* Keyword Search */}
          <div className="col-12 col-md-4">
            <label className="form-label fw-bold small text-uppercase text-secondary mb-1">
              Search Care Resource
            </label>
            <div className="input-group">
              <span className="input-group-text bg-light text-muted border-end-0">
                <EmergencyIcon name="search" size={16} />
              </span>
              <input
                type="text"
                className="form-control border-start-0 ps-0"
                placeholder="Hospital, test, blood group, specialty..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-outline-secondary border-start-0"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                >
                  <EmergencyIcon name="close" size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Category Dropdown */}
          <div className="col-6 col-md-2">
            <label className="form-label fw-bold small text-uppercase text-secondary mb-1">Category</label>
            <select
              className="form-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="all">All Care ({allProviders.length})</option>
              <option value="hospitals">Hospitals ({stats.hospitals})</option>
              <option value="blood-banks">Blood Banks ({stats.bloodBanks})</option>
              <option value="diagnostics">Diagnostics ({stats.diagnostics})</option>
              <option value="ambulances">Ambulances ({stats.ambulances})</option>
            </select>
          </div>

          {/* Locality Dropdown */}
          <div className="col-6 col-md-2">
            <label className="form-label fw-bold small text-uppercase text-secondary mb-1">Locality</label>
            <select
              className="form-select"
              value={selectedLocality}
              onChange={(e) => setSelectedLocality(e.target.value)}
            >
              <option value="all">All Mumbai</option>
              {MUMBAI_LOCALITIES.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Specialty Filter */}
          <div className="col-6 col-md-2">
            <label className="form-label fw-bold small text-uppercase text-secondary mb-1">Specialty / Unit</label>
            <select
              className="form-select"
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
            >
              <option value="all">All Specialties</option>
              <option value="Emergency">Emergency & Trauma</option>
              <option value="ICU">ICU & Critical Care</option>
              <option value="Cardiology">Cardiology / Cardiac</option>
              <option value="Neurology">Neurology / Stroke</option>
              <option value="Pediatrics">Pediatrics / NICU</option>
              <option value="Blood">Blood Transfusion</option>
              <option value="MRI">MRI / CT Scans</option>
              <option value="ALS">ALS Ambulance</option>
            </select>
          </div>

          {/* Quick Emergency Checkbox & Reset */}
          <div className="col-6 col-md-2 d-flex gap-2">
            <button
              type="button"
              className={`btn w-100 fw-bold d-flex align-items-center justify-content-center gap-1 ${
                emergencyOnly ? "btn-danger" : "btn-outline-danger"
              }`}
              onClick={() => setEmergencyOnly(!emergencyOnly)}
              title="Show 24/7 Emergency trauma capabilities only"
            >
              <EmergencyIcon name="siren" size={16} />
              24/7 ER
            </button>
            {(searchQuery || selectedCategory !== "all" || selectedLocality !== "all" || selectedSpecialty !== "all" || emergencyOnly) && (
              <button
                type="button"
                className="btn btn-outline-secondary px-3"
                onClick={handleResetFilters}
                title="Reset all filters"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Quick Locality discovery chips */}
        <div className="d-flex flex-wrap gap-2 mt-3 pt-3 border-top align-items-center">
          <span className="small text-muted fw-bold me-1">Popular Localities:</span>
          {["Bandra", "Andheri", "Parel", "Dadar", "Colaba", "Borivali", "Worli", "Thane"].map((loc) => (
            <button
              key={loc}
              type="button"
              className={`locality-chip ${selectedLocality.toLowerCase() === loc.toLowerCase() ? "active" : ""}`}
              onClick={() => setSelectedLocality(selectedLocality.toLowerCase() === loc.toLowerCase() ? "all" : loc)}
            >
              <EmergencyIcon name="pin" size={13} className="me-1 opacity-75" />
              {loc}
            </button>
          ))}
        </div>
      </section>

      {/* 4. REAL BACKEND NETWORK METRICS */}
      <section className="mb-5" aria-label="Verified Healthcare Statistics">
        <div className="row g-3">
          <div className="col-6 col-md-3">
            <div className="metric-card h-100">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <span className="text-secondary small fw-bold text-uppercase">Verified Hospitals</span>
                <span className="badge badge-soft-danger"><EmergencyIcon name="hospital" size={16} /></span>
              </div>
              <div className="metric-value text-danger interactive-counter">{stats.hospitals}</div>
              <div className="small text-muted mt-2">
                <strong>{stats.erCount}</strong> with 24/7 ER Trauma Units
              </div>
            </div>
          </div>

          <div className="col-6 col-md-3">
            <div className="metric-card h-100">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <span className="text-secondary small fw-bold text-uppercase">Blood Centres</span>
                <span className="badge badge-soft-danger"><EmergencyIcon name="blood" size={16} /></span>
              </div>
              <div className="metric-value text-danger interactive-counter">{stats.bloodBanks}</div>
              <div className="small text-muted mt-2">
                <strong>{campaigns.length}</strong> active donation drives
              </div>
            </div>
          </div>

          <div className="col-6 col-md-3">
            <div className="metric-card h-100">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <span className="text-secondary small fw-bold text-uppercase">Diagnostic Labs</span>
                <span className="badge badge-soft-info"><EmergencyIcon name="diagnostic" size={16} /></span>
              </div>
              <div className="metric-value text-primary interactive-counter">{stats.diagnostics}</div>
              <div className="small text-muted mt-2">
                CT, 3T MRI & NABL Pathology
              </div>
            </div>
          </div>

          <div className="col-6 col-md-3">
            <div className="metric-card h-100">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <span className="text-secondary small fw-bold text-uppercase">Ambulance Fleets</span>
                <span className="badge badge-soft-warning"><EmergencyIcon name="ambulance" size={16} /></span>
              </div>
              <div className="metric-value text-warning interactive-counter">{stats.ambulances}</div>
              <div className="small text-muted mt-2">
                ALS & Cardiac Mobile ICU
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. INTERACTIVE MUMBAI HEALTHCARE MAP SECTION */}
      <section className="surface p-4 mb-5 shadow-sm rounded-4" aria-label="Mumbai Healthcare Interactive Map">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
          <div>
            <span className="eyebrow">Geospatial Directory</span>
            <h2 className="h4 fw-bold mb-1">Live Mumbai Healthcare Map</h2>
            <p className="small text-muted mb-0">
              Explore hospital trauma centers, diagnostic facilities, blood banks, and ambulance fleets with exact GPS coordinates.
            </p>
          </div>

          {/* Category Switcher for Map */}
          <div className="d-flex flex-wrap gap-1 align-items-center">
            {[
              { id: "hospitals", label: "Hospitals", icon: "hospital" },
              { id: "blood-banks", label: "Blood Banks", icon: "blood" },
              { id: "diagnostics", label: "Diagnostics", icon: "diagnostic" },
              { id: "ambulances", label: "Ambulances", icon: "ambulance" },
              { id: "all", label: "All Pins", icon: "pin" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`btn btn-sm ${
                  mapCategory === cat.id ? "btn-danger fw-bold" : "btn-light border text-secondary"
                }`}
                onClick={() => setMapCategory(cat.id)}
              >
                <EmergencyIcon name={cat.icon} size={14} className="me-1" />
                {cat.label}
              </button>
            ))}
            <Link href="/map" className="btn btn-sm btn-outline-danger ms-2">
              Full Map View →
            </Link>
          </div>
        </div>

        {/* Embedded Map Component */}
        <div className="rounded-3 overflow-hidden border" style={{ minHeight: "380px" }}>
          <GoogleMapView
            items={mapItems}
            selectedId={mapSelectedId}
            onSelect={(id) => setMapSelectedId(id)}
            category={mapCategory === "all" ? "hospitals" : mapCategory}
          />
        </div>
      </section>

      {/* 6. CRITICAL EMERGENCY TRIAGE CALLOUT */}
      <section className="alert alert-danger shadow-sm border-0 p-4 mb-5 rounded-4" aria-label="Emergency Medical Action Panel">
        <div className="row align-items-center g-3">
          <div className="col-lg-8">
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="badge bg-danger text-uppercase px-2 py-1">Code Red Protocol</span>
              <span className="fw-bold text-danger">Immediate Mumbai Emergency Medical Transit</span>
            </div>
            <h2 className="h4 alert-heading fw-bold mb-2">
              Facing an acute medical crisis or surgical emergency?
            </h2>
            <p className="mb-0 text-secondary" style={{ maxWidth: "60ch" }}>
              Coordinate immediate hospital bed triage or urgent blood dispatch. Direct dial national emergency networks or launch our clinical transfer request pipeline.
            </p>
          </div>
          <div className="col-lg-4 text-lg-end">
            <div className="d-flex flex-wrap gap-2 justify-content-lg-end">
              <a href="tel:108" className="btn btn-danger fw-bold px-3 py-2 d-flex align-items-center gap-2">
                <EmergencyIcon name="phone" size={18} /> Dial 108 (EMS)
              </a>
              <a href="tel:112" className="btn btn-dark fw-bold px-3 py-2 d-flex align-items-center gap-2">
                <EmergencyIcon name="phone" size={18} /> Dial 112 (National)
              </a>
              <Link href="/requests/new" className="btn btn-outline-danger fw-bold px-3 py-2">
                Request Emergency Bed
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 7. DISCOVER CARE DIRECTORY: FILTERED RESULTS LIST */}
      <section className="mb-5" aria-label="Healthcare Providers Results Grid">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h2 className="h4 fw-bold mb-1">
              Discovered Providers ({filteredProviders.length})
            </h2>
            <p className="small text-muted mb-0">
              Showing real verified facilities from the MedReach database.
            </p>
          </div>

          {/* Category Tabs */}
          <div className="btn-group btn-group-sm" role="group" aria-label="Provider Categories">
            <button
              type="button"
              className={`btn ${selectedCategory === "all" ? "btn-danger fw-bold" : "btn-outline-secondary"}`}
              onClick={() => setSelectedCategory("all")}
            >
              All ({allProviders.length})
            </button>
            <button
              type="button"
              className={`btn ${selectedCategory === "hospitals" ? "btn-danger fw-bold" : "btn-outline-secondary"}`}
              onClick={() => setSelectedCategory("hospitals")}
            >
              Hospitals ({stats.hospitals})
            </button>
            <button
              type="button"
              className={`btn ${selectedCategory === "blood-banks" ? "btn-danger fw-bold" : "btn-outline-secondary"}`}
              onClick={() => setSelectedCategory("blood-banks")}
            >
              Blood Banks ({stats.bloodBanks})
            </button>
            <button
              type="button"
              className={`btn ${selectedCategory === "diagnostics" ? "btn-danger fw-bold" : "btn-outline-secondary"}`}
              onClick={() => setSelectedCategory("diagnostics")}
            >
              Diagnostics ({stats.diagnostics})
            </button>
            <button
              type="button"
              className={`btn ${selectedCategory === "ambulances" ? "btn-danger fw-bold" : "btn-outline-secondary"}`}
              onClick={() => setSelectedCategory("ambulances")}
            >
              Ambulances ({stats.ambulances})
            </button>
          </div>
        </div>

        {/* Results Grid */}
        {hospitalsLoading && resourcesLoading ? (
          <div className="surface p-5 text-center my-4">
            <div className="spinner-border text-danger mb-2" role="status">
              <span className="visually-hidden">Loading healthcare providers...</span>
            </div>
            <p className="text-muted small mb-0">Loading verified Mumbai healthcare network data...</p>
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="surface p-5 text-center my-4">
            <div className="text-muted mb-2"><EmergencyIcon name="search" size={40} /></div>
            <h3 className="h5 fw-bold">No healthcare providers match your filters</h3>
            <p className="text-secondary small mb-3">Try adjusting your locality, category, or search term.</p>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={handleResetFilters}>
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="row g-3">
            {filteredProviders.slice(0, 9).map((item) => (
              <div key={item._id} className="col-md-6 col-lg-4">
                <article className="card h-100 card-hover-elevate border p-3 d-flex flex-column bg-white">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <span
                      className={`badge ${
                        item.category === "hospitals"
                          ? "badge-soft-danger"
                          : item.category === "blood-banks"
                          ? "badge-soft-primary"
                          : item.category === "diagnostics"
                          ? "badge-soft-info"
                          : "badge-soft-warning"
                      }`}
                    >
                      <EmergencyIcon
                        name={
                          item.category === "hospitals"
                            ? "hospital"
                            : item.category === "blood-banks"
                            ? "blood"
                            : item.category === "diagnostics"
                            ? "diagnostic"
                            : "ambulance"
                        }
                        size={14}
                        className="me-1"
                      />
                      {item.categoryName}
                    </span>
                    <span className="badge bg-light text-success border border-success-subtle">
                      <EmergencyIcon name="verified" size={13} className="text-success me-1" />
                      {item.verificationStatus || "Verified"}
                    </span>
                  </div>

                  <h3 className="h6 fw-bold mb-1 text-dark">
                    {item.category === "hospitals" && item.slug ? (
                      <Link href={`/hospitals/${item.slug}`} className="text-dark text-decoration-none">
                        {item.name}
                      </Link>
                    ) : (
                      item.name
                    )}
                  </h3>

                  <p className="small text-secondary mb-2">
                    <EmergencyIcon name="pin" size={13} className="me-1 text-muted" />
                    {item.address || item.locality || "Mumbai"}
                  </p>

                  {/* Capabilities / Services Badges */}
                  <div className="d-flex flex-wrap gap-1 mb-3">
                    {(item.specialties || item.services || []).slice(0, 3).map((spec, i) => (
                      <span key={i} className="badge bg-light text-secondary border fw-normal small">
                        {spec}
                      </span>
                    ))}
                    {(item.specialties?.length || item.services?.length || 0) > 3 && (
                      <span className="badge bg-light text-muted border fw-normal small">
                        +{(item.specialties?.length || item.services?.length) - 3}
                      </span>
                    )}
                  </div>

                  {/* Action Bar based on category */}
                  <div className="mt-auto pt-3 border-top d-flex flex-wrap gap-2">
                    {item.category === "hospitals" && (
                      <>
                        <Link href={`/hospitals/${item.slug}`} className="btn btn-sm btn-outline-danger flex-fill">
                          View Details
                        </Link>
                        {item.phone && (
                          <a href={`tel:${item.phone}`} className="btn btn-sm btn-primary flex-fill">
                            <EmergencyIcon name="phone" size={14} className="me-1" /> Call
                          </a>
                        )}
                      </>
                    )}

                    {item.category === "blood-banks" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger flex-fill fw-semibold"
                          onClick={() => setActionBloodBank(item)}
                        >
                          Request / Donate
                        </button>
                        {item.phone && (
                          <a href={`tel:${item.phone}`} className="btn btn-sm btn-outline-secondary">
                            Call
                          </a>
                        )}
                      </>
                    )}

                    {item.category === "diagnostics" && (
                      <>
                        {item.phone && (
                          <a href={`tel:${item.phone}`} className="btn btn-sm btn-primary flex-fill">
                            <EmergencyIcon name="phone" size={14} className="me-1" /> Call Lab
                          </a>
                        )}
                        {item.location?.coordinates?.length === 2 && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${item.location.coordinates[1]},${item.location.coordinates[0]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-secondary flex-fill"
                          >
                            Directions
                          </a>
                        )}
                      </>
                    )}

                    {item.category === "ambulances" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-success flex-fill fw-semibold"
                          onClick={() => setBookingAmbulance(item)}
                        >
                          Book Ambulance
                        </button>
                        {item.phone && (
                          <a href={`tel:${item.phone}`} className="btn btn-sm btn-primary">
                            Call
                          </a>
                        )}
                        {item.location?.coordinates?.length === 2 && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${item.location.coordinates[1]},${item.location.coordinates[0]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-secondary"
                          >
                            Nav
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </article>
              </div>
            ))}
          </div>
        )}

        {filteredProviders.length > 9 && (
          <div className="text-center mt-4">
            <Link
              href={
                selectedCategory === "hospitals"
                  ? "/hospitals"
                  : selectedCategory === "blood-banks"
                  ? "/blood-banks"
                  : selectedCategory === "diagnostics"
                  ? "/diagnostics"
                  : selectedCategory === "ambulances"
                  ? "/ambulances"
                  : "/map"
              }
              className="btn btn-outline-secondary px-4 fw-semibold"
            >
              View all {filteredProviders.length} matching resources →
            </Link>
          </div>
        )}
      </section>

      {/* 8. ACTIVE COMMUNITY BLOOD CAMPAIGNS HIGHLIGHT */}
      {campaigns.length > 0 && (
        <section className="mb-5" aria-label="Community Blood Drives">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <span className="eyebrow text-danger">Life-Saving Initiatives</span>
              <h2 className="h4 fw-bold mb-0">Active Blood Donation Camps in Mumbai</h2>
            </div>
            <Link href="/blood-banks" className="btn btn-outline-danger btn-sm fw-semibold">
              Host a Blood Drive
            </Link>
          </div>

          <div className="row g-3">
            {campaigns.slice(0, 2).map((camp) => (
              <div key={camp._id} className="col-md-6">
                <div className="surface p-4 border rounded-3 h-100 shadow-sm d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <h3 className="h6 fw-bold mb-0 text-dark">{camp.name}</h3>
                    <span className="badge bg-success">Active Camp</span>
                  </div>
                  <p className="small text-secondary mb-1">
                    <strong>Organizer:</strong> {camp.organizer}
                  </p>
                  <p className="small text-secondary mb-1">
                    <strong>Location:</strong> {camp.location}
                  </p>
                  <p className="small text-muted mb-2">
                    <strong>Target:</strong> {camp.targetDonors || "100"} Lifesaver Donors · Groups:{" "}
                    <span className="text-danger fw-bold">{camp.bloodGroups?.join(", ") || "All"}</span>
                  </p>
                  <div className="mt-auto pt-2 border-top d-flex justify-content-between align-items-center">
                    <span className="small text-muted">
                      {new Date(camp.date).toLocaleDateString()}
                    </span>
                    <Link href="/blood-banks" className="btn btn-sm btn-danger fw-semibold">
                      Pledge to Donate
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 9. HEALTHCARE CAREERS & CLINICAL OPPORTUNITIES */}
      {jobs.length > 0 && (
        <section className="mb-5" aria-label="Healthcare Careers Openings">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <span className="eyebrow">Medical Staffing</span>
              <h2 className="h4 fw-bold mb-0">Clinical Careers & Hospital Openings</h2>
            </div>
            <Link href="/careers" className="btn btn-outline-secondary btn-sm fw-semibold">
              Browse Careers Portal ({jobs.length}) →
            </Link>
          </div>

          <div className="row g-3">
            {jobs.slice(0, 4).map((job) => (
              <div key={job._id} className="col-md-6 col-lg-3">
                <div className="card h-100 p-3 border shadow-sm bg-white d-flex flex-column">
                  <div className="badge badge-soft-primary align-self-start mb-2">
                    {job.organizationType === "hospital"
                      ? "Hospital Role"
                      : job.organizationType === "blood_bank"
                      ? "Blood Centre"
                      : "Emergency Service"}
                  </div>
                  <h3 className="h6 fw-bold mb-1 text-dark">{job.title}</h3>
                  <p className="small text-secondary mb-2">{job.organizationName}</p>
                  <div className="mt-auto pt-2 border-top d-flex justify-content-between align-items-center small text-muted">
                    <span>{job.locality || "Mumbai"}</span>
                    <Link href="/careers" className="text-danger fw-bold text-decoration-none">
                      Apply →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 10. TRANSPARENT VERIFICATION & DATA INTEGRITY PILLARS */}
      <section className="mb-5 pt-3" aria-label="MedReach Architectural Transparency">
        <div className="row g-3">
          {[
            {
              title: "Transparent Rule-Based Ranking",
              desc: "Hospital search scores are computed via deterministic clinical matching (specialty coverage, ER state, geospatial proximity, and source confidence). Never opaque or paid placements.",
              icon: "radar",
            },
            {
              title: "Factual Data Freshness",
              desc: "Every record displays exact provenance timestamps. When live status is unverified, MedReach explicitly reports 'Unknown' rather than fabricating bed capacity.",
              icon: "clock",
            },
            {
              title: "Verified Mumbai Provenance",
              desc: "Aggregated from official municipal registries, public health authorities, verified hospital staff claims, and structured web crawls with full evidence preservation.",
              icon: "verified",
            },
          ].map((c) => (
            <div className="col-12 col-md-4" key={c.title}>
              <div className="surface h-100 p-4 border rounded-3 shadow-sm">
                <LiveFeatureIcon name={c.icon} label={c.title} />
                <h3 className="h6 mt-3 fw-bold">{c.title}</h3>
                <p className="disclaimer mb-0 text-muted">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 11. MODALS INTEGRATION */}
      {/* Ambulance Booking Modal */}
      {bookingAmbulance && (
        <AmbulanceBookingModal
          provider={bookingAmbulance}
          onClose={() => setBookingAmbulance(null)}
        />
      )}

      {/* Blood Bank Action Modal (Request / Donate) */}
      {actionBloodBank && (
        <BloodBankActionModal
          bloodBank={actionBloodBank}
          onClose={() => setActionBloodBank(null)}
        />
      )}
    </div>
  );
}
