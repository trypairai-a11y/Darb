"use client";
// Revision 20 — /admin: the Admin tab.
//
// "tab 4/ admin: should have access to all tabs. subtab 1/ dashboard +
// forecast, subtab 2/ prices settings, subtab 3/ accounts access".
//
// The first clause needs no code: Ops, Compliance and Finance are all gated at
// or below ADMIN, and `requireSurface` never gates an ADMIN at all, so an admin
// already reaches every tab. What this route adds is the three screens that are
// the admin's own.
//
// Only the dashboard is new. Prices is /pricing and Access is /settings, both
// of which exist, work, and are linked to from elsewhere — so they stay at
// their own URLs and carry this same strip, exactly as the Ops subtabs do.
//
// Note the route name. /admin already had two super-admin children (billing and
// tenant onboarding) and no page of its own, so this fills the gap rather than
// taking a name off anything.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Coins, ShieldCheck, Store, Truck } from "lucide-react";
import HqTabs from "@/components/hq/HqTabs";
import AdminDashboardTab from "@/components/hq/AdminDashboardTab";
import { ADMIN_TABS } from "@/lib/hqTabs";
import { fleetsApi, unwrapList } from "@/lib/darbApi";
import type { FleetProfile } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { useRole } from "@/hooks/useRole";

/**
 * The two sides of the price question, as one card each.
 *
 * Kept on the dashboard route rather than duplicated onto /pricing: the Prices
 * subtab IS /pricing, which already owns the merchant half in full. What was
 * missing was any statement that the other half — what Darb PAYS a delivery
 * company — is also a price, set somewhere else. That is what this says, and
 * the link takes you there.
 */
function PriceSummary() {
  const { t } = useI18n();
  const fleetsQuery = useQuery({
    queryKey: ["darb", "fleets", "rates"],
    queryFn: () => fleetsApi.list({ limit: 100 }),
  });
  const fleets = unwrapList<FleetProfile>(fleetsQuery.data);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Link
        href="/pricing"
        className="group bg-card border border-sand-200 rounded-2xl p-5 shadow-soft transition-all duration-400 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px]"
      >
        <div className="h-10 w-10 rounded-pill bg-sand-100 flex items-center justify-center text-sand-700 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
          <Coins size={18} aria-hidden="true" />
        </div>
        <p className="font-medium text-sand-900 mt-3">{t("adminHub.darbFees")}</p>
        <p className="text-xs text-sand-600 mt-1">{t("adminHub.darbFeesHint")}</p>
      </Link>

      <Link
        href="/fleets"
        className="group bg-card border border-sand-200 rounded-2xl p-5 shadow-soft transition-all duration-400 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px]"
      >
        <div className="h-10 w-10 rounded-pill bg-sand-100 flex items-center justify-center text-sand-700 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
          <Truck size={18} aria-hidden="true" />
        </div>
        <p className="font-medium text-sand-900 mt-3">{t("adminHub.fleetFees")}</p>
        <p className="text-xs text-sand-600 mt-1">{t("adminHub.fleetFeesHint")}</p>
        {fleets.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-sand-100 pt-3">
            {fleets.slice(0, 6).map((fleet) => (
              <li key={fleet.id} className="flex items-center justify-between text-xs">
                <span className="text-sand-700 truncate">{fleet.name}</span>
                <span className="text-sand-900 tabular-nums shrink-0 ms-2">
                  {Number(fleet.flatFeePerOrderKwd ?? 0).toFixed(3)}
                  {fleet.perKmFeeKwd != null
                    ? ` + ${Number(fleet.perKmFeeKwd).toFixed(3)}/km`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Link>
    </div>
  );
}

export default function AdminPage() {
  const { t } = useI18n();
  const { hasRole } = useRole();

  // The rail gates this at ADMIN; this is the in-page mirror for anyone who
  // arrives by URL.
  if (!hasRole("ADMIN")) {
    return (
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center">
        <p className="text-sm text-sand-600">{t("errors.permissionDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("adminHub.title")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("adminHub.subtitle")}</p>
      </div>

      <HqTabs tabs={ADMIN_TABS} />

      <AdminDashboardTab />

      {/* Both price surfaces, named on the tab the owner opens first. */}
      <PriceSummary />

      {/* And the way into the third subtab, for the same reason. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Link
          href="/settings"
          className="group bg-card border border-sand-200 rounded-2xl p-5 shadow-soft transition-all duration-400 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px]"
        >
          <div className="h-10 w-10 rounded-pill bg-sand-100 flex items-center justify-center text-sand-700 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <p className="font-medium text-sand-900 mt-3">{t("adminHub.openPeople")}</p>
          <p className="text-xs text-sand-600 mt-1">{t("adminHub.accessHint")}</p>
        </Link>
        <Link
          href="/vendors"
          className="group bg-card border border-sand-200 rounded-2xl p-5 shadow-soft transition-all duration-400 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px]"
        >
          <div className="h-10 w-10 rounded-pill bg-sand-100 flex items-center justify-center text-sand-700 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
            <Store size={18} aria-hidden="true" />
          </div>
          <p className="font-medium text-sand-900 mt-3">{t("adminHub.openVendors")}</p>
          <p className="text-xs text-sand-600 mt-1">{t("adminHub.accountManagers")}</p>
        </Link>
      </div>
    </div>
  );
}
