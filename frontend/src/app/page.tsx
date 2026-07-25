"use client";
// Where a signed-in user lands. This used to send everyone to "/decisions", a
// route that does not exist in this app; the only reason nobody hit the 404 is
// that middleware.ts intercepted "/" for the known handles first. It routes by
// role now, and the darb-hq handle falls through to here rather than
// hardcoding the cockpit.
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Ops staff are the daily users, so the live control room is home. An
 * accountant sits below SUPERVISOR in the role hierarchy and would land on a
 * screen their own rail does not list, so they go to Money instead. Portal
 * roles are fenced by PortalGuard anyway; sending them straight there just
 * saves a bounce.
 */
function landingFor(role: string | undefined): string {
  if (role === "VENDOR") return "/vendor";
  if (role === "FLEET") return "/fleet-portal";
  if (role === "ACCOUNTANT") return "/finance";
  return "/ops";
}

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? landingFor(user.role) : "/login");
    }
  }, [user, loading, router]);

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
