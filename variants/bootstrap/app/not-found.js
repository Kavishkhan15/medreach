import Link from "next/link";

export const metadata = {
  title: "404 — Page Not Found | MedReach Mumbai",
  description: "The requested healthcare listing, service directory, or page could not be found.",
};

export default function NotFound() {
  return (
    <div className="container py-5 my-4 text-center">
      <div className="row justify-content-center">
        <div className="col-md-8 col-lg-6">
          <div className="surface p-4 p-md-5 rounded shadow-sm border">
            <span className="badge bg-danger-subtle text-danger fs-6 px-3 py-2 mb-3 rounded-pill">
              Error 404
            </span>
            <h1 className="h2 fw-bold mb-3">Page Not Found</h1>
            <p className="text-muted mb-4">
              The healthcare service, hospital listing, or request reference you are looking for does not exist or has moved.
            </p>
            <div className="d-flex flex-column flex-sm-row justify-content-center gap-2 mb-4">
              <Link href="/" className="btn btn-primary px-4 py-2">
                Return Home
              </Link>
              <Link href="/emergency" className="btn btn-outline-danger px-4 py-2">
                Emergency Care
              </Link>
              <Link href="/hospitals" className="btn btn-outline-secondary px-4 py-2">
                Hospital Directory
              </Link>
            </div>
            <hr className="my-4" />
            <div className="text-start">
              <h2 className="h6 fw-bold text-uppercase text-muted mb-2">Need immediate assistance?</h2>
              <ul className="list-unstyled mb-0 small text-muted">
                <li>• For medical emergencies in Mumbai, call <a href="tel:112" className="fw-bold text-danger text-decoration-none">112</a> or <a href="tel:108" className="fw-bold text-danger text-decoration-none">108</a>.</li>
                <li>• Track an existing request at <Link href="/track" className="text-decoration-none">Request Tracking</Link>.</li>
                <li>• Browse available blood banks at <Link href="/blood-banks" className="text-decoration-none">Blood Services</Link>.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
