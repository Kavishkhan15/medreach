export function canManageHospital(user, hospital) {
  if (!user || !hospital || (hospital.archivedAt && user.role !== "system_admin")) return false;
  if (user.role === "system_admin") return true;
  if (user.role === "provider_admin") return user.hospitalIds?.includes(String(hospital._id)) || false;
  // Existing assignment compatibility only; migration is never automatic.
  return user.role === "hospital_admin" && Array.isArray(hospital.admins)
    && hospital.admins.some((id) => String(id) === String(user.id));
}
