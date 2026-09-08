export type StaffFeature = "revenue" | "clients" | "booked_calendar";

export type StaffAccessProfile = {
  id: string;
  role: string | null;
  full_name?: string | null;
  can_view_revenue?: boolean | null;
  can_view_clients?: boolean | null;
  can_view_booked_calendar?: boolean | null;
};

export type StaffAccessSnapshot = {
  role: string | null;
  fullName: string | null;
  canViewRevenue: boolean;
  canViewClients: boolean;
  canViewBookedCalendar: boolean;
  canManagePermissions: boolean;
};

export function canUseStaffFeature(
  profile: StaffAccessProfile | null | undefined,
  feature: StaffFeature,
) {
  if (!profile) return false;

  if (profile.role === "admin" || profile.role === "manager") {
    return true;
  }

  if (profile.role !== "trainer" && profile.role !== "nutrition_coach") {
    return false;
  }

  if (feature === "revenue") return profile.can_view_revenue === true;
  if (feature === "clients") return profile.can_view_clients === true;

  return profile.can_view_booked_calendar === true;
}

export function toStaffAccessSnapshot(
  profile: StaffAccessProfile,
): StaffAccessSnapshot {
  return {
    role: profile.role,
    fullName: profile.full_name || null,
    canViewRevenue: canUseStaffFeature(profile, "revenue"),
    canViewClients: canUseStaffFeature(profile, "clients"),
    canViewBookedCalendar: canUseStaffFeature(profile, "booked_calendar"),
    canManagePermissions: profile.role === "admin",
  };
}
