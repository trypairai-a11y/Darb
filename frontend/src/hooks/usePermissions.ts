"use client";
// Revision 20 — read the caller's own per-surface access.
//
// `/api/auth/me` has returned this map since revision 4 (#12) and nothing on
// the client read it: the rail gated on role alone, so granting a VIEWER the
// compliance desk worked on every endpoint and showed up on no screen. This
// hook is the client half of that contract.
//
// It is NOT the authority. `requireSurface` on the server is, and it is checked
// on every request. This exists so a refused screen says a sentence instead of
// rendering three panels that 403 one at a time.
import { useAuth } from "@/contexts/AuthContext";

export type PermissionLevel = "NONE" | "VIEW" | "EDIT";

const RANK: Record<PermissionLevel, number> = { NONE: 0, VIEW: 1, EDIT: 2 };

export function usePermissions() {
  const { user, loading } = useAuth();
  const map = user?.permissions;

  /**
   * Does this person reach `surface` at least at `required`?
   *
   * ADMIN is never gated, mirroring the server: an admin who set their own
   * access to NONE must not lose the endpoint that would undo it.
   *
   * A missing map reads as allowed. That is deliberate and it matches the
   * server's own posture of "absence means inherit": the map only arrives with
   * /me, so during the first paint, on a mock user, or on an older session
   * there is no map, and refusing then would blank a screen the person can in
   * fact open. The endpoint behind it still enforces the real answer.
   */
  function can(surface: string, required: Exclude<PermissionLevel, "NONE"> = "VIEW"): boolean {
    if (user?.role === "ADMIN") return true;
    if (!map) return true;
    const level = map[surface];
    if (!level) return true;
    return RANK[level] >= RANK[required];
  }

  return { can, permissions: map, isLoading: loading };
}
