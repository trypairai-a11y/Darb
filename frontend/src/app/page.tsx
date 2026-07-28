"use client";
// Where a signed-in user lands. This used to send everyone to "/decisions", a
// route that does not exist in this app; the only reason nobody hit the 404 is
// that middleware.ts intercepted "/" for the known handles first. It routes by
// role now, and the darb-hq handle falls through to here rather than
// hardcoding the cockpit.
//
// The table lives in lib/roleLanding so this door and the login form cannot
// drift apart. They had: the login form knew about CASH_COLLECTOR and this
// did not, so the same person landed on the cash desk or the ops map depending
// on which way they came in.
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { landingForRole } from "@/lib/roleLanding";

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? landingForRole(user.role) : "/login");
    }
  }, [user, loading, router]);

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
