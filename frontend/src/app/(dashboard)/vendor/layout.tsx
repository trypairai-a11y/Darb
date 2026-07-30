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
 * Keeps a portal role out of the screens it cannot open.
 *
 * Hiding the rail entry is not enough on its own: a bookmark, a notification
 * link or a typed URL still lands, and the API answers with a 403 the screen
 * shows as "Request failed with status code 403". The rules are the shop's own
 * roles: an accountant has no reason to change shop settings, and a tracker
 * has no reason to see money at all.
 */
const FORBIDDEN: Record<string, string[]> = {
  FINANCE: ["/vendor/settings", "/vendor/team"],
  ORDER_TRACKING: ["/vendor/wallet", "/vendor/settings", "/vendor/grow", "/vendor/team"],
};

/**
 * True when this login may not open the screen it is currently on.
 *
 * Revision 9 (#9, #11): this used to redirect to /vendor, which left the user
 * wondering whether they had mis-clicked, and the API's 403 rendered as
 * "Something went wrong" with a Try again button that could never work. The
 * page now says plainly that access is restricted and stays put.
 */
function useRestricted(): boolean {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user || user.role !== "VENDOR" || !pathname) return false;
  const blocked = FORBIDDEN[user.vendorRole ?? "OWNER"] ?? [];
  return blocked.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
