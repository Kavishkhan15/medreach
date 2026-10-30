import { decodeHospitalCursor, encodeHospitalCursor, hospitalCursorFilter } from "../services/hospitalPagination.js";
import { archiveProviderOrganization } from "../services/providerLifecycle.js";
import { Hospital } from "../models/Hospital.js";
import { withHospitalData, withHospitalAvailability } from "../services/hospitalDataLoader.js";
import { readHospitalPage } from "../services/hospitalReadPipeline.js";
import { canManageHospital } from "../services/hospitalAccess.js";
import { DataSource } from "../models/DataSource.js";
import { AuditLog } from "../models/AuditLog.js";
import { HOSPITAL_CLAIM_FIELDS } from "../models/HospitalFieldClaim.js";
import { recordHospitalFieldClaims, normalizeFieldValue } from "../services/hospitalFieldFusion.js";
import { enrichHospitalData } from "../services/hospitalEnrichmentService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Public listings do not need administrative lifecycle or lease metadata.
const publicHospitalProjection = "-admins -archivedBy -archiveReason -archiveOperation -archivePending -archiveAttempts -archiveLeaseUntil -archiveRetryAt -archiveExhaustedAt -archiveErrorCode -__v";

async function loadPublicEvidence(res, hospitals) {
  const start = performance.now();
  try { return await withHospitalData(hospitals); }
  finally { res.locals.performance = { ...res.locals.performance, evidenceMs: +(performance.now() - start).toFixed(2) }; }
}

