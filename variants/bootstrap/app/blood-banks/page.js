"use client";
import React, { useState, useEffect } from "react";
import ResourceDirectory from "../../components/ResourceDirectory";
import { productApi, post } from "../../lib/productApi";
import { useAuth } from "@medreach/core";
import Link from "next/link";

export default function BloodBanks() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [filterGroup, setFilterGroup] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "", organizer: "", location: "", date: "", bloodGroups: ["All"], contact: "", email: "", description: ""
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCampaigns();
  }, [filterGroup, filterStatus]);

  const fetchCampaigns = async () => {
    try {
      let query = `?status=${filterStatus}`;
      if (filterGroup) query += `&bloodGroup=${encodeURIComponent(filterGroup)}`;
      const res = await productApi(`/api/blood-banks/campaigns${query}`);
      setCampaigns(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await post("/api/blood-banks/campaigns", formData);
      setShowModal(false);
      setFormData({ name: "", organizer: "", location: "", date: "", bloodGroups: ["All"], contact: "", email: "", description: "" });
      fetchCampaigns();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      {/* Emergency Blood request feature */}
      <div className="alert alert-danger mb-4 d-flex justify-content-between align-items-center">
        <div>
          <h4 className="alert-heading mb-1">Emergency Blood Needed?</h4>
          <p className="mb-0">Request immediate blood supply for critical situations.</p>
        </div>
        <Link href="/requests/new?facility=Blood%20Bank&emergencyType=Blood%20Emergency" className="btn btn-danger text-nowrap ms-3">
          Request Emergency Blood
        </Link>
      </div>

      {/* Campaigns Section */}
      <div className="d-flex justify-content-between align-items-center mb-3 mt-5">
        <h2 className="h4 m-0">Active Blood Campaigns</h2>
        {user && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Host a Blood Drive
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="d-flex gap-3 mb-4 flex-wrap">
        <select className="form-select w-auto" value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
          <option value="">All Blood Groups</option>
          <option value="A+">A+</option>
          <option value="A-">A-</option>
          <option value="B+">B+</option>
          <option value="B-">B-</option>
          <option value="O+">O+</option>
          <option value="O-">O-</option>
          <option value="AB+">AB+</option>
          <option value="AB-">AB-</option>
        </select>
        <select className="form-select w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="row g-3 mb-5">
        {campaigns.length === 0 ? (
          <div className="col-12"><div className="surface">No campaigns found.</div></div>
        ) : (
          campaigns.map(camp => (
            <div className="col-md-6 col-xl-4" key={camp._id}>
              <article className="surface h-100 d-flex flex-column">
                <div className="d-flex justify-content-between gap-2">
                  <h3 className="h5 mb-1">{camp.name}</h3>
                  <span className={`status-pill ${camp.status === 'active' ? 'tone-success' : 'tone-neutral'}`}>{camp.status}</span>
                </div>
                <p className="small text-secondary mb-2"><strong>Organizer:</strong> {camp.organizer}</p>
                <p className="small mb-1"><strong>Location:</strong> {camp.location}</p>
                <p className="small mb-1"><strong>Date:</strong> {new Date(camp.date).toLocaleDateString()}</p>
                <p className="small mb-1"><strong>Contact:</strong> {camp.contact}</p>
                <p className="small mb-3"><strong>Blood Groups:</strong> {camp.bloodGroups?.join(", ") || "All"}</p>
              </article>
            </div>
          ))
        )}
      </div>

      <hr className="my-5" />

      {/* Resource Directory */}
      <ResourceDirectory kind="blood-banks" title="Blood banks" label="blood banks" intro="Find listed blood-bank services and contact the provider. Current blood inventory is unknown unless a verified live feed is added." />

      {/* Modal */}
      {showModal && (
        <div className="modal d-block bg-dark bg-opacity-50" tabIndex="-1" style={{ zIndex: 1050, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Host a Blood Drive</h5>
                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}
                <form onSubmit={handleCreate} id="campaignForm">
                  <div className="mb-3">
                    <label className="form-label">Campaign Name</label>
                    <input type="text" className="form-control" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Organizer</label>
                    <input type="text" className="form-control" value={formData.organizer} onChange={e => setFormData({...formData, organizer: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Location</label>
                    <input type="text" className="form-control" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Date</label>
                    <input type="date" className="form-control" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Contact</label>
                    <input type="text" className="form-control" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Blood Groups (comma separated)</label>
                    <input type="text" className="form-control" value={formData.bloodGroups.join(", ")} onChange={e => setFormData({...formData, bloodGroups: e.target.value.split(",").map(s => s.trim()).filter(Boolean)})} placeholder="e.g. A+, O-" />
                  </div>
                </form>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Close</button>
                <button type="submit" form="campaignForm" className="btn btn-primary">Create Campaign</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
