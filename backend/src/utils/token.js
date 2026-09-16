import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signToken(user, sessionId) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, email: user.email, name: user.name,
      av: Number(user.authVersion || 0), typ: "access",
      ...(sessionId ? { sid: String(sessionId) } : {}) },
    env.jwtSecret,
    { expiresIn: env.accessTokenExpires, issuer: "medreach-api", audience: "medreach-web" }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { issuer: "medreach-api", audience: "medreach-web" });
}
