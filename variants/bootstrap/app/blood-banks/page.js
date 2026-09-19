"use client";
import React, { useState, useEffect } from "react";
import ResourceDirectory from "../../components/ResourceDirectory";
import BloodBankActionModal from "../../components/BloodBankActionModal";
import { productApi, post } from "../../lib/productApi";
import { useAuth } from "@medreach/core";
import Link from "next/link";
import { EmergencyIcon } from "../../components/EmergencyIcons";

const ALL_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

export default function BloodBanks() {
  const { user } = useAuth();
  const isAdmin = user && ["admin", "system_admin"].includes(user.role);

  const [campaigns, setCampaigns] = useState([]);
  const [pendingCampaigns, setPendingCampaigns] = useState([]);
  const [filterGroup, setFilterGroup] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [selectedBloodBank, setSelectedBloodBank] = useState(null);
  const [notification, setNotification] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    organizer: "",
    location: "",
    date: "",
    endDate: "",
    bloodGroups: ["All"],
    contact: "",
    email: "",
    description: "",
    targetDonors: "",
  });
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCampaigns();
    if (isAdmin) {
      fetchPendingCampaigns();
    }
  }, [filterGroup, filterStatus, isAdmin]);

  const fetchCampaigns = async () => {
    try {
      let query = `?status=${filterStatus}`;
      if (filterGroup) query += `&bloodGroup=${encodeURIComponent(filterGroup)}`;
      const res = await productApi(`/api/blood-banks/campaigns${query}`);
      setCampaigns(res.data || []);
    } catch (e) {
      console.error("Failed to fetch campaigns:", e);
    }
  };

  const fetchPendingCampaigns = async () => {
    try {
      const res = await productApi("/api/blood-banks/campaigns?status=pending");
      setPendingCampaigns(res.data || []);
    } catch (e) {
      console.warn("Failed to fetch pending campaigns:", e);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await post("/api/blood-banks/campaigns", {
        ...formData,
        targetDonors: formData.targetDonors ? Number(formData.targetDonors) : undefined,
      });

      setShowModal(false);
      setFormData({
        name: "",
        organizer: "",
        location: "",
        date: "",
        endDate: "",
        bloodGroups: ["All"],
        contact: "",
        email: "",
        description: "",
        targetDonors: "",
      });

      setNotification(
        res.message ||
          (isAdmin
            ? "Blood campaign published successfully!"
            : "Your blood campaign proposal has been submitted to MedReach admins for review and approval.")
      );

      fetchCampaigns();
      if (isAdmin) fetchPendingCampaigns();
    } catch (e) {
      setError(e.message || "Failed to submit campaign");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveCampaign = async (campaignId) => {
    try {
      // Send PATCH to /api/blood-banks/campaigns/:id/status
      const res = await fetch(`/api/blood-banks/campaigns/${campaignId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) {
        // Fallback to /:id
        await fetch(`/api/blood-banks/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "active" }),
        });
      }
      setNotification("Campaign approved and published to active blood drives!");
      fetchPendingCampaigns();
      fetchCampaigns();
    } catch (err) {
      console.error("Failed to approve campaign:", err);
    }
  };

  const handleRejectCampaign = async (campaignId) => {
    try {
      await fetch(`/api/blood-banks/campaigns/${campaignId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "rejected" }),
      });
      setNotification("Campaign proposal rejected.");
      fetchPendingCampaigns();
    } catch (err) {
      console.error("Failed to reject campaign:", err);
    }
  };

  const toggleBloodGroup = (bg) => {
    let current = [...formData.bloodGroups];
    if (bg === "All") {
      setFormData({ ...formData, bloodGroups: ["All"] });
      return;
    }
    // Remove "All" if selecting a specific blood group
    current = current.filter((g) => g !== "All");
    if (current.includes(bg)) {
      current = current.filter((g) => g !== bg);
      if (current.length === 0) current = ["All"];
    } else {
      current.push(bg);
    }
    setFormData({ ...formData, bloodGroups: current });
  };

  return (
    <div>
      {/* Emergency Blood Request Alert Banner */}
      <div className="alert alert-danger mb-4 d-flex flex-wrap justify-content-between align-items-center gap-3 shadow-sm border-0">
        <div className="d-flex align-items-center gap-3">
          <div className="p-2 bg-danger bg-opacity-25 rounded-circle text-white">
            <EmergencyIcon name="blood" size={28} />
          </div>
          <div>
            <h4 className="alert-heading mb-1 fw-bold">Emergency Blood Needed?</h4>
            <p className="mb-0">
              Request immediate emergency blood supply for critical trauma and surgery cases.
            </p>
          </div>
        </div>
        <div className="d-flex gap-2">
          <Link
            href="/requests/new?facility=Blood%20Bank&emergencyType=Blood%20Emergency"
            className="btn btn-danger fw-semibold px-4 text-nowrap"
          >
            Request Emergency Blood
          </Link>
        </div>
      </div>

      {notification && (
        <div className="alert alert-success alert-dismissible fade show mb-4" role="alert">
          <div className="d-flex align-items-center gap-2">
            <EmergencyIcon name="approved" size={20} className="text-success" />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={() => setNotification(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Admin Moderation Panel (visible only to admins) */}
      {isAdmin && pendingCampaigns.length > 0 && (
        <div className="card border-warning mb-5 shadow-sm">
          <div className="card-header bg-warning text-dark fw-bold d-flex justify-content-between align-items-center">
            <span>
              Pending Campaign Proposals for Review ({pendingCampaigns.length})
            </span>
            <span className="badge bg-dark">Admin Access</span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light small">
                  <tr>
                    <th>Campaign & Organizer</th>
                    <th>Date & Location</th>
                    <th>Groups & Target</th>
                    <th>Contact</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCampaigns.map((camp) => (
                    <tr key={camp._id}>
                      <td>
                        <strong>{camp.name}</strong>
                        <div className="small text-muted">{camp.organizer}</div>
                      </td>
                      <td>
                        <div>{new Date(camp.date).toLocaleDateString()}</div>
                        <div className="small text-muted">{camp.location}</div>
                      </td>
                      <td>
                        <span className="badge bg-secondary me-1">
                          {camp.bloodGroups?.join(", ") || "All"}
                        </span>
                        {camp.targetDonors && (
                          <div className="small text-muted">Target: {camp.targetDonors} donors</div>
                        )}
                      </td>
                      <td>
                        <div>{camp.contact}</div>
                        {camp.email && <div className="small text-muted">{camp.email}</div>}
                      </td>
                      <td className="text-end">
                        <div className="btn-group btn-group-sm">
                          <button
                            type="button"
                            className="btn btn-success fw-semibold"
                            onClick={() => handleApproveCampaign(camp._id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger"
                            onClick={() => handleRejectCampaign(camp._id)}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Campaigns Section Header */}
      <div className="d-flex justify-content-between align-items-center mb-3 mt-4">
        <div>
          <h2 className="h4 m-0 fw-bold">Active Blood Campaigns</h2>
          <p className="text-muted small mb-0">
            Upcoming donation drives and community blood donor camps in Mumbai
          </p>
        </div>
        <button
          className="btn btn-primary d-flex align-items-center gap-2 fw-semibold"
          onClick={() => setShowModal(true)}
        >
          <EmergencyIcon name="donate" size={18} />
          Host a Blood Drive
        </button>
      </div>

      {/* Filters */}
      <div className="d-flex gap-3 mb-4 flex-wrap">
        <select
          className="form-select w-auto"
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
        >
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
        <select
          className="form-select w-auto"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="row g-3 mb-5">
        {campaigns.length === 0 ? (
          <div className="col-12">
            <div className="surface p-4 text-center text-muted">
              No active blood campaigns found. Click "Host a Blood Drive" to propose a new drive.
            </div>
          </div>
        ) : (
          campaigns.map((camp) => (
            <div className="col-md-6 col-xl-4" key={camp._id}>
              <article className="surface h-100 d-flex flex-column p-4 border rounded shadow-sm">
                <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                  <h3 className="h5 mb-0 fw-bold">{camp.name}</h3>
                  <span
                    className={`badge ${
                      camp.status === "active"
                        ? "bg-success"
                        : camp.status === "pending"
                        ? "bg-warning text-dark"
                        : "bg-secondary"
                    }`}
                  >
                    {camp.status}
                  </span>
                </div>
                <p className="small text-secondary mb-2">
                  <strong>Organizer:</strong> {camp.organizer}
                </p>
                <p className="small mb-1">
                  <strong>Location:</strong> {camp.location}
                </p>
                <p className="small mb-1">
                  <strong>Date:</strong> {new Date(camp.date).toLocaleDateString()}
                  {camp.endDate && ` – ${new Date(camp.endDate).toLocaleDateString()}`}
                </p>
                <p className="small mb-1">
                  <strong>Contact:</strong> {camp.contact}
                </p>
                <p className="small mb-2">
                  <strong>Blood Groups:</strong>{" "}
                  <span className="text-danger fw-semibold">
                    {camp.bloodGroups?.join(", ") || "All"}
                  </span>
                </p>
                {camp.description && (
                  <p className="small text-muted mb-3 flex-grow-1">{camp.description}</p>
                )}
                {camp.targetDonors && (
                  <div className="small text-muted mt-auto pt-2 border-top">
                    🎯 Target: {camp.targetDonors} lifesavers
                  </div>
                )}
              </article>
            </div>
          ))
        )}
      </div>

      <hr className="my-5" />

      {/* Resource Directory of Blood Banks with Request / Donate Action */}
      <ResourceDirectory
        kind="blood-banks"
        title="Blood banks"
        label="blood banks"
        intro="Find listed blood-bank services and contact the provider. Click 'Request / Donate Blood' on any blood bank to submit an instant requisition or donation pledge."
        onSelectResource={(bank) => setSelectedBloodBank(bank)}
      />

      {/* Action Modal for Blood Requisitions & Donations */}
      {selectedBloodBank && (
        <BloodBankActionModal
          bloodBank={selectedBloodBank}
          onClose={() => setSelectedBloodBank(null)}
        />
      )}

      {/* Host / Add Blood Campaign Modal */}
      {showModal && (
        <div
          className="modal d-block bg-dark bg-opacity-50"
          tabIndex="-1"
          style={{
            zIndex: 1050,
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content shadow-lg border-0">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">Host a Blood Donation Campaign</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowModal(false)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body p-4">
                <p className="text-muted small mb-3">
                  {isAdmin
                    ? "As an administrator, submitting this form will publish the campaign directly as active."
                    : "Submit your campaign proposal. MedReach administrators will review and approve it for public listing."}
                </p>

                {error && <div className="alert alert-danger">{error}</div>}

                <form onSubmit={handleCreate} id="campaignForm">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Campaign Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Bandra Mega Blood Drive"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Organizer / NGO *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Rotary Club / Youth Red Cross"
                        value={formData.organizer}
                        onChange={(e) => setFormData({ ...formData, organizer: e.target.value })}
                        required
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label fw-semibold">Location / Venue *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Shivaji Park Community Hall, Dadar West"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        required
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Campaign Date *</label>
                      <input
                        type="date"
                        className="form-control"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">End Date (Optional)</label>
                      <input
                        type="date"
                        className="form-control"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Contact Phone *</label>
                      <input
                        type="tel"
                        className="form-control"
                        placeholder="e.g. +91 98200 12345"
                        value={formData.contact}
                        onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Contact Email</label>
                      <input
                        type="email"
                        className="form-control"
                        placeholder="e.g. contact@rotarydadar.org"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Target Donors</label>
                      <input
                        type="number"
                        className="form-control"
                        placeholder="e.g. 100"
                        min="1"
                        value={formData.targetDonors}
                        onChange={(e) =>
                          setFormData({ ...formData, targetDonors: e.target.value })
                        }
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label fw-semibold d-block">
                        Blood Groups Needed
                      </label>
                      <div className="d-flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            formData.bloodGroups.includes("All")
                              ? "btn-danger"
                              : "btn-outline-secondary"
                          }`}
                          onClick={() => toggleBloodGroup("All")}
                        >
                          All Groups
                        </button>
                        {ALL_BLOOD_GROUPS.map((bg) => (
                          <button
                            type="button"
                            key={bg}
                            className={`btn btn-sm ${
                              formData.bloodGroups.includes(bg)
                                ? "btn-danger"
                                : "btn-outline-secondary"
                            }`}
                            onClick={() => toggleBloodGroup(bg)}
                          >
                            {bg}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="col-12">
                      <label className="form-label fw-semibold">Description / Notes</label>
                      <textarea
                        className="form-control"
                        rows="3"
                        placeholder="Details about donor refreshments, parking, partner hospital, or special requirements..."
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({ ...formData, description: e.target.value })
                        }
                      ></textarea>
                    </div>
                  </div>

                  <div className="modal-footer px-0 pb-0 mt-4 border-top pt-3">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setShowModal(false)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary fw-semibold"
                      disabled={isSubmitting}
                    >
                      {isSubmitting
                        ? "Submitting..."
                        : isAdmin
                        ? "Publish Campaign"
                        : "Submit for Admin Approval"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
