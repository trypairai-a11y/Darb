"use client";
// Darb 2.0 PRD build — vendor portal layout. Wraps every /vendor/* page in
// the VendorBranchProvider and, when the vendor has 2+ branches, renders the
// shared BranchFilter as a sub-header so pages can scope to one branch. The
// order board renders that filter itself, so this skips it there.
// Single-branch vendors see no extra chrome.
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { VendorBranchProvider, useVendorBranch } from "@/contexts/VendorBranchContext";
import { vendorApi } from "@/lib/darbApi";
import AccessRestricted from "@/components/vendor/AccessRestricted";
import BranchFilter from "@/components/vendor/BranchFilter";
import { useAuth } from "@/contexts/AuthContext";
import { roleDefaultTabs, tabForPath } from "@/lib/vendorTabs";
import { useI18n } from "@/i18n/I18nProvider";

/**
 * The branch filter, for every vendor screen except the order board.
 *
 * The board renders the same control itself, inside its own filter row beside
 * the Live / Delivered tabs, with a count per branch. Rendering it here as well
 * would put two copies of one filter on that screen.
 */
function LayoutBranchFilter() {
  const pathname = usePathname();
  if (pathname === "/vendor") return null;
  return <BranchFilter />;
}

/**
 * Says whose portal this is when an admin is reading someone else's, and that
 * they can only read it. Without it the screen is indistinguishable from a
 * merchant's own, which is the wrong thing for a surface where an admin might
 * otherwise expect their clicks to land.
 */
function InspectBanner() {
  const { t } = useI18n();
  const { inspectVendorId } = useVendorBranch();

  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    enabled: !!inspectVendorId,
    staleTime: 5 * 60_000,
  });

  if (!inspectVendorId) return null;

  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
      <Eye size={16} className="shrink-0" aria-hidden="true" />
      <span dir="auto">
        {t("vendorPortal.inspecting").replace("{vendor}", meQuery.data?.name ?? "")}
      </span>
    </div>
  );
}

/**
 * True when this login may not open the screen it is currently on.
 *
 * Hiding the rail entry is not enough on its own: a bookmark, a notification
 * link or a typed URL still lands, and the API answers with a 403 the screen
 * shows as "Request failed with status code 403". Revision 9 (#9, #11) turned
 * that into a plain "access restricted" page that stays put rather than
 * bouncing the user to /vendor wondering whether they mis-clicked.
 *
 * Revision 10 (#6) changed what it reads. This was a hard-coded map from
 * vendorRole to blocked paths, which could not express a per-user tab list at
 * all: an owner who narrowed somebody's tabs saw the rail entry stay put and
 * the screen 403 on load. It now asks the server what the caller's tabs are, via
 * the portalTabs field on /api/vendor/me, and falls back to the role's own
 * defaults while that is in flight or on an older server.
 */
function useRestricted(): boolean {
  const { user } = useAuth();
  const pathname = usePathname();

  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    enabled: user?.role === "VENDOR",
    staleTime: 60_000,
  });

  if (!user || user.role !== "VENDOR" || !pathname) return false;
  const tab = tabForPath(pathname);
  if (!tab) return false;
  // Nothing is restricted until we know the answer: flashing "access restricted"
  // at somebody who does have access is worse than a beat of the real screen.
  if (meQuery.isLoading) return false;
  // Revision 11 (#5): the server's role, not the token's. See Sidebar.
  const tabs =
    meQuery.data?.portalTabs ??
    roleDefaultTabs(meQuery.data?.portalRole ?? user.vendorRole ?? "OWNER");
  return !tabs.includes(tab);
}

function VendorBody({ children }: { children: ReactNode }) {
  return useRestricted() ? <AccessRestricted /> : <>{children}</>;
}

export default function VendorLayout({ children }: { children: ReactNode }) {
  return (
    <VendorBranchProvider>
      <div className="space-y-4">
        <InspectBanner />
        <LayoutBranchFilter />
        <VendorBody>{children}</VendorBody>
      </div>
    </VendorBranchProvider>
  );
}
