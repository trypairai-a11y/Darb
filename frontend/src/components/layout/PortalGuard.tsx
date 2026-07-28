"use client";
// Darb 2.0 — client-side portal fencing (Slice B, wave 1; generalized for
// the fleet portal in the PRD build). Mounted once in the (dashboard) layout:
//   - VENDOR users may only browse /vendor/*; anything else bounces to /vendor.
//   - FLEET users may only browse /fleet-portal/*; anything else bounces
//     to /fleet-portal.
//   - CASH_COLLECTOR users may only browse /cash-desk/*; anything else bounces
//     to /cash-desk (revision 4 #3).
//   - Non-portal users hitting a portal bounce to "/" — except ADMIN, who
//     may inspect either portal.
// This is UX fencing only; the backend enforces the real containment
// (blockVendorOutsideAllowlist, blockFleetOutsideAllowlist and
// blockCashCollectorOutsideAllowlist middleware).
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

/** Portal roles and the path prefix each one is fenced into. */
const PORTALS: { role: string; home: string; alsoAllow?: string[] }[] = [
  { role: "VENDOR", home: "/vendor" },
  { role: "FLEET", home: "/fleet-portal" },
  {
    role: "CASH_COLLECTOR",
    home: "/cash-desk",
    // The cash desk is a dedicated portal, not an exclusive one. Accountants
    // and supervisors have always been able to record a hand-in (the API still
    // lets them), so fencing them out here would break a real end-of-shift
    // workflow to satisfy a rule about someone else's login.
    alsoAllow: ["ACCOUNTANT", "SUPERVISOR", "OPS_MANAGER"],
  },
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
    // Staff hitting a portal bounce to "/" — except ADMIN, who may inspect,
    // and any role a portal explicitly admits.
    if (
      user.role !== "ADMIN" &&
      PORTALS.some((p) => inPortal(p.home) && !p.alsoAllow?.includes(user.role))
    ) {
      router.replace("/");
    }
  }, [user, pathname, router]);

  return null;
}
