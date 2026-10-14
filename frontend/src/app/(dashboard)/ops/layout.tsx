"use client";
// Darb 2.0 — /ops/* layout. One job: supervisor-and-above only
// (VENDOR/ACCOUNTANT/VIEWER bounce home).
//
// Revision 24 #1 ("please remove the red message, it is annoying") took out
// the IncidentAlertBanner that used to float over every ops surface. An
// emergency is still one click away: the red Emergency tile in the Live rail
// counts every unresolved incident and opens the full console over the map,
// and the Problems segment lists them too.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/hooks/useRole";

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const { hasRole } = useRole();
  const router = useRouter();

  const allowed = hasRole("SUPERVISOR");

  useEffect(() => {
    if (!allowed) router.replace("/");
  }, [allowed, router]);

  if (!allowed) return null;

  return <>{children}</>;
}
