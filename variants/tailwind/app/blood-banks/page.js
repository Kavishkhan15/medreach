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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex flex-wrap justify-between items-center gap-3 shadow-sm">
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
            href="/urgent-blood"
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-md whitespace-nowrap text-sm"
          >
            Request Emergency Blood
          </Link>
        </div>
      </div>

      {notification && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 mb-6 flex justify-between items-center" role="alert">
          <div className="d-flex align-items-center gap-2">
            <EmergencyIcon name="approved" size={20} className="text-success" />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            onClick={() => setNotification(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Admin Moderation Panel (visible only to admins) */}
      {isAdmin && pendingCampaigns.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg mb-6 shadow-sm overflow-hidden">
          <div className="bg-amber-200 text-gray-900 font-bold p-3 flex justify-between items-center text-sm">
            <span>
              Pending Campaign Proposals for Review ({pendingCampaigns.length})
            </span>
            <span className="badge bg-dark">Admin Access</span>
          </div>
          <div className="p-0 overflow-x-auto">
            <div className="table-responsive">
              <table className="w-full text-left text-sm">
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
      <div className="flex justify-between items-center mb-4 mt-6">
        <div>
          <h2 className="text-xl font-bold m-0">Active Blood Campaigns</h2>
          <p className="text-muted small mb-0">
            Upcoming donation drives and community blood donor camps in Mumbai
          </p>
        </div>
        <button
          className="bg-[var(--color-emergency)] hover:bg-[var(--color-emergency-dark)] text-white font-semibold px-4 py-2 rounded-md flex items-center gap-2 text-sm"
          onClick={() => setShowModal(true)}
        >
          <EmergencyIcon name="donate" size={18} />
          Host a Blood Drive
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
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
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {campaigns.length === 0 ? (
          <div className="col-span-full">
            <div className="surface p-4 text-center text-muted">
              No active blood campaigns found. Click "Host a Blood Drive" to propose a new drive.
            </div>
          </div>
        ) : (
          campaigns.map((camp) => (
            <div className="h-full" key={camp._id}>
              <article className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5 flex flex-col h-full">
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
                    <EmergencyIcon name="target" size={15} className="text-danger me-1" /> Target: {camp.targetDonors} lifesavers
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto"
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
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden my-8">
            <div className="flex flex-col">
              <div className="bg-[var(--color-emergency)] text-white p-4 flex justify-between items-center">
                <h5 className="modal-title fw-bold">Host a Blood Donation Campaign</h5>
                <button
                  type="button"
                  className="text-white hover:text-gray-200 text-2xl leading-none"
                  onClick={() => setShowModal(false)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[80vh]">
                <p className="text-muted small mb-3">
                  {isAdmin
                    ? "As an administrator, submitting this form will publish the campaign directly as active."
                    : "Submit your campaign proposal. MedReach administrators will review and approve it for public listing."}
                </p>

                {error && <div className="alert alert-danger">{error}</div>}

                <form onSubmit={handleCreate} id="campaignForm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div >
                      <label className="block text-sm font-semibold mb-1">Campaign Name *</label>
                      <input
                        type="text"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="e.g. Bandra Mega Blood Drive"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div >
                      <label className="block text-sm font-semibold mb-1">Organizer / NGO *</label>
                      <input
                        type="text"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="e.g. Rotary Club / Youth Red Cross"
                        value={formData.organizer}
                        onChange={(e) => setFormData({ ...formData, organizer: e.target.value })}
                        required
                      />
                    </div>

                    <div className="col-span-full">
                      <label className="block text-sm font-semibold mb-1">Location / Venue *</label>
                      <input
                        type="text"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="e.g. Shivaji Park Community Hall, Dadar West"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        required
                      />
                    </div>

                    <div >
                      <label className="block text-sm font-semibold mb-1">Campaign Date *</label>
                      <input
                        type="date"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                      />
                    </div>
                    <div >
                      <label className="block text-sm font-semibold mb-1">End Date (Optional)</label>
                      <input
                        type="date"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      />
                    </div>

                    <div >
                      <label className="block text-sm font-semibold mb-1">Contact Phone *</label>
                      <input
                        type="tel"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="e.g. +91 98200 12345"
                        value={formData.contact}
                        onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                        required
                      />
                    </div>
                    <div >
                      <label className="block text-sm font-semibold mb-1">Contact Email</label>
                      <input
                        type="email"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="e.g. contact@rotarydadar.org"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>

                    <div >
                      <label className="block text-sm font-semibold mb-1">Target Donors</label>
                      <input
                        type="number"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="e.g. 100"
                        min="1"
                        value={formData.targetDonors}
                        onChange={(e) =>
                          setFormData({ ...formData, targetDonors: e.target.value })
                        }
                      />
                    </div>

                    <div className="col-span-full">
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

                    <div className="col-span-full">
                      <label className="block text-sm font-semibold mb-1">Description / Notes</label>
                      <textarea
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        rows="3"
                        placeholder="Details about donor refreshments, parking, partner hospital, or special requirements..."
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({ ...formData, description: e.target.value })
                        }
                      ></textarea>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
                    <button
                      type="button"
                      className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 text-sm"
                      onClick={() => setShowModal(false)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-[var(--color-emergency)] text-white font-semibold px-4 py-2 rounded-md hover:bg-[var(--color-emergency-dark)] text-sm"
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
