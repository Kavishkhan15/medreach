import { verifyToken } from "../utils/token.js";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { AuthToken } from "../models/AuthToken.js";

// Reads JWT from httpOnly cookie (preferred) or Authorization: Bearer header.
export async function requireAuth(req, res, next) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.token ?? bearer;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const payload = verifyToken(token);
    if (payload.typ !== "access") throw new Error("wrong_token_type");
    let current = null;
    // The listening server only starts after Mongo connects. The disconnected
    // path preserves pure middleware tests without weakening a running app.
    if (mongoose.connection.readyState === 1) {
      current = await User.findById(payload.sub).select("+authVersion").lean();
      if (!current || current.accountStatus !== "active" || Number(current.authVersion || 0) !== Number(payload.av || 0)) {
        return res.status(401).json({ error: "Session is no longer valid" });
      }
      if (payload.sid && !(await AuthToken.exists({ familyId: payload.sid, user: current._id,
        purpose: "refresh_session", usedAt: { $exists: false }, revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() } }))) {
        return res.status(401).json({ error: "Session is no longer valid" });
      }
    }
    req.user = { id: payload.sub, role: current?.role || payload.role,
      email: current?.email || payload.email, name: current?.name || payload.name };
    req.accessClaims = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// RBAC — usage: router.post("/", requireAuth, requireRole("admin"), handler)
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// Optional Auth — parses token if present, sets req.user if valid, never rejects unauthenticated requests
export async function optionalAuth(req, res, next) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.token ?? bearer;
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    if (payload.typ === "access") {
      let current = null;
      if (mongoose.connection.readyState === 1) {
        current = await User.findById(payload.sub).select("+authVersion").lean();
        if (current && current.accountStatus === "active" && Number(current.authVersion || 0) === Number(payload.av || 0)) {
          req.user = { id: payload.sub, role: current.role || payload.role,
            email: current.email || payload.email, name: current.name || payload.name };
          req.accessClaims = payload;
        }
      } else {
        req.user = { id: payload.sub, role: payload.role,
          email: payload.email, name: payload.name };
        req.accessClaims = payload;
      }
    }
  } catch {
    // Guest access continues cleanly
  }
  next();
}
