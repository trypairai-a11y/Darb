"use client";
import { useAuth } from "@/contexts/AuthContext";

// Darb 2.0 — VENDOR and FLEET are portal roles, deliberately OUTSIDE the
// staff hierarchy: they are valid UserRoles but never appear in ROLE_ORDER,
// so hasRole() always returns false for them and every minRole-gated
// surface stays hidden from them.
export type UserRole = "ADMIN" | "OPS_MANAGER" | "SUPERVISOR" | "ACCOUNTANT" | "VIEWER" | "VENDOR" | "FLEET";

/** Role hierarchy: higher index = less permissions. VENDOR and FLEET intentionally absent. */
const ROLE_ORDER: UserRole[] = ["ADMIN", "OPS_MANAGER", "SUPERVISOR", "ACCOUNTANT", "VIEWER"];

/**
 * Returns helpers for checking the current user's role and permissions.
 */
export function useRole() {
  const { user } = useAuth();
  const role = (user?.role as UserRole) ?? "VIEWER";

  /**
   * Returns true if the current user has AT LEAST the given role
   * (i.e., their role is equal to or higher privilege than the required role).
   * Always false for VENDOR and FLEET — portal roles sit outside the staff
   * hierarchy.
   */
  function hasRole(required: UserRole): boolean {
    const userIdx = ROLE_ORDER.indexOf(role);
    const reqIdx = ROLE_ORDER.indexOf(required);
    return userIdx !== -1 && reqIdx !== -1 && userIdx <= reqIdx;
  }

  /**
   * Returns true if the current user has EXACTLY one of the given roles.
   */
  function isRole(...roles: UserRole[]): boolean {
    return roles.includes(role);
  }

  return {
    role,
    hasRole,
    isRole,
    isAdmin: role === "ADMIN",
    isOpsManager: isRole("ADMIN", "OPS_MANAGER"),
    isSupervisor: isRole("ADMIN", "OPS_MANAGER", "SUPERVISOR"),
    isVendor: role === "VENDOR",
    vendorId: user?.vendorId ?? null,
    isFleet: role === "FLEET",
    fleetPartnerId: user?.fleetPartnerId ?? null,
    canEdit: hasRole("SUPERVISOR"),       // SUPERVISOR and above can edit
    canDelete: hasRole("OPS_MANAGER"),    // OPS_MANAGER and above can delete
    canManageSettings: hasRole("OPS_MANAGER"), // OPS_MANAGER and above can change settings
    canViewFinancials: hasRole("ACCOUNTANT"), // ACCOUNTANT and above can see cash/financials
  };
}
