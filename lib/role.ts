export type AppRole =
  | "admin"
  | "manager"
  | "trainer"
  | "client"
  | "nutrition_coach"
  | null
  | undefined;

export function getRoleDisplayName(role: AppRole) {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  if (role === "trainer") return "Trainer";
  if (role === "nutrition_coach") return "Nutrition Coach";
  if (role === "client") return "Client";

  return "Unknown";
}

export function isAdmin(role: AppRole) {
  return role === "admin";
}

export function isManager(role: AppRole) {
  return role === "manager";
}

export function isAdminOrManager(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function isTrainer(role: AppRole) {
  return role === "trainer";
}

export function isNutritionCoach(role: AppRole) {
  return role === "nutrition_coach";
}

export function isClient(role: AppRole) {
  return role === "client";
}

export function isStaffRole(role: AppRole) {
  return role === "trainer" || role === "nutrition_coach";
}

/**
 * Page access
 */

export function canViewAdminDashboard(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canViewAdminClientPages(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canViewStaffClientPages(role: AppRole) {
  return role === "trainer" || role === "nutrition_coach";
}

export function canAccessScanner(role: AppRole) {
  return role === "admin" || role === "trainer" || role === "nutrition_coach";
}

export function canViewSessionHistory(role: AppRole) {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "trainer" ||
    role === "nutrition_coach"
  );
}

export function canViewReports(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canViewDebtPage(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canViewPurchases(role: AppRole) {
  return role === "admin" || role === "manager";
}

/**
 * Client permissions
 */

export function canAddClients(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canEditClientBasicInfo(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canDeleteClients(role: AppRole) {
  return role === "admin";
}

export function canChangeClientStatus(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canAssignSalesPerson(role: AppRole) {
  return role === "admin" || role === "manager";
}

/**
 * Package / session permissions
 */

export function canEditPackages(role: AppRole) {
  return role === "admin";
}

export function canRenewPackages(role: AppRole) {
  return role === "admin";
}

export function canManuallySubtractSession(role: AppRole) {
  return role === "admin";
}

export function canScanClientQr(role: AppRole) {
  return role === "admin" || role === "trainer" || role === "nutrition_coach";
}

/**
 * Debt / financial permissions
 */

export function canViewFinancials(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canEditDebt(role: AppRole) {
  return role === "admin";
}

export function canCompleteDebt(role: AppRole) {
  return role === "admin";
}

export function canEditPurchases(role: AppRole) {
  return role === "admin";
}

export function canExportReports(role: AppRole) {
  return role === "admin";
}

export function canImportClients(role: AppRole) {
  return role === "admin";
}

/**
 * Staff permissions
 */

export function canManageStaff(role: AppRole) {
  return role === "admin";
}

export function canViewStaff(role: AppRole) {
  return role === "admin" || role === "manager";
}

/**
 * Notes permissions
 */

export function canViewClientNotes(role: AppRole) {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "trainer" ||
    role === "nutrition_coach"
  );
}

export function canAddClientNotes(role: AppRole) {
  return role === "admin" || role === "trainer" || role === "nutrition_coach";
}

export function canEditClientNotes(role: AppRole) {
  return role === "admin" || role === "trainer" || role === "nutrition_coach";
}

/**
 * Redirect helpers
 */

export function getDefaultRedirectPath(role: AppRole) {
  if (role === "admin") return "/admin";
  if (role === "manager") return "/admin";
  if (role === "trainer") return "/trainer/scan";
  if (role === "nutrition_coach") return "/trainer/scan";
  if (role === "client") return "/client";

  return "/login";
}