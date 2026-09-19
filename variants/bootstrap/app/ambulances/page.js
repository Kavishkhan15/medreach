"use client";
import React, { useState } from "react";
import ResourceDirectory from "../../components/ResourceDirectory";
import Link from "next/link";
import { EmergencyIcon } from "../../components/EmergencyIcons";

export default function Ambulances() {
  const [selectedCapability, setSelectedCapability] = useState("all");

  return (
    <div>
      {/* Top Emergency Ambulance Alert Banner */}
      <div className="alert alert-danger mb-4 shadow-sm border-0 p-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div className="d-flex align-items-center gap-3">
            <div className="p-3 bg-danger bg-opacity-25 rounded-circle text-white d-flex align-items-center justify-content-center">
              <EmergencyIcon name="ambulance" size={32} />
            </div>
            <div>
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className="badge bg-danger text-uppercase px-2 py-1">Critical Response</span>
                <span className="small text-danger fw-bold">Active 24/7 Across Mumbai</span>
              </div>
              <h3 className="alert-heading mb-1 fw-bold fs-4">
                Emergency Ambulance Needed? Immediate Medical Transit
              </h3>
              <p className="mb-0 text-secondary">
                For life-threatening emergencies, dial national emergency dispatch numbers directly
                or trigger an emergency bed and care triage request.
              </p>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <a
              href="tel:108"
              className="btn btn-danger fw-bold px-3 py-2 d-flex align-items-center gap-2 shadow-sm text-nowrap"
            >
              <EmergencyIcon name="phone" size={18} />
              Dial 108 (Free EMS)
            </a>
            <a
              href="tel:112"
              className="btn btn-dark fw-bold px-3 py-2 d-flex align-items-center gap-2 shadow-sm text-nowrap"
            >
              <EmergencyIcon name="phone" size={18} />
              Dial 112 (National)
            </a>
            <Link
              href="/emergency"
              className="btn btn-outline-danger fw-semibold px-3 py-2 text-nowrap"
            >
              Emergency Triage & Bed Request
            </Link>
          </div>
        </div>

        {/* Quick Capabilities Highlights */}
        <div className="row g-2 mt-3 pt-3 border-top border-danger border-opacity-25">
          <div className="col-6 col-md-3">
            <div className="p-2 bg-white bg-opacity-75 rounded border border-danger border-opacity-25 small text-center">
              <strong className="text-danger d-block">ALS Ambulances</strong>
              <span className="text-muted">Ventilator, Defibrillator, Paramedic</span>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="p-2 bg-white bg-opacity-75 rounded border border-danger border-opacity-25 small text-center">
              <strong className="text-danger d-block">BLS Ambulances</strong>
              <span className="text-muted">Oxygen Support, Stretcher, First Aid</span>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="p-2 bg-white bg-opacity-75 rounded border border-danger border-opacity-25 small text-center">
              <strong className="text-danger d-block">Cardiac ICU Mobile</strong>
              <span className="text-muted">ECG Monitor, Infusion Pumps, MD</span>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="p-2 bg-white bg-opacity-75 rounded border border-danger border-opacity-25 small text-center">
              <strong className="text-danger d-block">Patient Transport</strong>
              <span className="text-muted">Scheduled Inter-hospital Transfers</span>
            </div>
          </div>
        </div>
      </div>

      {/* Directory of Listed Ambulance Providers */}
      <ResourceDirectory
        kind="ambulances"
        title="Ambulance providers"
        label="ambulances"
        intro="Contact listed ambulance providers directly. MedReach displays verified directory contacts and navigation coordinates for Mumbai ambulance fleets."
      />
    </div>
  );
}
