"use client";
// Revision 20 — /ops: the Ops tab.
//
// Client note, 2026-09-15: the HQ portal is four tabs, and Ops is the first.
// Its subtabs are orders, equipment, areas, driver tracking, shift planning,
// driver training and new accounts — plus the live control room, which the
// client did not list because nobody lists the thing they are looking at all
// day, and which would have been a strange screen to lose.
//
// Three of the eight are whole screens that already exist and are linked to
// from outside the portal, so they stay at their own URLs and simply carry the
// same strip: /orders, /assets, /zones. See lib/hqTabs.ts for why.
//
// Live is the default, so /ops with no query is exactly what it always was.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import HqTabs from "@/components/hq/HqTabs";
import LiveControlRoom from "@/components/ops/LiveControlRoom";
import DriverTrackingTab from "@/components/hq/DriverTrackingTab";
import ShiftPlanTab from "@/components/hq/ShiftPlanTab";
import DriverTrainingTab from "@/components/hq/DriverTrainingTab";
import OnboardingTab from "@/components/hq/OnboardingTab";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { OPS_TABS } from "@/lib/hqTabs";
import { useQuery } from "@tanstack/react-query";
import { onboardingApi } from "@/lib/darbApi";

function OpsScreen() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  // A lead nobody has touched is the one that goes cold, so the count sits on
  // the tab rather than inside it.
  const onboardingQuery = useQuery({
    queryKey: ["darb", "onboarding", "counts"],
    queryFn: () => onboardingApi.counts(),
    refetchInterval: 120_000,
  });

  return (
    <div className="space-y-5">
      <HqTabs tabs={OPS_TABS} counts={{ onboarding: onboardingQuery.data?.waiting }} />
      {tab === "driver-tracking" ? (
        <DriverTrackingTab />
      ) : tab === "shift-planning" ? (
        <ShiftPlanTab />
      ) : tab === "driver-training" ? (
        <DriverTrainingTab />
      ) : tab === "onboarding" ? (
        <OnboardingTab />
      ) : (
        // Anything else, including no query at all and the ?view= segments the
        // live room has always used, opens the control room.
        <LiveControlRoom />
      )}
    </div>
  );
}

export default function OpsPage() {
  return (
    <Suspense fallback={<PageSkeleton statCards={0} tableRows={8} tableCols={5} />}>
      <OpsScreen />
    </Suspense>
  );
}
