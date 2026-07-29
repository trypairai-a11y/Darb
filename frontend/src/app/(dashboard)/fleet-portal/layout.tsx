"use client";
// Darb 2.0 — fleet portal layout. Its only job is admin inspection, the mirror
// of what the vendor layout does.
//
// PortalGuard has always said admins may inspect either portal, but /api/fleet
// answered rbac("FLEET") with a 403, which tripped the client's error
// interceptor and bounced the admin to /login. So the link did not merely fail,
// it looked like being signed out. The server admits admins now on an explicit
// ?fleetPartnerId (middleware/fleetScope), GET only; this hands that id to
// darbApi so every /api/fleet/* call carries it.
//
// There are no write controls to hide here: the fleet portal is roster,
// scorecard and payouts, all read-only for the partner too.
import { ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { fleetApi } from "@/lib/darbApi";
import { useI18n } from "@/i18n/I18nProvider";

export default function FleetPortalLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [inspectId, setInspectId] = useState<string | null>(null);

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
      {children}
    </div>
  );
}
