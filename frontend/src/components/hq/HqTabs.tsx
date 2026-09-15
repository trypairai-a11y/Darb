"use client";
// Revision 20 — the subtab strip under an HQ tab's title.
//
// Links rather than buttons, deliberately. Half the subtabs are routes of their
// own (Orders, Equipment, Areas, Prices, Access) and half are query params, and
// a strip built out of onClick handlers could only ever drive the second kind.
// A link drives both, and it also means middle-click and "open in new tab" work
// on a strip an ops team lives in all day.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { activeHqTab, type HqTab } from "@/lib/hqTabs";

export default function HqTabs({
  tabs,
  /** Counts to badge a tab with, keyed by tab key. Zero and undefined draw nothing. */
  counts,
}: {
  tabs: HqTab[];
  counts?: Record<string, number | undefined>;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = activeHqTab(tabs, pathname ?? "", searchParams.get("tab"));

  return (
    <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit max-w-full flex-wrap">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const count = counts?.[tab.key];
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "px-4 h-9 inline-flex items-center gap-2 text-sm font-medium rounded-pill transition-colors",
              isActive
                ? "bg-white text-sand-900 shadow-soft"
                : "text-sand-600 hover:text-sand-900",
            )}
          >
            {t(tab.i18n)}
            {count ? (
              <span
                className={cn(
                  "min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-pill text-[11px] font-semibold",
                  isActive ? "bg-primary/10 text-primary" : "bg-sand-200 text-sand-700",
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
