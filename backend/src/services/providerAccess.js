import { ProviderMembership } from "../models/ProviderMembership.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
export const isProviderRole = (role) => ["provider_admin", "hospital_admin"].includes(role);
export async function assignedContext(user) {
  if (user.role !== "provider_admin") return { hospitalIds: [], providerIds: [] };
  const rows = await ProviderMembership.find({ user: user.id, active: true }).lean();
  const hospitalIds = rows.filter((r) => r.kind === "hospital").map((r) => String(r.organization));
  return { hospitalIds: [...new Set(hospitalIds)], providerIds: rows.filter((r) => r.kind !== "hospital").map((r) => String(r.organization)) };
}
export function canManageResource(user, provider) {
  return Boolean(user && provider && (user.role === "system_admin" ||
    (isProviderRole(user.role) && user.providerIds?.includes(String(provider._id)))));
}
export async function findOrganization(kind, id) {
  return kind === "hospital" ? Hospital.findById(id) : ResourceProvider.findOne({ _id: id, kind });
}
