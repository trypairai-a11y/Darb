"use client";
// Phase 2 Wave 5 — Client-side guard for super-admin routes.
//
// Server-side enforcement lives in middleware/superAdmin.ts (every
// /api/admin/* call goes through it). The frontend guard is a graceful
// 403 — no flicker, no auto-redirect (per UI-SPEC §3.4.1 Q3 default —
// non-admins land on a friendly placeholder, not a redirect to the inbox).
//
// Reads `isSuperAdmin` from useAuth().user. Wave 5 also enriches
// /api/auth/me to surface the flag (backend/src/routes/auth.ts).

import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface SuperAdminGuardProps {
  children: React.ReactNode;
}

export function SuperAdminGuard({ children }: SuperAdminGuardProps) {
  const { user, loading } = useAuth();
  const isSuperAdmin = Boolean(
    (user as { isSuperAdmin?: boolean } | null)?.isSuperAdmin,
  );

  if (loading) {
    return (
      <div className="py-16 text-center text-sand-600 text-sm">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-16 text-center space-y-3">
        <ShieldOff size={28} className="mx-auto text-sand-400" />
        <p className="text-sm font-medium text-slate-900">
          Sign in to continue
        </p>
        <Link
          href="/login"
          className="inline-block text-sm text-primary hover:underline"
        >
          Go to sign in →
        </Link>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="py-16 text-center space-y-3 max-w-md mx-auto">
        <ShieldOff size={28} className="mx-auto text-red-400" />
        <p className="text-sm font-semibold text-slate-900">
          403 — Super-admin access required
        </p>
        <p className="text-xs text-sand-600">
          The /admin pages are only accessible to founder accounts. Ask the
          person who set up the workspace if you need access.
        </p>
        <Link
          href="/ops"
          className="inline-block text-sm text-primary hover:underline"
        >
          Back to operations →
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

export default SuperAdminGuard;
