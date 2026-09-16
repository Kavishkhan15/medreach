export function canManageHospital(user, hospital) {
  if (!user || !hospital) return false;
  if (["admin", "system_admin"].includes(user.role)) return true;
  return user.role === "hospital_admin"
    && Array.isArray(hospital.admins)
    && hospital.admins.some((id) => String(id) === String(user.id));
}
