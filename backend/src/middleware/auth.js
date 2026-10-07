import { verifyToken } from "../utils/token.js";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { AuthToken } from "../models/AuthToken.js";

function presentedToken(req) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  return req.cookies?.token ?? bearer;
}

async function resolveAccessContext(token) {
  const payload = verifyToken(token);
  if (payload.typ !== "access") throw new Error("wrong_token_type");
  if (typeof payload.sid !== "string" || !payload.sid) return { error: "Session is no longer valid" };
  if (mongoose.connection.readyState !== 1) {
    return { error: "Authentication temporarily unavailable", status: 503 };
  }
  const [current, session] = await Promise.all([
    User.findById(payload.sub).select("+authVersion").lean(),
    AuthToken.exists({ familyId: payload.sid, user: payload.sub,
      purpose: "refresh_session", usedAt: { $exists: false }, revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() } }),
  ]);
  if (!current || current.accountStatus !== "active" || Number(current.authVersion || 0) !== Number(payload.av || 0)) {
    return { error: "Session is no longer valid" };
  }
  if (!session) {
    return { error: "Session is no longer valid" };
  }
  return {
    user: { id: payload.sub, role: current.role,
      email: current.email, name: current.name },
    claims: payload,
  };
}

// Reads JWT from httpOnly cookie (preferred) or Authorization: Bearer header.
export async function requireAuth(req, res, next) {
  const token = presentedToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const context = await resolveAccessContext(token);
    if (context.error) return res.status(context.status || 401).json({ error: context.error });
    req.user = context.user;
    req.accessClaims = context.claims;
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

// Optional Auth — permits no token, but a presented token must be fully valid.
export async function optionalAuth(req, res, next) {
  const token = presentedToken(req);
  if (!token) return next();
  try {
    const context = await resolveAccessContext(token);
    if (context.error) return res.status(context.status || 401).json({ error: context.error });
    req.user = context.user;
    req.accessClaims = context.claims;
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  next();
}
