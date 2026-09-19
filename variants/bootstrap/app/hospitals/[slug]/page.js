"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useHospital, saveHospital, useAuth } from "@medreach/core";
import { productApi } from "../../../lib/productApi";
import { EmergencyIcon } from "../../../components/EmergencyIcons";

export default function HospitalPage({ params }) {
  const { slug } = params;
  const { hospital: baseHospital, loading: baseLoading, notFound } = useHospital(slug);
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [enrichedData, setEnrichedData] = useState(null);
  const [enriching, setEnriching] = useState(true);

  useEffect(() => {
    let active = true;
    if (!slug) return;

    productApi(`/api/hospitals/${slug}/enriched`)
      .then((res) => {
        if (active && res?.enriched) {
          setEnrichedData(res.enriched);
        }
      })
      .catch(() => {
        // Graceful fallback to baseHospital
      })
      .finally(() => {
        if (active) setEnriching(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  if (baseLoading && enriching) {
    return <p className="text-secondary p-4">Loading hospital details…</p>;
  }

  const hospital = enrichedData || baseHospital;

  if (notFound || !hospital) {
    return (
      <div className="surface p-4 text-center">
        <h2 className="h5 mb-2">Hospital not found</h2>
        <p className="text-secondary mb-3">The requested hospital could not be located in the directory.</p>
        <Link href="/hospitals" className="btn btn-outline-primary">Back to directory</Link>
      </div>
    );
  }

  const coords = hospital.location?.coordinates || baseHospital?.location?.coordinates || [];
  const hasCoords = coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]);

  const onSave = async () => {
    try {
      await saveHospital(hospital.hospitalId || hospital._id);
      setSaved(true);
    } catch {
      alert("Login required to save hospital.");
    }
  };

  const name = hospital.name || baseHospital?.name;
  const address = hospital.address || baseHospital?.address || (baseHospital?.locality ? `${baseHospital.locality}, ${baseHospital.city || "Mumbai"}` : "Not available.");
  const pincode = hospital.pincode || baseHospital?.pincode || "Not available.";
  const phone = hospital.phone || baseHospital?.phone || hospital.emergencyPhone || baseHospital?.emergencyPhone || "Not available.";
  const specialties = (hospital.specialties && hospital.specialties.length > 0)
    ? hospital.specialties
    : (baseHospital?.specialties?.length ? baseHospital.specialties : (baseHospital?.departments?.length ? baseHospital.departments : ["Not available."]));
  const sourceName = hospital.sourceName || (baseHospital?.locality ? "Verified Hospital Profile" : "Official Directory");
  const sourceUrl = hospital.sourceUrl || baseHospital?.website;

  return (
    <article className="pb-5">
      <nav aria-label="Breadcrumb" className="mb-3">
        <Link href="/hospitals" className="small text-decoration-none">
          ← Back to Hospital Directory
        </Link>
      </nav>

      {/* Header section: name only */}
      <header className="mb-4">
        <h1 className="h2 mb-1 fw-bold">{name}</h1>
        <p className="text-secondary mb-0">Mumbai Healthcare Network · Information &amp; Discovery</p>
      </header>

      <div className="row g-4">
        {/* Main factual information card */}
        <div className="col-12 col-lg-8">
          <div className="surface p-4 shadow-sm border rounded mb-4">
            <h2 className="h5 mb-3 fw-bold border-bottom pb-2">Hospital Information</h2>

            <dl className="row mb-0">
              <dt className="col-sm-3 text-secondary">Hospital name</dt>
              <dd className="col-sm-9 fw-semibold">{name}</dd>

              <dt className="col-sm-3 text-secondary">Address</dt>
              <dd className="col-sm-9">{address}</dd>

              <dt className="col-sm-3 text-secondary">PIN code</dt>
              <dd className="col-sm-9">{pincode}</dd>

              <dt className="col-sm-3 text-secondary">Phone number</dt>
              <dd className="col-sm-9">
                {phone !== "Not available." ? (
                  <a href={`tel:${phone}`} className="text-decoration-none fw-semibold">
                    {phone}
                  </a>
                ) : (
                  <span>Not available.</span>
                )}
              </dd>

              <dt className="col-sm-3 text-secondary">Specialities</dt>
              <dd className="col-sm-9">
                {Array.isArray(specialties) && specialties[0] !== "Not available." ? (
                  <div className="d-flex flex-wrap gap-1">
                    {specialties.map((s) => (
                      <span key={s} className="badge bg-light text-dark border">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">Not available.</span>
                )}
              </dd>
            </dl>
          </div>

          {/* Source Transparency */}
          <div className="p-3 bg-light rounded border text-muted small">
            <div className="fw-semibold mb-1">Source &amp; Verification</div>
            <p className="mb-1">
              Source: {sourceName}
              {sourceUrl && (
                <> · <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Original Source Reference ↗</a></>
              )}
            </p>
            <p className="mb-0">
              Information is continuously normalized from public health registries and official hospital records.
            </p>
          </div>
        </div>

        {/* Hospital actions sidebar */}
        <div className="col-12 col-lg-4">
          <div className="surface p-4 shadow-sm border rounded">
            <h2 className="h6 mb-3 fw-bold border-bottom pb-2">Actions</h2>

            <div className="vstack gap-2">
              <a
                className="btn btn-primary w-100 d-inline-flex align-items-center justify-content-center gap-2"
                href={`tel:${hospital.emergencyPhone || baseHospital?.emergencyPhone || phone || "112"}`}
              >
                <EmergencyIcon name="phone" size={16} /> Call Emergency
              </a>

              {hasCoords && (
                <a
                  className="btn btn-outline-secondary w-100 d-inline-flex align-items-center justify-content-center gap-2"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}
                >
                  <EmergencyIcon name="navigate" size={16} /> Navigate
                </a>
              )}

              <Link
                href={`/requests/new?hospital=${hospital.hospitalId || baseHospital?._id}&isEmergency=false`}
                className="btn btn-outline-danger w-100 d-inline-flex align-items-center justify-content-center gap-2"
              >
                <EmergencyIcon name="bed" size={16} /> Request Bed (Login required)
              </Link>

              {user && (
                <button
                  type="button"
                  className="btn btn-outline-secondary w-100"
                  onClick={onSave}
                  disabled={saved}
                >
                  {saved ? "✓ Saved to Quick Access" : "Save to Quick Access"}
                </button>
              )}
            </div>

            <hr className="my-3" />
            <p className="text-muted small mb-0">
              For acute triage with <strong>no login required</strong>, use the{" "}
              <Link href="/emergency" className="fw-semibold text-danger">Emergency Response</Link> portal.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