// GET /api/hospitals — public search + filter + pagination + optional geo "nearest".
const hospitalListing = (includeUnapproved) => asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { q, region, city, status, specialty, lat, lng, page = 1, limit = 12 } = req.query;
  const filter = includeUnapproved ? {} : { archivedAt: null, approvalStatus: { $nin: ["pending", "rejected"] } };
  const projection = includeUnapproved ? "-admins" : publicHospitalProjection;
  if (region) filter.region = region;
  if (city) filter.city = city;
  if (specialty) filter.departments = specialty;
  if (q) filter.$text = { $search: q };
  // Form selectors need identity and labels, never availability history or evidence.
  if (!includeUnapproved && req.query.view === "options") {
    if (req.query.id) {
      if (/^[a-f0-9]{24}$/i.test(req.query.id)) filter._id = req.query.id;
      else filter.slug = req.query.id;
    }
    const count = Math.min(Number(limit), 50);
    const offset = (Number(page) - 1) * count;
    const rows = await Hospital.find(filter).select("_id name slug locality").sort({ name: 1, _id: 1 }).skip(offset).limit(count + 1).lean();
    return res.json({ data: rows.slice(0, count), page: Number(page), perPage: count, nextPage: rows.length > count ? Number(page) + 1 : null });
  }

  if (!includeUnapproved && req.query.view === "summary") {
    if (status || req.query.cursor !== undefined || req.query.pagination || req.query.includeTotal === "false") {
      return res.status(400).json({ error: "Summary view supports page-based directory search without an availability-status filter" });
    }
    const perPage = Math.min(Number(limit), 50);
    const skip = (Number(page) - 1) * perPage;
    if (!Number.isSafeInteger(skip) || skip < 0) return res.status(400).json({ error: "Invalid directory page" });
    const start = performance.now();
    const fields = "_id name slug hospitalType address locality city region pincode location specialties departments services operatingHours hours phone emergencyPhone website verificationStatus demo";
    if (!q && !lat && !lng) {
      const { data, total } = await readHospitalPage({ filter, skip, limit: perPage, includeProvenance: false,
        projection: Object.fromEntries(fields.split(" ").map(field => [field, 1])) });
      res.locals.performance = { joinedReadMs: +(performance.now() - start).toFixed(2) };
      return res.json({ data, total, page: Number(page), perPage });
    }
    const match = lat && lng ? { ...filter, location: { $near: { $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] } } } } : filter;
    let query = Hospital.find(match).select(fields);
    if (!(lat && lng)) query = query.sort(q ? { score: { $meta: "textScore" }, _id: 1 } : { name: 1, _id: 1 });
    const [rows, total] = await Promise.all([query.skip(skip).limit(perPage).lean(), Hospital.countDocuments(filter)]);
    res.locals.performance = { directoryQueryMs: +(performance.now() - start).toFixed(2) };
    const evidenceStart = performance.now();
    const data = await withHospitalAvailability(rows);
    res.locals.performance.evidenceMs = +(performance.now() - evidenceStart).toFixed(2);
    return res.json({ data, total, page: Number(page), perPage });
  }

  const cursorMode = req.query.pagination === "cursor" || req.query.cursor !== undefined;
  if (req.query.includeTotal === "false" && !cursorMode) return res.status(400).json({ error: "Omitting totals requires cursor pagination" });
  if (cursorMode && (q || lat || lng || status || Number(page) !== 1)) return res.status(400).json({ error: "Cursor pagination supports directory filters without search, distance or derived status" });
  const perPage = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const skip = (Math.max(Number(page), 1) - 1) * perPage;

  if (cursorMode) {
    const cursor = req.query.cursor ? decodeHospitalCursor(req.query.cursor) : null;
    const queryStart = performance.now();
    const { data: rows, total } = await readHospitalPage({
      filter: cursor ? { $and: [filter, hospitalCursorFilter(cursor)] } : filter,
      countFilter: filter, projection, limit: perPage + 1, includeTotal: req.query.includeTotal !== "false",
    });
    res.locals.performance = { joinedReadMs: +(performance.now() - queryStart).toFixed(2) };
    const data = rows.slice(0, perPage);
    return res.json({ data, page: 1, perPage, total, nextCursor: rows.length > perPage ? encodeHospitalCursor(data[data.length - 1]) : null });
  }
  // Preserve specialized geo/text/derived-status paths; ordinary directory
  // pages can compose records and evidence in one indexed database command.
  if (!q && !lat && !lng && !status) {
    const queryStart = performance.now();
    const { data, total } = await readHospitalPage({ filter, projection, skip, limit: perPage });
    res.locals.performance = { joinedReadMs: +(performance.now() - queryStart).toFixed(2) };
    return res.json({ data, page: Number(page), perPage, total });
  }
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
    }).select(projection);
  } else {
    query = Hospital.find(filter).select(projection).sort(q ? { score: { $meta: "textScore" }, _id: 1 } : { name: 1, _id: 1 });
  }

  // A status filter must use verified observations, never the legacy stored
  // emergencyStatus default. Apply it after composing the public data view.
  if (status) {
    const filterStart = performance.now();
    // Exact derived-status totals require reading candidate evidence. Stream
    // bounded batches instead of materialising every hospital and its history.
    const data = [];
    let total = 0;
    const processBatch = async (batch) => {
      const availability = await withHospitalAvailability(batch);
      for (let index = 0; index < availability.length; index++) {
        const hospital = availability[index];
        if (hospital.emergencyStatus !== status) continue;
        if (total >= skip && data.length < perPage) data.push(batch[index]);
        total++;
      }
    };
    let batch = [];
    for await (const hospital of query.lean().cursor({ batchSize: 100 })) {
      batch.push(hospital);
      if (batch.length === 100) { await processBatch(batch); batch = []; }
    }
    if (batch.length) await processBatch(batch);
    res.locals.performance = { availabilityFilterMs: +(performance.now() - filterStart).toFixed(2) };
    return res.json({ data: await loadPublicEvidence(res, data), page: Number(page), perPage, total });
  }
  const queryStart = performance.now();
  const [base, total] = await Promise.all([
    query.skip(skip).limit(perPage).lean(),
    Hospital.countDocuments(filter),
  ]);
  res.locals.performance = { directoryQueryMs: +(performance.now() - queryStart).toFixed(2) };
  const data = await loadPublicEvidence(res, base);

  res.json({ data, page: Number(page), perPage, total });
});
export const listHospitals = hospitalListing(false);
export const listAdminHospitals = hospitalListing(true);

export const getHospital = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { data: [hospital] } = await readHospitalPage({ filter: { slug: req.params.slug, archivedAt: null, approvalStatus: { $nin: ["pending", "rejected"] } },
    projection: publicHospitalProjection, limit: 1, includeTotal: false });
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  res.json({ hospital });
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
  const hospital = await Hospital.create({ ...clean, approvalStatus: "pending", admins: [req.user.id] });
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
  const patch = req.user.role !== "system_admin"
    ? Object.fromEntries(Object.entries(req.body).filter(([key]) => staffFields.includes(key)))
    : Object.fromEntries(Object.entries(req.body).filter(([key]) => !["archivedAt", "archivedBy", "archiveReason", "archiveOperation", "archivePending", "archiveAttempts", "archiveLeaseToken", "archiveLeaseUntil", "archiveRetryAt", "archiveExhaustedAt", "archiveErrorCode"].includes(key)));
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
  const result = await archiveProviderOrganization({ kind: "hospital", id: req.params.id, actor: req.user, reason: req.body?.reason });
  res.json({ ok: true, archived: true, cleanupPending: result.cleanupPending });
});
