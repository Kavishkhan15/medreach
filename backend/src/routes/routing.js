import { Router } from "express";
import { query } from "express-validator";
import { validate } from "../middleware/validate.js";
import { Hospital } from "../models/Hospital.js";
import { getRoute } from "../services/routingService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const router = Router();
router.get("/hospital/:id", query("lat").isFloat({ min: -90, max: 90 }), query("lng").isFloat({ min: -180, max: 180 }), validate,
  asyncHandler(async (req, res) => {
    const hospital = await Hospital.findById(req.params.id).select("location").lean();
    if (!hospital) return res.status(404).json({ error: "Hospital not found" });
    const [lng, lat] = hospital.location?.coordinates || [];
    if (!lat || !lng) return res.json({ configured: false, routeDistanceKm: null, durationMinutes: null });
    try { res.json(await getRoute({ lat: Number(req.query.lat), lng: Number(req.query.lng) }, { lat, lng })); }
    catch { res.json({ configured: false, routeDistanceKm: null, durationMinutes: null, message: "Travel time unavailable" }); }
  }));
export default router;
