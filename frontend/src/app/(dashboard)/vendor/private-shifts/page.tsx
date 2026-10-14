"use client";
// Revision 24 (#9) — the shop's own private shifts.
//
// "The vendor can open a private shift for himself, which will dispatch the
// driver to this vendor's orders only for the whole shift. The vendor would be
// paying a per-hour fee according to the delivery plan."
//
// Planning is for the roles that place orders (owner, manager, supervisor);
// everybody on the Orders tab can see the shifts and what they cost.
import { useQuery } from "@tanstack/react-query";
import PrivateShiftsPanel from "@/components/privateShifts/PrivateShiftsPanel";
import { vendorApi } from "@/lib/darbApi";

const PLANNERS = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];

export default function VendorPrivateShiftsPage() {
  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    staleTime: 60_000,
  });
  const role = meQuery.data?.portalRole ?? null;
  // An inspecting admin reads, and the server refuses their writes anyway.
  const canPlan = !!role && PLANNERS.includes(role);
  return <PrivateShiftsPanel mode="vendor" canPlan={canPlan} />;
}
