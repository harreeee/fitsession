export type AppRole =
  | "admin"
  | "manager"
  | "trainer"
  | "client"
  | "nutrition_coach";

export type AppRoleValue = AppRole | null | undefined;

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

export function getRoleDisplayName(role: AppRoleValue): string {
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

export function getDashboardPathForRole(role: AppRoleValue): string {
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

export function getDefaultRedirectPath(role: AppRoleValue): string {
  return getDashboardPathForRole(role);
}

/**
 * Basic role checks
 */

export function isAdmin(role: AppRoleValue): boolean {
  return role === "admin";
}

export function isManager(role: AppRoleValue): boolean {
  return role === "manager";
}

export function isAdminOrManager(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

export function isTrainer(role: AppRoleValue): boolean {
  return role === "trainer";
}

export function isNutritionCoach(role: AppRoleValue): boolean {
  return role === "nutrition_coach";
}

export function isClient(role: AppRoleValue): boolean {
  return role === "client";
}

export function isStaffRole(role: AppRoleValue): boolean {
  return role === "trainer" || role === "nutrition_coach";
}

export function isInternalRole(role: AppRoleValue): boolean {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "trainer" ||
    role === "nutrition_coach"
  );
}

/**
 * Page access
 */

export function canViewAdminDashboard(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

export function canViewAdminClientPages(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

/**
 * This is for /trainer/clients and /trainer/clients/[id].
 * Trainer and Nutrition Coach should use this client management page.
 * Admin and Manager can also view it if they click Staff View.
 */
export function canViewStaffClientPages(role: AppRoleValue): boolean {
  return (
    role === "trainer" ||
    role === "nutrition_coach" ||
    role === "admin" ||
    role === "manager"
  );
}

export function canAccessScanner(role: AppRoleValue): boolean {
  return role === "admin" || role === "trainer" || role === "nutrition_coach";
}

export function canScanClientQr(role: AppRoleValue): boolean {
  return role === "admin" || role === "trainer" || role === "nutrition_coach";
}

export function canViewSessionHistory(role: AppRoleValue): boolean {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "trainer" ||
    role === "nutrition_coach"
  );
}

export function canViewReports(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

export function canViewDebtPage(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

export function canViewPurchases(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

export function canViewFinancials(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

/**
 * Client permissions
 */

export function canAddClients(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

export function canEditClientBasicInfo(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

export function canChangeClientStatus(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

export function canAssignSalesPerson(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

export function canDeleteClients(role: AppRoleValue): boolean {
  return role === "admin";
}

/**
 * Trainer / Nutrition Coach client permissions
 */

export function canViewClientListAsStaff(role: AppRoleValue): boolean {
  return (
    role === "trainer" ||
    role === "nutrition_coach" ||
    role === "admin" ||
    role === "manager"
  );
}

export function canViewClientDetailAsStaff(role: AppRoleValue): boolean {
  return (
    role === "trainer" ||
    role === "nutrition_coach" ||
    role === "admin" ||
    role === "manager"
  );
}

/**
 * Staff permissions
 */

export function canManageStaff(role: AppRoleValue): boolean {
  return role === "admin";
}

export function canAddStaff(role: AppRoleValue): boolean {
  return role === "admin";
}

export function canRemoveStaff(role: AppRoleValue): boolean {
  return role === "admin";
}

export function canViewStaff(role: AppRoleValue): boolean {
  return role === "admin" || role === "manager";
}

export function canChangeRoles(role: AppRoleValue): boolean {
  return role === "admin";
}

/**
 * Package / session permissions
 */

export function canEditPackages(role: AppRoleValue): boolean {
  return role === "admin";
}

export function canRenewPackages(role: AppRoleValue): boolean {
  return role === "admin";
}

export function canEditSessionCounts(role: AppRoleValue): boolean {
  return role === "admin";
}

export function canManuallySubtractSession(role: AppRoleValue): boolean {
  return role === "admin";
}

/**
 * Purchase / debt / report permissions
 */

export function canEditPurchases(role: AppRoleValue): boolean {
  return role === "admin";
}

export function canEditDebt(role: AppRoleValue): boolean {
  return role === "admin";
}

export function canCompleteDebt(role: AppRoleValue): boolean {
  return role === "admin";
}

export function canExportReports(role: AppRoleValue): boolean {
  return role === "admin";
}

export function canImportClients(role: AppRoleValue): boolean {
  return role === "admin";
}

/**
 * Notes permissions
 */

export function canViewClientNotes(role: AppRoleValue): boolean {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "trainer" ||
    role === "nutrition_coach"
  );
}

export function canAddClientNotes(role: AppRoleValue): boolean {
  return role === "admin" || role === "trainer" || role === "nutrition_coach";
}

export function canEditClientNotes(role: AppRoleValue): boolean {
  return role === "admin" || role === "trainer" || role === "nutrition_coach";
}