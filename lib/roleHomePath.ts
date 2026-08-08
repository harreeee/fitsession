import type { UserRole } from "./checkUserRole";

export function getHomePathForRole(
  role: UserRole | string | null | undefined,
) {
  switch (role) {
    case "admin":
    case "manager":
      return "/admin";

    case "marketing_manager":
      return "/admin/marketing";

    case "trainer":
    case "nutrition_coach":
      return "/trainer/scan";

    case "client":
      return "/client";

    default:
      return "/login";
  }
}