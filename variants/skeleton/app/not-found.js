import Link from "next/link";

export const metadata = {
  title: "404 — Page Not Found | MedReach Mumbai",
  description: "The requested healthcare listing, service directory, or page could not be found.",
};

export default function NotFound() {
  return (
    <div className="container py-5 text-center">
      <div className="row">
        <div className="eight columns offset-by-two">
          <div className="surface p-4 text-center">
            <span className="badge badge-error mb-2" style={{ display: "inline-block", padding: "4px 12px", borderRadius: "16px", backgroundColor: "#fee2e2", color: "#b91c1c" }}>
              Error 404
            </span>
            <h1 className="h3 mt-2 mb-2">Page Not Found</h1>
            <p className="text-muted mb-4">
              The healthcare service, hospital listing, or request reference you are looking for does not exist or has moved.
            </p>
            <div className="d-flex justify-content-center gap-2 mb-4" style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
              <Link href="/" className="button button-primary">
                Return Home
              </Link>
              <Link href="/emergency" className="button">
                Emergency Care
              </Link>
              <Link href="/hospitals" className="button">
                Hospital Directory
              </Link>
            </div>
            <hr className="my-4" />
            <div className="text-left" style={{ textAlign: "left" }}>
              <h2 className="text-muted" style={{ fontSize: "14px", textTransform: "uppercase", fontWeight: "bold" }}>
                Need immediate assistance?
              </h2>
              <ul style={{ listStyle: "none", paddingLeft: 0, fontSize: "13px" }}>
                <li>• For medical emergencies in Mumbai, call <a href="tel:112" style={{ color: "#b91c1c", fontWeight: "bold" }}>112</a> or <a href="tel:108" style={{ color: "#b91c1c", fontWeight: "bold" }}>108</a>.</li>
                <li>• Track an existing request at <Link href="/track">Request Tracking</Link>.</li>
                <li>• Browse available blood banks at <Link href="/blood-banks">Blood Services</Link>.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
