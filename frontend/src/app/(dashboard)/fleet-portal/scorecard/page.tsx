"use client";
// Darb 2.0 PRD build — /fleet-portal/scorecard: the fleet's own performance
// scorecard, computed server-side over the period the partner picks (day,
// week or month, defaulting to this month so it lines up with how payouts are
// cut). Rates arrive as 0..1 fractions and render as percentages with 1dp;
// null means not enough data yet and renders "n/a".
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck, Clock3, Gauge, PackageCheck, Timer } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import ErrorState from "@/components/shared/ErrorState";
import PeriodPicker, { type Period, presetRange } from "@/components/shared/PeriodPicker";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { fleetApi } from "@/lib/darbApi";
import { useI18n } from "@/i18n/I18nProvider";
import { formatNumber, formatPercent } from "@/i18n/format";
import type { Locale } from "@/i18n/messages";

function pct(value: number | null | undefined, locale: Locale): string {
  return value == null ? "n/a" : formatPercent(value, locale, 1);
}

export default function FleetScorecardPage() {
  const { t, locale } = useI18n();

  const [period, setPeriod] = useState<Period>(() => presetRange("month"));

  const scorecardQuery = useQuery({
    queryKey: ["darb", "fleet", "scorecard", period.from, period.to],
    queryFn: () => fleetApi.scorecard({ from: period.from, to: period.to }),
  });

  if (scorecardQuery.isLoading) return <PageSkeleton statCards={5} tableRows={0} tableCols={1} />;
  if (scorecardQuery.error || !scorecardQuery.data) {
    return (
      <ErrorState
        error={
          scorecardQuery.error instanceof Error
            ? scorecardQuery.error.message
            : t("errors.loadingData")
        }
        onRetry={() => scorecardQuery.refetch()}
      />
    );
  }

  const s = scorecardQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">
          {t("fleetPortal.scorecardTitle")}
        </h1>
      </div>

      <PeriodPicker value={period} onChange={setPeriod} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title={t("fleetPortal.onTimeRate")} value={pct(s.onTimeRate, locale)} icon={Timer} />
        <StatCard
          title={t("fleetPortal.acceptanceRate")}
          value={pct(s.acceptanceRate, locale)}
          icon={CheckCheck}
        />
        <StatCard
          title={t("fleetPortal.utilisation")}
          value={pct(s.utilisation, locale)}
          icon={Gauge}
        />
        <StatCard
          title={t("fleetPortal.deliveredOrders")}
          value={formatNumber(s.deliveredOrders, locale)}
          icon={PackageCheck}
        />
        <StatCard
          title={t("fleetPortal.onlineHours")}
          value={formatNumber(s.onlineHours, locale, { maximumFractionDigits: 1 })}
          trend={`${t("fleetPortal.contractedHours")}: ${
            s.contractedHours != null
              ? formatNumber(s.contractedHours, locale, { maximumFractionDigits: 1 })
              : "n/a"
          }`}
          icon={Clock3}
        />
      </div>
    </div>
  );
}
