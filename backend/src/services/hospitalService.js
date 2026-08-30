// Builds a Mongoose filter from query params. Pure (no DB), unit-testable.
export function buildHospitalFilter(q = {}) {
  const filter = {};
  if (q.region) filter.region = q.region;
  if (q.city) filter.city = q.city;
  if (q.locality) filter.locality = q.locality;
  if (q.hospitalType) filter.hospitalType = q.hospitalType;
  if (q.status) filter.emergencyStatus = q.status;
  if (q.specialty) filter.$or = [{ specialties: q.specialty }, { departments: q.specialty }];
  if (q.verified === "true") filter.verificationStatus = "verified";
  if (q.q) filter.$text = { $search: String(q.q) };
  return filter;
}

export function paginate(q = {}) {
  const perPage = Math.min(Number(q.limit) || 12, 50);
  const page = Math.max(Number(q.page) || 1, 1);
  return { perPage, page, skip: (page - 1) * perPage };
}
