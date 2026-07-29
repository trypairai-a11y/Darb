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
const PORTALS: {
  role: string;
  home: string;
  alsoAllow?: string[];
  /** Query param that names the account an admin is inspecting. */
  inspectParam?: string;
  /** Where to send an admin who named none. */
  pick?: string;
}[] = [
  // `pick` is where an admin goes when they ask for a portal without saying
  // whose. Inspection needs a named account (?vendorId / ?fleetPartnerId); with
  // none, the API refuses and the screen used to show a bare
  // "Request failed with status code 403". The staff list is the answer to the
  // question they actually asked, and it carries a View their portal link.
  { role: "VENDOR", home: "/vendor", inspectParam: "vendorId", pick: "/vendors" },
  { role: "FLEET", home: "/fleet-portal", inspectParam: "fleetPartnerId", pick: "/fleets" },
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
    if (user.role === "ADMIN") {
      // An admin may inspect a portal, but only a named one. Without the id
      // every request 403s, so send them to the list to choose instead of
      // leaving them on an error screen.
      const portal = PORTALS.find((p) => inPortal(p.home) && p.pick);
      if (portal && !new URLSearchParams(window.location.search).get(portal.inspectParam!)) {
        router.replace(portal.pick!);
      }
      return;
    }
    // Every other staff role bounces out of a portal entirely, except one a
    // portal explicitly admits.
    if (PORTALS.some((p) => inPortal(p.home) && !p.alsoAllow?.includes(user.role))) {
      router.replace("/");
    }
  }, [user, pathname, router]);

  return null;
}
