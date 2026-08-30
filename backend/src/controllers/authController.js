import { User } from "../models/User.js";
import { signToken } from "../utils/token.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";

function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export const register = asyncHandler(async (req, res) => {
  const { email, password, name, region, emergencyContact } = req.body;
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ error: "Email already registered" });

  const user = new User({ email, name, region, emergencyContact, role: "user" });
  await user.setPassword(password);
  await user.save();

  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(201).json({ user, token });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user, token });
});

export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate("savedHospitals", "name slug city emergencyStatus");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});
