"use client";

export default function CareerAvailability({ job }) {
  const availability = job.availability;
  const remaining = Number.isSafeInteger(availability?.remaining) && availability.remaining >= 0 ? availability.remaining : null;
  return <div className="border rounded-3 p-3 mb-3" aria-label="Position availability">
    <strong className="d-block mb-1">{remaining === null ? "Position count not reported" : `${remaining} ${remaining === 1 ? "position" : "positions"} open`}</strong>
    {Number.isSafeInteger(availability?.total) && Number.isSafeInteger(availability?.filled) && <p className="mb-1">{availability.filled} filled · {availability.total} total positions</p>}
    {availability?.reportedAt && <p className="text-secondary mb-1">Reported {new Date(availability.reportedAt).toLocaleString("en-IN")}</p>}
    <p className="text-secondary mb-0">{job.demo ? "Demo role. " : ""}Applications do not reserve a position. The employer confirms selection.</p>
  </div>;
}
