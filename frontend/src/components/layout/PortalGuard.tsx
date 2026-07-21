"use client";
// Darb 2.0 — client-side portal fencing (Slice B, wave 1; generalized for
// the fleet portal in the PRD build). Mounted once in the (dashboard) layout:
//   - VENDOR users may only browse /vendor/*; anything else bounces to /vendor.
//   - FLEET users may only browse /fleet-portal/*; anything else bounces
//     to /fleet-portal.
//   - Non-portal users hitting a portal bounce to "/" — except ADMIN, who
//     may inspect either portal.
// This is UX fencing only; the backend enforces the real containment
// (blockVendorOutsideAllowlist middleware and the fleet-portal scope).
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

/** Portal roles and the path prefix each one is fenced into. */
const PORTALS: { role: string; home: string }[] = [
  { role: "VENDOR", home: "/vendor" },
  { role: "FLEET", home: "/fleet-portal" },
];

export default function PortalGuard() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user || !pathname) return;
    const inPortal = (home: string) => pathname === home || pathname.startsWith(`${home}/`);

    const own = PORTALS.find((p) => p.role === user.role);
    if (own) {
      // Portal users are fenced INTO their own portal.
      if (!inPortal(own.home)) router.replace(own.home);
      return;
    }
    // Staff hitting a portal bounce to "/" — except ADMIN, who may inspect.
    if (user.role !== "ADMIN" && PORTALS.some((p) => inPortal(p.home))) {
      router.replace("/");
    }
  }, [user, pathname, router]);

  return null;
}
