"use client";
import Link from "next/link";
import { useDashboard } from "../../lib/useDashboard";
import CareerReference from "../../components/CareerReference";

function SectionFeedback({ section, title, onRetry, children }) {
  if (section.loading) return <p role="status" className="">Loading {title.toLowerCase()}…</p>;
  if (section.error) return <div role="alert" className="alert alert-warning">
    <p>{section.error}</p>
    <button type="button" className="btn btn-outline-secondary btn-sm" style={{ minHeight: 44 }} onClick={onRetry}>Retry {title.toLowerCase()}</button>
    {section.status === 401 && <Link href="/login?returnTo=%2Fdashboard">Sign in</Link>}
  </div>;
  return children;
}

export default function Dashboard() {
  const { profile, requests, blood, ambulance, applications, retry } = useDashboard();
  const user = profile.data;
  const hasRequests = (requests.data?.length || 0) + (blood?.data?.length || 0) + (ambulance?.data?.length || 0) > 0;

  return <>
    <nav aria-label="User dashboard sections"><Link href="/dashboard">Home</Link> · <Link href="/hospitals">Find Services</Link> · <Link href="/requests">My Requests</Link> · <Link href="/blood-banks">Blood Donation</Link> · <Link href="/careers">Careers</Link> · <Link href="/profile">My Profile</Link></nav>
    <div className="page-head mb-4"><span className="eyebrow">Your MedReach</span><h1 className="">{user?.name ? `Welcome, ${user.name.split(" ")[0]}` : "Dashboard"}</h1><p className="">Quick access to your requests, applications, saved hospitals.</p></div>
    <div className="row g-3">
      <div className="col-md-6"><section className="surface h-100" aria-labelledby="dashboard-requests">
      <h2 id="dashboard-requests" className="h5">Emergency requests</h2>
      <SectionFeedback section={requests} title="Emergency requests" onRetry={() => retry("requests")}>
        {hasRequests ? (
          <div className="vstack gap-2">
            {requests.data?.slice(0, 3).map((request) => (
              <div key={request._id} className="small">
                <div>
                  <Link href={`/requests/${request._id}`} className="fw-semibold">{request.requestId}</Link> · <span className={`badge ${request.isEmergency ? "bg-danger" : "bg-primary"}`}>{request.isEmergency ? "Emergency Bed" : "Standard Bed"}</span> · {request.status}
                </div>
                <div className="text-secondary">{request.hospital?.name || "Hospital"} · <Link href={`/requests/${request._id}`} aria-label={`Track bed request ${request.requestId}`}>Track</Link></div>
              </div>
            ))}
            {blood?.data?.slice(0, 2).map((b) => (
              <div key={b._id} className="small">
                <div>
                  <Link href={`/track?type=blood&reference=${encodeURIComponent(b.reference)}`} className="fw-semibold">{b.reference}</Link> · <span className={`badge ${b.isUrgent ? "bg-danger" : "bg-info text-dark"}`}>{b.isUrgent ? "Urgent Blood" : b.type === "DONATION" ? "Donation" : "Normal Blood"}</span> · {b.status}
                </div>
                <div className="text-secondary">{b.bloodBankName || "Blood bank"} · <Link href={`/track?type=blood&reference=${encodeURIComponent(b.reference)}`} aria-label={`Track blood request ${b.reference}`}>Track</Link></div>
              </div>
            ))}
            {ambulance?.data?.slice(0, 2).map((a) => (
              <div key={a._id} className="small">
                <div>
                  <Link href={`/track?type=ambulance&reference=${encodeURIComponent(a.reference)}`} className="fw-semibold">{a.reference}</Link> · <span className={`badge ${a.isEmergency ? "bg-danger" : "bg-secondary"}`}>{a.isEmergency ? "Emergency Ambulance" : "Normal Ambulance"}</span> · {a.status}
                </div>
                <div className="text-secondary">{a.providerSnapshot?.name || "Ambulance"} · <Link href={`/track?type=ambulance&reference=${encodeURIComponent(a.reference)}`} aria-label={`Track ambulance request ${a.reference}`}>Track</Link></div>
              </div>
            ))}
          </div>
        ) : <p>No requests yet.</p>}
      </SectionFeedback>
      <Link className="btn btn-outline-primary mt-3" href="/requests">View requests</Link>
    </section></div>
      <div className="col-md-6"><section className="surface h-100" aria-labelledby="dashboard-applications">
      <h2 id="dashboard-applications" className="h5">Applications</h2>
      <SectionFeedback section={applications} title="Applications" onRetry={() => retry("applications")}>
        {applications.data?.length ? applications.data.slice(0, 4).map((application) => <div key={application._id || application.reference} className="" style={{ marginBottom: 16, minWidth: 0 }}><p>{application.job?.title || application.hospital?.name || application.provider?.name || application.roleInterested || "Role"} · {application.status}</p><CareerReference reference={application.reference} /></div>) : <p>No applications yet.</p>}
      </SectionFeedback>
      <Link className="btn btn-outline-primary" href="/careers">Browse careers</Link>
    </section></div>
      <div className="col-md-6"><section className="surface h-100" aria-labelledby="dashboard-saved">
      <h2 id="dashboard-saved" className="h5">Saved hospitals</h2>
      <SectionFeedback section={profile} title="Saved hospitals" onRetry={() => retry("profile")}>
        {user?.savedHospitals?.length ? user.savedHospitals.map((hospital) => <p key={hospital._id} className=""><Link href={`/hospitals/${hospital.slug}`}>{hospital.name}</Link></p>) : <p>No saved hospitals.</p>}
      </SectionFeedback>
      <Link className="btn btn-outline-primary" href="/hospitals">Find hospitals</Link>
    </section></div>
      <div className="col-12"><Link href="/profile" className="btn btn-link">Edit profile and security →</Link></div>
    </div>
  </>;
}
