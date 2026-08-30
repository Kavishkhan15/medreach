import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/users/me/saved — the registered user's Quick Access list.
export const getSaved = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate(
    "savedHospitals",
    "name slug city emergencyStatus emergencyPhone"
  );
  res.json({ data: user?.savedHospitals ?? [] });
});

export const saveHospital = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, {
    $addToSet: { savedHospitals: req.params.hospitalId },
  });
  res.status(201).json({ ok: true });
});

export const unsaveHospital = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, {
    $pull: { savedHospitals: req.params.hospitalId },
  });
  res.json({ ok: true });
});
