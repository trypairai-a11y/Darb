"use client";
// Darb 2.0 PRD build — vendor portal layout. Wraps every /vendor/* page in
// the VendorBranchProvider and, when the vendor has 2+ branches, renders a
// compact pill selector sub-header so pages (analytics first) can scope to
// one branch. Single-branch vendors see no extra chrome.
import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { cn } from "@/lib/cn";
import { VendorBranchProvider, useVendorBranch } from "@/contexts/VendorBranchContext";
import { vendorApi } from "@/lib/darbApi";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useI18n } from "@/i18n/I18nProvider";

function BranchPills() {
  const { t } = useI18n();
  const { isVendor } = useRole();
  const { branchId, setBranchId } = useVendorBranch();

  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    enabled: isVendor,
    staleTime: 5 * 60_000,
  });

  const branches = meQuery.data?.branches ?? [];
  if (branches.length < 2) return null;

  const pill = (active: boolean) =>
    cn(
      "px-3.5 h-8 inline-flex items-center rounded-pill text-xs font-medium transition-colors duration-250 ease-sierra-out whitespace-nowrap",
      active
        ? "bg-primary text-white shadow-soft"
        : "bg-sand-100 text-sand-700 hover:bg-sand-200"
    );

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={branchId === null}
        onClick={() => setBranchId(null)}
        className={pill(branchId === null)}
      >
        {t("vendorExtra.branchAll")}
      </button>
      {branches.map((b) => (
        <button
          key={b.id}
          type="button"
          role="tab"
          aria-selected={branchId === b.id}
          onClick={() => setBranchId(b.id)}
          className={pill(branchId === b.id)}
          dir="auto"
        >
          {b.name}
        </button>
      ))}
    </div>
  );
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

function RoleRouteFence() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user || user.role !== "VENDOR" || !pathname) return;
    const blocked = FORBIDDEN[user.vendorRole ?? "OWNER"] ?? [];
    if (blocked.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      router.replace("/vendor");
    }
  }, [user, pathname, router]);

  return null;
}

export default function VendorLayout({ children }: { children: ReactNode }) {
  return (
    <VendorBranchProvider>
      <div className="space-y-4">
        <RoleRouteFence />
        <InspectBanner />
        <BranchPills />
        {children}
      </div>
    </VendorBranchProvider>
  );
}
