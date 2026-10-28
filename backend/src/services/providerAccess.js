import { ProviderMembership } from "../models/ProviderMembership.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";

export const isProviderRole = (role) => ["provider_admin", "hospital_admin"].includes(role);
export async function assignedContext(user) {
  if (user.role !== "provider_admin") return { hospitalIds: [], providerIds: [] };
  const rows = await ProviderMembership.find({ user: user.id, active: true }).select("kind organization accessLevel").lean();
  // General management IDs exclude restricted staff; dedicated inventory policy checks their exact membership.
  const managementRows = rows.filter(r => !r.accessLevel || r.accessLevel === "admin");
  const [hospitals, providers] = await Promise.all([
    Hospital.find({ _id: { $in: managementRows.filter(r => r.kind === "hospital").map(r => r.organization) }, archivedAt: null }).select("_id").lean(),
    ResourceProvider.find({ _id: { $in: managementRows.filter(r => r.kind !== "hospital").map(r => r.organization) }, archivedAt: null, active: { $ne: false } }).select("_id hospital kind").lean(),
  ]);
  const parentIds = providers.filter(p => p.hospital).map(p => p.hospital);
  const activeParents = new Set((parentIds.length ? await Hospital.find({ _id: { $in: parentIds }, archivedAt: null }).select("_id").lean() : []).map(h => String(h._id)));
  return { hospitalIds: hospitals.map(h => String(h._id)), providerIds: providers.filter(p => (!p.hospital || activeParents.has(String(p.hospital))) && managementRows.some(r => r.kind === p.kind && String(r.organization) === String(p._id))).map(p => String(p._id)) };
}
export function canManageResource(user, provider) {
  return Boolean(user && provider && (user.role === "system_admin" || (!provider.archivedAt &&
    (isProviderRole(user.role) && user.providerIds?.includes(String(provider._id))))));
}
export async function findOrganization(kind, id) {
  return kind === "hospital" ? Hospital.findById(id) : ResourceProvider.findOne({ _id: id, kind });
}

export { assertProviderPermission as assertProviderAccess } from "./providerPermissions.js";
