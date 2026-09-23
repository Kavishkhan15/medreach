import HospitalCard from "./HospitalCard";

function CardSkeleton() {
  return (
    <div className="card h-100" aria-hidden="true">
      <div className="card-body">
        <div className="placeholder-glow">
          <span className="placeholder col-8 mb-2" />
          <span className="placeholder col-5" />
          <span className="placeholder col-12 mt-3" />
          <span className="placeholder col-6" />
        </div>
      </div>
    </div>
  );
}

export default function HospitalList({ hospitals = [], loading, emptyMessage = "No hospitals match your search.", flow }) {
  if (loading) {
    return (
      <div className="grid-cards" aria-busy="true">
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
    <div className="grid-cards">
      {hospitals.map((h) => (
        <HospitalCard hospital={h} key={h._id || h.slug} flow={flow} />
      ))}
    </div>
  );
}
