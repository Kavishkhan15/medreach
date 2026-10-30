// A vacancy is a hiring position, not a limit on the number of applications.
export function careerAvailability(job, now = Date.now()) {
  const total = Number.isSafeInteger(job.vacancies) && job.vacancies >= 0 ? job.vacancies : null;
  // Legacy records have no filled count. Do not invent one for those records.
  const filled = Number.isSafeInteger(job.filledPositions) && job.filledPositions >= 0 ? job.filledPositions : null;
  const remaining = total !== null && filled !== null && filled <= total ? total - filled : null;
  const deadlinePassed = Boolean(job.deadline && new Date(job.deadline).getTime() <= now);
  return { total, filled, remaining, acceptingApplications: job.status === "published" && !deadlinePassed && remaining !== 0,
    reportedAt: job.availabilityReportedAt || null, source: job.demo ? "demo" : job.availabilityReportedAt ? "provider_reported" : "unknown" };
}

export const withCareerAvailability = job => ({ ...job, availability: careerAvailability(job) });
