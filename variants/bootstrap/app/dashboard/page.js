"use client";

import Link from "next/link";
import { useDashboard } from "../../lib/useDashboard";
import CareerReference from "../../components/CareerReference";

function SectionFeedback({ section, title, onRetry, children }) {
  if (section.loading) return <p role="status" className="member-state">Loading {title.toLowerCase()}…</p>;
  if (section.error) return <div role="alert" className="member-error">
    <p>{section.error}</p>
    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onRetry}>Retry {title.toLowerCase()}</button>
    {section.status === 401 && <Link href="/login?returnTo=%2Fdashboard">Sign in</Link>}
  </div>;
  return children;
}

function RequestRow({ href, reference, type, status, provider, urgent }) {
  return <li className="member-request-row">
    <div className="member-request-main">
      <div className="member-request-identifiers">
        <span className={`member-request-type${urgent ? " member-request-type--urgent" : ""}`}>{type}</span>
        <span className="member-request-status">{status || "Status unavailable"}</span>
      </div>
      <Link href={href} className="member-request-reference">{reference || "View request"}</Link>
      <span className="member-request-provider">{provider}</span>
    </div>
    <Link href={href} className="member-request-track" aria-label={`Track ${type.toLowerCase()} request ${reference || "details"}`}>Track <span aria-hidden="true">↗</span></Link>
  </li>;
}

function RequestGroup({ section, title, onRetry, emptyMessage, children }) {
  return <section className="member-request-group" aria-label={title}>
    <h3>{title}</h3>
    <SectionFeedback section={section} title={title} onRetry={onRetry}>
      {section.data?.length ? <ul className="member-request-list">{children}</ul> : <p className="member-state">{emptyMessage}</p>}
    </SectionFeedback>
  </section>;
}

export default function Dashboard() {
  const { profile, requests, blood, ambulance, applications, retry } = useDashboard();
  const user = profile.data;

  return <div className="member-dashboard">
    <header className="member-page-header">
      <div className="member-header-copy">
        <h1>{user?.name ? `Welcome, ${user.name.split(" ")[0]}` : "Your dashboard"}</h1>
        <p>See your requests, applications and saved hospitals at a glance.</p>
      </div>
      <div className="member-header-actions">
        <Link className="member-header-action member-header-action--primary" href="/hospitals">Find care <span aria-hidden="true">→</span></Link>
        <Link className="member-header-action member-header-action--secondary" href="/requests">My requests <span aria-hidden="true">→</span></Link>
      </div>
    </header>

    <div className="member-dashboard-grid">
      <section className="member-panel member-requests-panel" aria-labelledby="dashboard-requests">
        <div className="member-panel-heading">
          <div><h2 id="dashboard-requests">My requests</h2></div>
          <Link href="/requests" className="member-panel-link">View all requests <span aria-hidden="true">→</span></Link>
        </div>
        <RequestGroup section={requests} title="Hospital bed requests" onRetry={() => retry("requests")} emptyMessage="No hospital bed requests yet.">
          {requests.data?.slice(0, 3).map((request) => <RequestRow key={request._id} href={`/requests/${request._id}`} reference={request.requestId} type={request.isEmergency ? "Emergency bed" : "Standard bed"} status={request.status} provider={request.hospital?.name || "Hospital record unavailable"} urgent={request.isEmergency} />)}
        </RequestGroup>
        <RequestGroup section={blood} title="Blood requests and donations" onRetry={() => retry("blood")} emptyMessage="No blood requests or donation pledges recorded.">
          {blood.data?.slice(0, 2).map((request) => <RequestRow key={request._id} href={`/track?type=blood&reference=${encodeURIComponent(request.reference)}`} reference={request.reference} type={request.isUrgent ? "Urgent blood" : request.type === "DONATION" ? "Donation" : "Blood request"} status={request.status} provider={request.bloodBankName || "Blood bank not selected"} urgent={request.isUrgent} />)}
        </RequestGroup>
        <RequestGroup section={ambulance} title="Ambulance bookings" onRetry={() => retry("ambulance")} emptyMessage="No ambulance bookings recorded.">
          {ambulance.data?.slice(0, 2).map((request) => <RequestRow key={request._id} href={`/track?type=ambulance&reference=${encodeURIComponent(request.reference)}`} reference={request.reference} type={request.isEmergency ? "Emergency ambulance" : "Ambulance booking"} status={request.status} provider={request.providerSnapshot?.name || "Provider record unavailable"} urgent={request.isEmergency} />)}
        </RequestGroup>
      </section>

      <div className="member-dashboard-aside">
        <section className="member-panel" aria-labelledby="dashboard-applications">
          <div className="member-panel-heading"><div><h2 id="dashboard-applications">Applications</h2></div></div>
          <SectionFeedback section={applications} title="Applications" onRetry={() => retry("applications")}>
            {applications.data?.length ? <ul className="member-application-list">{applications.data.slice(0, 4).map((application) => <li key={application._id || application.reference}>
              <span className="member-application-title">{application.job?.title || application.hospital?.name || application.provider?.name || application.roleInterested || "Role"}</span>
              <span className="member-application-status">{application.status || "Status unavailable"}</span>
              <CareerReference reference={application.reference} />
            </li>)}</ul> : <p className="member-state">No applications yet. Explore current healthcare roles when you are ready.</p>}
          </SectionFeedback>
          <Link className="member-panel-link member-panel-footer-link" href="/careers">Browse careers <span aria-hidden="true">→</span></Link>
        </section>

        <section className="member-panel" aria-labelledby="dashboard-saved">
          <div className="member-panel-heading"><div><h2 id="dashboard-saved">Saved hospitals</h2></div></div>
          <SectionFeedback section={profile} title="Saved hospitals" onRetry={() => retry("profile")}>
            {user?.savedHospitals?.length ? <ul className="member-saved-list">{user.savedHospitals.map((hospital) => <li key={hospital._id}><Link href={`/hospitals/${hospital.slug}`}>{hospital.name}<span aria-hidden="true">↗</span></Link></li>)}</ul> : <p className="member-state">No saved hospitals yet.</p>}
          </SectionFeedback>
          <Link className="member-panel-link member-panel-footer-link" href="/hospitals">Find hospitals <span aria-hidden="true">→</span></Link>
        </section>
      </div>
    </div>
    <Link href="/profile" className="member-profile-link">Manage profile and security <span aria-hidden="true">→</span></Link>
  </div>;
}
