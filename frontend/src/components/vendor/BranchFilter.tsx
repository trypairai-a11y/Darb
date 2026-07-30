"use client";
// Darb 2.0 — the vendor portal's branch filter. One control, shared by every
// branch-scoped screen through VendorBranchContext: the order board, the
// wallet and Grow all read the same selected branch, so a shop that picks a
// branch on the board keeps it when it walks over to the money.
//
// It used to live inline in the vendor layout as an unlabelled pill row above
// the page title, which read as decoration rather than a filter. It is a
// labelled control now, and the board renders it in its own filter row next to
// the Live / Delivered tabs where a shop looks for it.
import { useQuery } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { cn } from "@/lib/cn";
import { useVendorBranch } from "@/contexts/VendorBranchContext";
import { vendorApi } from "@/lib/darbApi";
import { useRole } from "@/hooks/useRole";
import { useI18n } from "@/i18n/I18nProvider";

/**
 * Orders per branch, so each pill can carry its own count.
 *
 * The board already holds every order it fetched, so the counts cost nothing.
 * Screens with no per-branch tally to offer simply pass nothing.
 */
export type BranchCounts = Record<string, number> & { all?: number };

export default function BranchFilter({
  counts,
  className,
}: {
  counts?: BranchCounts;
  className?: string;
}) {
  const { t } = useI18n();
  const { isVendor } = useRole();
  const { branchId, setBranchId, inspectVendorId } = useVendorBranch();

  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    // An inspecting admin is not a VENDOR, but they are reading a merchant's
    // portal and need the same filter the merchant has.
    enabled: isVendor || !!inspectVendorId,
    staleTime: 5 * 60_000,
  });

  const branches = meQuery.data?.branches ?? [];
  // Revision 11 (#5). Whether this login is pinned is the server's call, from
  // the User row, not the token's: a tracker assigned to Mishref after their
  // token was signed was still being drawn the full pill row, and could switch
  // to another branch's orders from it. /api/vendor/me now sends back the pin
  // it fenced the response with, so the control cannot disagree with the data.
  const pinnedBranch = Boolean(meQuery.data?.pinnedBranchId);

  // Revision 9 (#10). A tracker pinned to one branch is sent exactly that
  // branch and no pills render, so the board gave no clue whose orders these
  // were. One branch plus a pinned role is a label, not a choice.
  if (branches.length === 1 && pinnedBranch) {
    return (
      <div className={cn("flex items-center gap-2 text-sm", className)}>
        <span className="text-sand-600">{t("vendorPortal.viewingBranch")}</span>
        <span className="font-medium text-sand-900" dir="auto">
          {branches[0].name}
        </span>
      </div>
    );
  }
  if (branches.length < 2) return null;

  const pill = (active: boolean) =>
    cn(
      "px-3.5 h-8 inline-flex items-center gap-1.5 rounded-pill text-xs font-medium transition-colors duration-250 ease-sierra-out whitespace-nowrap",
      active ? "bg-primary text-white shadow-soft" : "bg-sand-100 text-sand-700 hover:bg-sand-200"
    );

  const count = (key: "all" | string) => {
    const n = key === "all" ? counts?.all : counts?.[key];
    if (n == null) return null;
    return <span className="tabular-nums opacity-70">{n}</span>;
  };

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sand-600">
        <Store size={13} aria-hidden="true" />
        {t("vendorExtra.branchFilter")}
      </span>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={branchId === null}
          onClick={() => setBranchId(null)}
          className={pill(branchId === null)}
        >
          {t("vendorExtra.branchAll")}
          {count("all")}
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
            {count(b.id)}
          </button>
        ))}
      </div>
    </div>
  );
}
