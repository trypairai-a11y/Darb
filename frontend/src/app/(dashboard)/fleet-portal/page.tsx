"use client";
// Darb 2.0 PRD build — /fleet-portal: the fleet partner's driver roster.
// Header from fleetApi.me() (with a discipline banner when the fleet is not
// in good standing) + a DataTable of drivers with docs and rating summaries.
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { fleetApi } from "@/lib/darbApi";
import type { FleetDriverRow } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatNumber } from "@/i18n/format";

/** "x/4" — how many of the four document statuses are VALID. */
function docsSummary(d: FleetDriverRow): string {
  const statuses = [d.civilIdStatus, d.drivingLicenseStatus, d.vehicleRegStatus, d.healthCertStatus];
  const valid = statuses.filter((s) => s === "VALID").length;
  return `${valid}/${statuses.length}`;
}

function isThrottled(d: FleetDriverRow): boolean {
  return !!d.throttledUntil && new Date(d.throttledUntil).getTime() > Date.now();
}

export default function FleetRosterPage() {
  const { t, locale } = useI18n();

  const meQuery = useQuery({
    queryKey: ["darb", "fleet", "me"],
    queryFn: () => fleetApi.me(),
  });
  const driversQuery = useQuery({
    queryKey: ["darb", "fleet", "drivers"],
    queryFn: () => fleetApi.drivers(),
  });

  if (meQuery.isLoading || driversQuery.isLoading) {
    return <PageSkeleton statCards={0} tableRows={8} tableCols={7} />;
  }
  if (driversQuery.error) {
    return (
      <ErrorState
        error={
          driversQuery.error instanceof Error ? driversQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => driversQuery.refetch()}
      />
    );
  }

  const fleet = meQuery.data;
  const drivers = driversQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">
          {t("fleetPortal.rosterTitle")}
        </h1>
        <p className="text-sm text-sand-600 mt-1" dir="auto">
          {fleet ? `${fleet.name}. ` : ""}
          {t("fleetPortal.rosterSubtitle")}
        </p>
      </div>

      {fleet && fleet.disciplineStatus !== "OK" && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-amber-200 bg-amber-50">
          <TriangleAlert size={17} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {t("fleetPortal.disciplineBanner")}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              <StatusBadge status={fleet.disciplineStatus} />
            </p>
          </div>
        </div>
      )}

      <DataTable
        columns={[
          {
            key: "name",
            label: t("fleetPortal.driverName"),
            render: (value: string) => <span dir="auto">{value}</span>,
          },
          {
            key: "phone",
            label: t("fleetPortal.phone"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums">{value || "n/a"}</span>
            ),
          },
          { key: "vehicleType", label: t("fleetPortal.vehicle") },
          {
            key: "status",
            label: t("fleetPortal.status"),
            render: (value: string, row: FleetDriverRow) => (
              <span className="inline-flex items-center gap-1.5">
                <StatusBadge status={value} />
                {isThrottled(row) && (
                  <StatusBadge status="THROTTLED" label={t("fleetPortal.throttled")} />
                )}
              </span>
            ),
          },
          {
            key: "performanceTier",
            label: t("fleetPortal.tier"),
            render: (value: string | null) => value ?? "n/a",
          },
          {
            key: "rating",
            label: t("fleetPortal.rating"),
            sortable: false,
            render: (value: FleetDriverRow["rating"]) =>
              value?.avg != null ? (
                <span dir="ltr" className="tabular-nums">
                  {formatNumber(value.avg, locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}{" "}
                  <span className="text-xs text-sand-500">({value.count})</span>
                </span>
              ) : (
                "n/a"
              ),
            exportValue: (value: FleetDriverRow["rating"]) =>
              value?.avg != null ? `${value.avg} (${value.count})` : "n/a",
          },
          {
            key: "docs",
            label: t("fleetPortal.docs"),
            sortable: false,
            render: (_value: unknown, row: FleetDriverRow) => (
              <span dir="ltr" className="tabular-nums">{docsSummary(row)}</span>
            ),
          },
        ]}
        data={drivers}
        exportFilename="fleet-roster"
        emptyMessage={t("errors.noData")}
      />
    </div>
  );
}
