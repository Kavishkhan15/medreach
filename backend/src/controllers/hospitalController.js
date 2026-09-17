import { Hospital } from "../models/Hospital.js";
import { withHospitalData } from "../services/hospitalDataLoader.js";
import { canManageHospital } from "../services/hospitalAccess.js";
import { DataSource } from "../models/DataSource.js";
import { AuditLog } from "../models/AuditLog.js";
import { HOSPITAL_CLAIM_FIELDS } from "../models/HospitalFieldClaim.js";
import { recordHospitalFieldClaims, normalizeFieldValue } from "../services/hospitalFieldFusion.js";
import { enrichHospitalData } from "../services/hospitalEnrichmentService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/hospitals — public search + filter + pagination + optional geo "nearest".
export const listHospitals = asyncHandler(async (req, res) => {
  const { q, region, city, status, specialty, lat, lng, page = 1, limit = 12 } = req.query;
  const filter = {};
  if (region) filter.region = region;
  if (city) filter.city = city;
  if (specialty) filter.departments = specialty;
  if (q) filter.$text = { $search: q };

  const perPage = Math.min(Number(limit) || 12, 50);
  const skip = (Math.max(Number(page), 1) - 1) * perPage;

  let query;
  // Geo "nearest" mode takes precedence when coords are supplied.
  if (lat && lng) {
    query = Hospital.find({
      ...filter,
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] },
        },
      },
    });
  } else {
    query = Hospital.find(filter).sort(q ? { score: { $meta: "textScore" } } : { name: 1 });
  }

  // A status filter must use verified observations, never the legacy stored
  // emergencyStatus default. Apply it after composing the public data view.
  if (status) {
    const candidates = await withHospitalData(await query.lean());
    const matching = candidates.filter((hospital) => hospital.emergencyStatus === status);
    return res.json({ data: matching.slice(skip, skip + perPage), page: Number(page), perPage, total: matching.length });
  }
  const [base, total] = await Promise.all([
    query.skip(skip).limit(perPage).lean(),
    Hospital.countDocuments(filter),
  ]);
  const data = await withHospitalData(base);

  res.json({ data, page: Number(page), perPage, total });
});

export const getHospital = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findOne({ slug: req.params.slug }).lean();
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  const [view] = await withHospitalData([hospital]);
  res.json({ hospital: view });
});

export const getEnrichedHospital = asyncHandler(async (req, res) => {
  const enriched = await enrichHospitalData(req.params.idOrSlug);
  if (!enriched) return res.status(404).json({ error: "Hospital not found" });
  res.json({ enriched });
});

export const createHospital = asyncHandler(async (req, res) => {
  const submitted = { ...req.body, specialties: req.body.specialties ?? req.body.departments };
  const clean = Object.fromEntries(Object.entries(submitted)
    .filter(([field]) => field !== "departments")
    .map(([field, value]) => [field, HOSPITAL_CLAIM_FIELDS.includes(field) ? normalizeFieldValue(field, value) : value])
    .filter(([, value]) => value !== null));
  const hospital = await Hospital.create({ ...clean, admins: [req.user.id] });
  const source = await DataSource.create({ name: `Hospital staff verified fields: ${hospital._id}`,
    type: "manual_verification", accessMethod: "manual", enabled: false, hospital: hospital._id });
  await recordHospitalFieldClaims({ hospitalId: hospital._id, source, values: submitted,
    sourcePageUrl: `medreach://hospital/${hospital._id}/admin`, assertedBy: req.user.id,
    verificationStatus: "verified", confidence: "HIGH" });
  await AuditLog.create({ user: req.user.id, action: "create", entityType: "Hospital", entityId: hospital._id,
    after: hospital.toObject(), requestId: req.id });
  res.status(201).json({ hospital });
});

export const updateHospital = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findById(req.params.id);
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  if (!canManageHospital(req.user, hospital)) return res.status(403).json({ error: "Not assigned to this hospital" });
  const staffFields = ["description", "address", "locality", "pincode", "phone", "emergencyPhone", "website", "specialties", "departments", "operatingHours", "hours"];
  const patch = req.user.role === "hospital_admin"
    ? Object.fromEntries(Object.entries(req.body).filter(([key]) => staffFields.includes(key)))
    : req.body;
  const claimValues = { ...patch, specialties: patch.specialties ?? patch.departments };
  const before = hospital.toObject();
  Object.assign(hospital, Object.fromEntries(Object.entries(patch)
    .filter(([field]) => field !== "departments" && !HOSPITAL_CLAIM_FIELDS.includes(field))));
  await hospital.save();
  const sourceName = `Hospital staff verified fields: ${hospital._id}`;
  let source = await DataSource.findOne({ name: sourceName, type: "manual_verification", hospital: hospital._id });
  if (!source) source = await DataSource.create({ name: sourceName, type: "manual_verification",
    accessMethod: "manual", enabled: false, hospital: hospital._id });
  await recordHospitalFieldClaims({ hospitalId: hospital._id, source, values: claimValues,
    sourcePageUrl: `medreach://hospital/${hospital._id}/admin`, assertedBy: req.user.id,
    verificationStatus: "verified", confidence: "HIGH" });
  const updated = await Hospital.findById(hospital._id);
  await AuditLog.create({ user: req.user.id, action: "update", entityType: "Hospital", entityId: hospital._id,
    before, after: updated.toObject(), requestId: req.id });
  res.json({ hospital: updated });
});

// PATCH /api/hospitals/:id/beds — retired legacy write path.
export const updateBeds = asyncHandler(async (req, res) => {
  const existing = await Hospital.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Hospital not found" });
  if (!canManageHospital(req.user, existing)) return res.status(403).json({ error: "Not assigned to this hospital" });
  // A hospital-wide legacy counter has no verified facility/source/time
  // provenance. It must not accept writes that appear to update live beds.
  res.status(410).json({ error: "Legacy bed updates retired; submit a verified facility availability observation instead" });
});

export const deleteHospital = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findByIdAndDelete(req.params.id);
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  try {
    await AuditLog.create({ user: req.user.id, action: "delete", entityType: "Hospital", entityId: hospital._id,
      before: hospital.toObject(), requestId: req.id });
  } catch (error) {
    await Hospital.replaceOne({ _id: hospital._id }, hospital.toObject(), { upsert: true });
    throw error;
  }
  res.json({ ok: true });
});
