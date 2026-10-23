import Link from "next/link";

export const metadata = {
  title: "404 — Page Not Found | MedReach Mumbai",
  description: "The requested healthcare listing, service directory, or page could not be found.",
};

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <span className="inline-block rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 mb-4 border border-red-200">
          Error 404
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-3">
          Page Not Found
        </h1>
        <p className="text-slate-600 mb-6 text-sm sm:text-base leading-relaxed">
          The healthcare service, hospital listing, or request reference you are looking for does not exist or has moved.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3 mb-6">
          <Link
            href="/"
            className="rounded-lg bg-[var(--color-primary,#0047AB)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition"
          >
            Return Home
          </Link>
          <Link
            href="/emergency"
            className="rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 transition"
          >
            Emergency Care
          </Link>
          <Link
            href="/hospitals"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Hospital Directory
          </Link>
        </div>
        <hr className="my-6 border-slate-200" />
        <div className="text-left text-xs sm:text-sm text-slate-600">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Need immediate assistance?
          </h2>
          <ul className="space-y-1">
            <li>• For medical emergencies in Mumbai, call <a href="tel:112" className="font-bold text-red-600">112</a> or <a href="tel:108" className="font-bold text-red-600">108</a>.</li>
            <li>• Track an existing request at <Link href="/track" className="text-blue-600 underline">Request Tracking</Link>.</li>
            <li>• Browse available blood banks at <Link href="/blood-banks" className="text-blue-600 underline">Blood Services</Link>.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
