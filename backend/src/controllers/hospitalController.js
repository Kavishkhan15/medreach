import { Hospital } from "../models/Hospital.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/hospitals — public search + filter + pagination + optional geo "nearest".
export const listHospitals = asyncHandler(async (req, res) => {
  const { q, region, city, status, specialty, lat, lng, page = 1, limit = 12 } = req.query;
  const filter = {};
  if (region) filter.region = region;
  if (city) filter.city = city;
  if (status) filter.emergencyStatus = status;
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

  const [data, total] = await Promise.all([
    query.skip(skip).limit(perPage).lean(),
    Hospital.countDocuments(filter),
  ]);

  res.json({ data, page: Number(page), perPage, total });
});

export const getHospital = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findOne({ slug: req.params.slug }).lean();
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  res.json({ hospital });
});

export const createHospital = asyncHandler(async (req, res) => {
  const hospital = await Hospital.create({ ...req.body, admins: [req.user.id] });
  res.status(201).json({ hospital });
});

export const updateHospital = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  res.json({ hospital });
});

// PATCH /api/hospitals/:id/beds — real-time bed/emergency status updates (admin).
export const updateBeds = asyncHandler(async (req, res) => {
  const { bedsAvailable, emergencyStatus } = req.body;
  const update = {};
  if (bedsAvailable !== undefined) update.bedsAvailable = bedsAvailable;
  if (emergencyStatus !== undefined) update.emergencyStatus = emergencyStatus;
  const hospital = await Hospital.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  res.json({ hospital });
});

export const deleteHospital = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findByIdAndDelete(req.params.id);
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  res.json({ ok: true });
});
