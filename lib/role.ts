export type AppRole =
  | "admin"
  | "manager"
  | "trainer"
  | "client"
  | "nutrition_coach";

export function normalizeRole(role: string | null | undefined): AppRole | null {
  if (
    role === "admin" ||
    role === "manager" ||
    role === "trainer" ||
    role === "client" ||
    role === "nutrition_coach"
  ) {
    return role;
  }

  return null;
}

export function getRoleDisplayName(role: string | null | undefined): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "manager":
      return "Manager";
    case "trainer":
      return "Trainer";
    case "nutrition_coach":
      return "Nutrition Coach";
    case "client":
      return "Client";
    default:
      return "Unknown";
  }
}

export function getDashboardPathForRole(role: string | null | undefined): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "manager":
      return "/admin";
    case "trainer":
      return "/trainer/scan";
    case "nutrition_coach":
      return "/trainer/scan";
    case "client":
      return "/client";
    default:
      return "/login";
  }
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

export function isManager(role: string | null | undefined): boolean {
  return role === "manager";
}

export function isAdminOrManager(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager";
}

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "trainer" || role === "nutrition_coach";
}

export function canViewAdminDashboard(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager";
}

export function canViewFinancials(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager";
}

export function canEditClientBasicInfo(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager";
}

export function canDeleteClients(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canManageStaff(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canChangeRoles(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canEditPurchases(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canEditDebt(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canEditPackages(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canEditSessionCounts(role: string | null | undefined): boolean {
  return role === "admin";
}