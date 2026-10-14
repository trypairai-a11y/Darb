"use client";
// Revision 24 (#8): "it should be visible and adjusted in the Shift planning".
// Ops › Shift planning carries two kinds now: the regular roster, and private
// shifts. The choice is a query param (?kind=private), like every other
// subtab, so a link straight to private shifts works.
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";
import PrivateShiftsPanel from "./PrivateShiftsPanel";

export default function ShiftPlanningKinds({ regular }: { regular: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const { hasRole } = useRole();
  const kind = params.get("kind") === "private" ? "private" : "regular";

  function choose(next: "regular" | "private") {
    const q = new URLSearchParams(params.toString());
    if (next === "private") q.set("kind", "private");
    else q.delete("kind");
    router.replace(`?${q.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit" data-testid="shift-planning-kinds">
        {(["regular", "private"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => choose(k)}
            className={cn(
              "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
              kind === k ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
            )}
          >
            {t(k === "regular" ? "privateShifts.kindRegular" : "privateShifts.kindPrivate")}
          </button>
        ))}
      </div>
      {kind === "private" ? <PrivateShiftsPanel mode="staff" canPlan={hasRole("OPS_MANAGER")} /> : regular}
    </div>
  );
}
