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
  const { profile, requests, applications, retry } = useDashboard();
  const user = profile.data;
  return <>
    <div className="page-head mb-4"><span className="eyebrow">Your MedReach</span><h1 className="">{user ? `Welcome, ${user.name.split(" ")[0]}` : "Dashboard"}</h1><p className="">Quick access to your requests, applications, saved hospitals.</p></div>
    <div className="grid-2">
      <section className="surface" aria-labelledby="dashboard-requests">
      <h2 id="dashboard-requests" className="h5">Emergency requests</h2>
      <SectionFeedback section={requests} title="Emergency requests" onRetry={() => retry("requests")}>
        {requests.data?.length ? requests.data.slice(0, 4).map((request) => <p key={request._id} className="small"><Link href={`/requests/${request._id}`}>{request.requestId}</Link> · {request.status}</p>) : <p>No requests yet.</p>}
      </SectionFeedback>
      <Link className="btn btn-outline-primary btn-sm" href="/requests">View requests</Link>
    </section>
      <section className="surface" aria-labelledby="dashboard-applications">
      <h2 id="dashboard-applications" className="h5">Applications</h2>
      <SectionFeedback section={applications} title="Applications" onRetry={() => retry("applications")}>
        {applications.data?.length ? applications.data.slice(0, 4).map((application) => <div key={application.reference} className="small" style={{ marginBottom: 16, minWidth: 0 }}><p>{application.job?.title || application.hospital?.name || application.provider?.name || application.roleInterested || "Role"} · {application.status}</p><CareerReference reference={application.reference} /></div>) : <p>No applications yet.</p>}
      </SectionFeedback>
      <Link className="btn btn-outline-primary btn-sm" href="/careers">Browse careers</Link>
    </section>
      <section className="surface" aria-labelledby="dashboard-saved">
      <h2 id="dashboard-saved" className="h5">Saved hospitals</h2>
      <SectionFeedback section={profile} title="Saved hospitals" onRetry={() => retry("profile")}>
        {user?.savedHospitals?.length ? user.savedHospitals.map((hospital) => <p key={hospital._id} className="small"><Link href={`/hospitals/${hospital.slug}`}>{hospital.name}</Link></p>) : <p>No saved hospitals.</p>}
      </SectionFeedback>
      <Link className="btn btn-outline-primary btn-sm" href="/hospitals">Find hospitals</Link>
    </section>
      <div className=""><Link href="/profile" className="btn btn-link">Edit profile and security →</Link></div>
    </div>
  </>;
}
