import HospitalCard from "./HospitalCard";

function CardSkeleton() {
  return (
    <div className="col-12 col-md-6 col-lg-4">
      <div className="card h-100" aria-hidden="true">
        <div className="card-body p-4">
          <div className="placeholder-glow">
            <span className="placeholder col-8 mb-2" />
            <span className="placeholder col-5" />
            <span className="placeholder col-12 mt-3" />
            <span className="placeholder col-6" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HospitalList({ hospitals, loading, emptyMessage = "No hospitals match your search." }) {
  if (loading) {
    return (
      <div className="row g-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }
  if (!hospitals.length) {
    return (
      <div className="surface text-center">
        <p className="mb-0 text-secondary">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="row g-3">
      {hospitals.map((h) => (
        <div className="col-12 col-md-6 col-lg-4" key={h._id || h.slug}>
          <HospitalCard hospital={h} />
        </div>
      ))}
    </div>
  );
}
