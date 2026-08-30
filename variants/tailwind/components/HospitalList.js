import HospitalCard from "./HospitalCard";

function CardSkeleton() {
  return (
    <div className="w-full md:w-1/2 lg:w-1/3 px-1.5 mb-3">
      <div className="h-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)]" aria-hidden="true">
        <div className="p-4">
          <div className="animate-pulse space-y-2">
            <span className="block h-4 w-8/12 rounded bg-[#e3e6ea]" />
            <span className="block h-4 w-5/12 rounded bg-[#e3e6ea]" />
            <span className="block h-4 w-full rounded bg-[#e3e6ea] mt-3" />
            <span className="block h-4 w-6/12 rounded bg-[#e3e6ea]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HospitalList({ hospitals, loading, emptyMessage = "No hospitals match your search." }) {
  if (loading) {
    return (
      <div className="flex flex-wrap -mx-1.5" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }
  if (!hospitals.length) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5 text-center">
        <p className="mb-0 text-[var(--color-muted)]">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap -mx-1.5">
      {hospitals.map((h) => (
        <div className="w-full md:w-1/2 lg:w-1/3 px-1.5 mb-3" key={h._id || h.slug}>
          <HospitalCard hospital={h} />
        </div>
      ))}
    </div>
  );
}
