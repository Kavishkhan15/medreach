import { isolatedDemoEnabled, localManualCredentialsEnabled } from "./demoAccounts.js";
import mongoose from "mongoose";
import { ProviderMembership, PROVIDER_KINDS } from "../models/ProviderMembership.js";
import { User } from "../models/User.js";
import { organizationIsAvailable } from "./providerLifecycle.js";
const fail = () => Object.assign(new Error("Organisation permission denied"), { status: 403, code: "ORGANIZATION_FORBIDDEN" });
export async function assertProviderPermission({ actor, kind, organizationId, permission = "inventory:read" }) {
  if (!PROVIDER_KINDS.includes(kind) || !mongoose.isObjectIdOrHexString(organizationId) || !mongoose.isObjectIdOrHexString(actor?.id)) throw fail();
  const user = await User.findOne({ _id: actor.id, role: "provider_admin", accountStatus: "active" }).select("_id demoAccount credentialDelivery +authVersion").lean();
  if (!user || (user.demoAccount && !isolatedDemoEnabled()) || (user.credentialDelivery === "manual" && !localManualCredentialsEnabled())) throw fail();
  const membership = user && await ProviderMembership.findOne({ user: user._id, kind, organization: organizationId, active: true }).lean();
  const permissions = { admin: ["inventory:read", "inventory:write", "credentials:manage"], inventory_reporter: ["inventory:read", "inventory:write"], reviewer: ["inventory:read"] };
  if (!membership || !permissions[membership.accessLevel || "admin"]?.includes(permission) || !await organizationIsAvailable(kind, organizationId)) throw fail();
  return { user, membership };
}
