"use client";
// Darb 2.0 — /vendor/analytics: the merchant Grow screen.
//
// Revision #31 applied the same cut to the merchant portal that the staff rail
// got. Analytics and Campaigns were two rail entries answering one question,
// "how do I sell more", so they are two tabs of one screen; and "New order"
// left the rail entirely, because it is an action, not a place, and the orders
// board has carried a New order button all along. Six entries, four now.
//
// /vendor/campaigns redirects in here, so nothing that linked to it breaks.
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageSkeleton } from "@/components/shared/Skeleton";
import AnalyticsPanel from "@/components/vendor/AnalyticsPanel";
import CampaignsPanel from "@/components/vendor/CampaignsPanel";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

type Tab = "numbers" | "messages";

const TABS: Tab[] = ["numbers", "messages"];

function isTab(value: string | null): value is Tab {
  return TABS.includes(value as Tab);
}

function GrowScreen() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get("tab");
    return isTab(requested) ? requested : "numbers";
  });

  const tabLabels: Record<Tab, string> = {
    numbers: t("simple.growNumbers"),
    messages: t("simple.growMessages"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("simple.grow")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("simple.growSubtitle")}</p>
      </div>

      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "px-4 h-9 text-sm font-medium rounded-pill transition-colors",
              tab === key ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900"
            )}
          >
            {tabLabels[key]}
          </button>
        ))}
      </div>

      {tab === "numbers" ? <AnalyticsPanel /> : <CampaignsPanel />}
    </div>
  );
}

export default function VendorGrowPage() {
  return (
    <Suspense fallback={<PageSkeleton statCards={4} tableRows={6} tableCols={4} />}>
      <GrowScreen />
    </Suspense>
  );
}
