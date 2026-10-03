"use client";
import Link from "next/link";
import { useDashboard } from "../../lib/useDashboard";
import CareerReference from "../../components/CareerReference";

function SectionFeedback({ section, title, onRetry, children }) {
  if (section.loading) return <p role="status" className="text-gray-500">Loading {title.toLowerCase()}…</p>;
  if (section.error) return <div role="alert" className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-md p-3 text-sm mb-4">
    <p>{section.error}</p>
    <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm font-semibold" style={{ minHeight: 44 }} onClick={onRetry}>Retry {title.toLowerCase()}</button>
    {section.status === 401 && <Link href="/login?returnTo=%2Fdashboard">Sign in</Link>}
  </div>;
  return children;
}

export default function Dashboard() {
  const { profile, requests, applications, retry } = useDashboard();
  const user = profile.data;
  return <>
    <div className="mb-6"><span className="eyebrow">Your MedReach</span><h1 className="text-2xl font-bold mt-1">{user ? `Welcome, ${user.name.split(" ")[0]}` : "Dashboard"}</h1><p className="text-gray-600 mt-2">Quick access to your requests, applications, saved hospitals.</p></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5" aria-labelledby="dashboard-requests">
      <h2 id="dashboard-requests" className="text-lg font-bold mb-2">Emergency requests</h2>
      <SectionFeedback section={requests} title="Emergency requests" onRetry={() => retry("requests")}>
        {requests.data?.length ? requests.data.slice(0, 4).map((request) => <p key={request._id} className="text-sm mb-1"><Link href={`/requests/${request._id}`}>{request.requestId}</Link> · {request.status}</p>) : <p>No requests yet.</p>}
      </SectionFeedback>
      <Link className="inline-block mt-3 border border-[var(--color-emergency)] text-[var(--color-emergency)] rounded-md px-4 py-1.5 text-sm font-semibold" href="/requests">View requests</Link>
    </section>
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5" aria-labelledby="dashboard-applications">
      <h2 id="dashboard-applications" className="text-lg font-bold mb-2">Applications</h2>
      <SectionFeedback section={applications} title="Applications" onRetry={() => retry("applications")}>
        {applications.data?.length ? applications.data.slice(0, 4).map((application) => <div key={application.reference} className="text-sm mb-1" style={{ marginBottom: 16, minWidth: 0 }}><p>{application.job?.title || application.hospital?.name || application.provider?.name || application.roleInterested || "Role"} · {application.status}</p><CareerReference reference={application.reference} /></div>) : <p>No applications yet.</p>}
      </SectionFeedback>
      <Link className="inline-block mt-3 border border-[var(--color-emergency)] text-[var(--color-emergency)] rounded-md px-4 py-1.5 text-sm font-semibold" href="/careers">Browse careers</Link>
    </section>
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5" aria-labelledby="dashboard-saved">
      <h2 id="dashboard-saved" className="text-lg font-bold mb-2">Saved hospitals</h2>
      <SectionFeedback section={profile} title="Saved hospitals" onRetry={() => retry("profile")}>
        {user?.savedHospitals?.length ? user.savedHospitals.map((hospital) => <p key={hospital._id} className="text-sm mb-1"><Link href={`/hospitals/${hospital.slug}`}>{hospital.name}</Link></p>) : <p>No saved hospitals.</p>}
      </SectionFeedback>
      <Link className="inline-block mt-3 border border-[var(--color-emergency)] text-[var(--color-emergency)] rounded-md px-4 py-1.5 text-sm font-semibold" href="/hospitals">Find hospitals</Link>
    </section>
      <div className="col-span-full"><Link href="/profile" className="text-[var(--color-emergency)] text-sm font-semibold">Edit profile and security →</Link></div>
    </div>
  </>;
}
