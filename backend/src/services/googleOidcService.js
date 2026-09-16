import { createPublicKey } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
let jwksCache = { expiresAt: 0, keys: [] };

export function googleConfigured() {
  return Boolean(env.googleClientId && env.googleClientSecret && env.googleCallbackUrl);
}

export function buildGoogleAuthorizationUrl({ state, nonce }) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({ client_id: env.googleClientId, redirect_uri: env.googleCallbackUrl,
    response_type: "code", scope: "openid email profile", state, nonce, prompt: "select_account" }).toString();
  return url.toString();
}

async function fetchJson(url, options, fetcher) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("google_provider_error");
  return response.json();
}

async function googleKey(kid, fetcher) {
  if (Date.now() >= jwksCache.expiresAt) {
    const data = await fetchJson(JWKS_URL, {}, fetcher);
    jwksCache = { keys: Array.isArray(data.keys) ? data.keys : [], expiresAt: Date.now() + 3600000 };
  }
  const jwk = jwksCache.keys.find((key) => key.kid === kid && key.kty === "RSA" && key.use === "sig");
  if (!jwk) throw new Error("google_identity_invalid");
  return createPublicKey({ key: jwk, format: "jwk" });
}

export async function validateGoogleIdToken(idToken, expectedNonce, fetcher = fetch) {
  if (typeof idToken !== "string" || idToken.length > 10000) throw new Error("google_identity_invalid");
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid || decoded.header.alg !== "RS256") throw new Error("google_identity_invalid");
  const key = await googleKey(decoded.header.kid, fetcher);
  const claims = jwt.verify(idToken, key, { algorithms: ["RS256"], audience: env.googleClientId,
    issuer: ISSUERS, clockTolerance: 5 });
  if (!claims.sub || claims.nonce !== expectedNonce || claims.email_verified !== true || !claims.email) {
    throw new Error("google_identity_invalid");
  }
  return { subject: String(claims.sub), email: String(claims.email).trim().toLowerCase(),
    name: String(claims.name || claims.email.split("@")[0]).slice(0, 120) };
}

export async function exchangeGoogleCode(code, expectedNonce, fetcher = fetch) {
  if (!googleConfigured()) throw new Error("google_not_configured");
  if (typeof code !== "string" || code.length < 4 || code.length > 2048) throw new Error("google_callback_invalid");
  const tokenData = await fetchJson(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.googleClientId, client_secret: env.googleClientSecret,
      redirect_uri: env.googleCallbackUrl, grant_type: "authorization_code" }).toString() }, fetcher);
  if (!tokenData.id_token) throw new Error("google_identity_invalid");
  return validateGoogleIdToken(tokenData.id_token, expectedNonce, fetcher);
}

export function resetGoogleJwksCacheForTests() { jwksCache = { expiresAt: 0, keys: [] }; }
