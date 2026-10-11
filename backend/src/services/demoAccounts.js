import mongoose from "mongoose";
import { env } from "../config/env.js";
export const DEMO_PASSWORDS = { system_admin: "Admin@medreach786", provider_admin: "Provider@medreach786" };
export function isolatedDemoEnabled() {
  return ["development", "test"].includes(env.nodeEnv) && !env.emailEnabled
    && ["127.0.0.1", "localhost", "::1"].includes(mongoose.connection.host)
    && /^(medreach_demo(?:_[a-z0-9]+)*|medreach_roles_test)$/.test(mongoose.connection.name || "");
}
export function demoLoginEmail(organization, kind) {
  const name = organization.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 45) || kind.replace(/_/g, "");
  return `admin@${name}-${String(organization._id).slice(-8)}.example`;
}
export async function setDemoPassword(user) {
  if (!isolatedDemoEnabled()) throw Object.assign(new Error("Demo provisioning is unavailable"), { status: 403 });
  await user.setPassword(DEMO_PASSWORDS[user.role]);
  user.demoAccount = true;
  user.credentialState = "demo_default";
  user.emailVerifiedAt = new Date();
}
export function credentialLabel(user) {
  if (!isolatedDemoEnabled() || !user.demoAccount) return user.credentialState === "custom" ? "Custom password set" : "Password status unknown";
  return user.credentialState === "demo_default" ? `Demo default: ${DEMO_PASSWORDS[user.role]}`
    : user.credentialState === "custom" ? "Custom password set" : "Password status unknown";
}
