"use client";

import { useEffect, useState } from "react";

export default function CareerVacancyEditor({ job, disabled, onSave }) {
  const [vacancies, setVacancies] = useState("");
  const [filled, setFilled] = useState("0");
  useEffect(() => {
    setVacancies(Number.isSafeInteger(job.vacancies) ? String(job.vacancies) : "");
    setFilled(Number.isSafeInteger(job.filledPositions) ? String(job.filledPositions) : "0");
  }, [job._id, job.__v, job.vacancies, job.filledPositions]);

  const reported = job.availability?.reportedAt;
  const total = vacancies === "" ? null : Number(vacancies);
  const occupied = Number(filled);
  const valid = (total === null || (Number.isSafeInteger(total) && total >= 0 && total <= 10000))
    && filled !== "" && Number.isSafeInteger(occupied) && occupied >= 0 && occupied <= 10000
    && (total === null || occupied <= total);

  return <section className="bg-light rounded p-3 mb-3" aria-label={`Vacancies for ${job.title}`}>
    <h3 className="h6 mb-2">Position availability</h3>
    <p className="mb-2">{Number.isSafeInteger(job.availability?.remaining)
      ? `${job.availability.remaining} open · ${job.availability.filled} filled · ${job.availability.total} total positions`
      : "Number of open positions not reported"}</p>
    {reported && Number.isFinite(new Date(reported).getTime()) && <p className="text-secondary mb-3">Last reported {new Date(reported).toLocaleString()}</p>}
    <details>
      <summary className="text-primary mb-3">Edit position counts</summary>
      <form onSubmit={(event) => {
      event.preventDefault();
      if (valid) onSave({ vacancies: total, filledPositions: occupied, expectedVersion: job.__v ?? 0 });
    }}>
      <div className="row g-3">
        <div className="col-sm-6">
          <label className="form-label" htmlFor={`vacancies-${job._id}`}>Total positions</label>
          <input id={`vacancies-${job._id}`} className="form-control" type="number" min="0" max="10000" step="1"
            placeholder="Not reported" value={vacancies} onChange={(event) => setVacancies(event.target.value)} />
        </div>
        <div className="col-sm-6">
          <label className="form-label" htmlFor={`filled-${job._id}`}>Filled positions</label>
          <input id={`filled-${job._id}`} className="form-control" type="number" min="0" max={total ?? 10000} step="1" required
            value={filled} onChange={(event) => setFilled(event.target.value)} />
        </div>
      </div>
      <p className="text-secondary my-2">Leave total positions blank if unknown. Applications do not reduce vacancies; update filled positions after hiring is confirmed.</p>
      {!valid && <p className="text-danger" role="alert">Use whole, non-negative counts. Filled positions cannot exceed the total.</p>}
      <button className="btn btn-outline-primary" disabled={disabled || !valid}>Update position counts</button>
      </form>
    </details>
  </section>;
}
