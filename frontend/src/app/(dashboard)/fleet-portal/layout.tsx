"use client";
// Darb 2.0 — fleet portal layout. Two jobs, both about who is looking.
//
// 1. Admin inspection, the mirror of what the vendor layout does. PortalGuard
//    has always said admins may inspect either portal, but /api/fleet answered
//    rbac("FLEET") with a 403, which tripped the client's error interceptor and
//    bounced the admin to /login. So the link did not merely fail, it looked
//    like being signed out. The server admits admins now on an explicit
//    ?fleetPartnerId (middleware/fleetScope), GET only; this hands that id to
//    darbApi so every /api/fleet/* call carries it.
//
// 2. Revision 13 (#6) — the route fence. A delivery company's logins have roles
//    and a tab list now, and hiding a rail entry is not enough on its own: a
//    bookmark, a notification link or a typed URL still lands, and the API
//    answers with a 403 the screen would show as "Request failed with status
//    code 403". A refused tab gets the same plain access page the merchant
//    portal has had since revision 9.
import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import AccessRestricted from "@/components/vendor/AccessRestricted";
import { fleetApi } from "@/lib/darbApi";
import { fleetRoleDefaultTabs, fleetTabForPath } from "@/lib/fleetTabs";
import { useDeniedFleetTabs } from "@/lib/fleetAccess";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";

/** True when this login may not open the screen it is currently on. */
function useFleetRestricted(): boolean {
  const { user } = useAuth();
  const pathname = usePathname();
  // Whatever the list below believes, a tab the server has already refused this
  // session is refused: the 403 happened, so the list is the thing that is wrong.
  const deniedTabs = useDeniedFleetTabs();

  const meQuery = useQuery({
    queryKey: ["darb", "fleet", "me"],
    queryFn: () => fleetApi.me(),
    enabled: user?.role === "FLEET",
    staleTime: 60_000,
  });

  if (!user || user.role !== "FLEET" || !pathname) return false;
  const tab = fleetTabForPath(pathname);
  if (!tab) return false;
  if (deniedTabs.includes(tab)) return true;
  // Nothing is restricted until we know the answer: flashing "access
  // restricted" at somebody who does have access is worse than a beat of the
  // real screen.
  if (meQuery.isLoading) return false;
  const tabs = meQuery.data?.portalTabs ?? fleetRoleDefaultTabs(meQuery.data?.portalRole);
  return !tabs.includes(tab);
}

export default function FleetPortalLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [inspectId, setInspectId] = useState<string | null>(null);
  const restricted = useFleetRestricted();

  // Only the banner needs this in React. Scoping the requests themselves is
  // darbApi's job, and it reads the same URL at request time, so there is no
  // ordering to get wrong.
  useEffect(() => {
    setInspectId(new URLSearchParams(window.location.search).get("fleetPartnerId"));
  }, []);

  const meQuery = useQuery({
    queryKey: ["darb", "fleet", "me"],
    queryFn: () => fleetApi.me(),
    enabled: !!inspectId,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-4">
      {inspectId && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
          <Eye size={16} className="shrink-0" aria-hidden="true" />
          <span dir="auto">
            {t("vendorPortal.inspecting").replace("{vendor}", meQuery.data?.name ?? "")}
          </span>
        </div>
      )}
      {restricted ? <AccessRestricted /> : children}
    </div>
  );
}
