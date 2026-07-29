"use client";
// Darb 2.0 PRD build — /fleets: compact staff surface over the fleet
// governance APIs. A DataTable of fleet partners with a SlidePanel
// click-through showing the fleet's scorecard and payout statements.
// Reuses fleetPortal.* + cockpit.* keys (English-leaning composites are
// acceptable on this staff-only page).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { downloadBlob } from "@/utils/downloadBlob";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import PeriodPicker, { type Period, presetRange } from "@/components/shared/PeriodPicker";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { fleetsApi, unwrapList } from "@/lib/darbApi";
import type { FleetProfile, FleetStatementRow } from "@/types/darb";
import BackToSetup from "@/components/shared/BackToSetup";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatNumber, formatPercent, localeTag } from "@/i18n/format";
import type { Locale } from "@/i18n/messages";

type FleetRow = FleetProfile & { _count?: { drivers?: number; users?: number } };

function pct(value: number | null | undefined, locale: Locale): string {
  return value == null ? "n/a" : formatPercent(value, locale, 1);
}

/** Slugged the same way the server names the file, so both agree. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fleet";
}

/**
 * The workbook, optionally narrowed to one partner. `fleetId` is what the
 * panel passes: the scorecard and the payout history are only rendered there,
 * so without it the panel is the one screen whose data cannot leave the app.
 * `period` is passed through so the workbook covers the same window the panel
 * is showing rather than the server's 30-day default.
 */
async function exportWorkbook(fleetId?: string, nameForFile?: string, period?: Period) {
  const params = new URLSearchParams();
  if (fleetId) params.set("fleetId", fleetId);
  if (period) {
    params.set("from", period.from);
    params.set("to", period.to);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const stem = nameForFile ? slugify(nameForFile) : "fleets";
  await downloadBlob(
    `/api/fleets/export.xlsx${query}`,
    `${stem}-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

function ScorecardPanel({ fleet }: { fleet: FleetRow }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  /**
   * A scorecard with no stated period is not a report, it is a number nobody
   * can act on: 84.8% on-time over what? The panel now names its window and
   * lets it be changed, and everything below (the numbers and the download)
   * follows it. Month, not the old silent 30-day default, because that is the
   * window the payout statements are cut on.
   */
  const [period, setPeriod] = useState<Period>(() => presetRange("month"));

  async function downloadFleet() {
    setDownloading(true);
    try {
      await exportWorkbook(fleet.id, fleet.name, period);
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setDownloading(false);
    }
  }

  const scorecardQuery = useQuery({
    queryKey: ["darb", "fleets", fleet.id, "scorecard", period.from, period.to],
    queryFn: () => fleetsApi.scorecard(fleet.id, { from: period.from, to: period.to }),
  });
  const statementsQuery = useQuery({
    queryKey: ["darb", "fleets", fleet.id, "statements"],
    queryFn: () => fleetsApi.statements(fleet.id),
  });

  const s = scorecardQuery.data;
  const statements = unwrapList<FleetStatementRow>(statementsQuery.data);
  const monthLabel = (iso: string) =>
    new Intl.DateTimeFormat(localeTag(locale), { year: "numeric", month: "long" }).format(
      new Date(iso)
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={fleet.disciplineStatus} />
        <span dir="ltr" className="text-sm text-sand-700 tabular-nums">
          {t("fleetPortal.feePerOrder")}: {formatKwd(fleet.flatFeePerOrderKwd, locale)}
        </span>
        <button
          type="button"
          onClick={() => void downloadFleet()}
          disabled={downloading}
          className="ms-auto inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
        >
          <Download size={12} aria-hidden="true" />
          {downloading ? t("common.processing") : t("fleetPortal.exportThisCompany")}
        </button>
      </div>

      {/* Scorecard */}
      <section>
        <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-2">
          {t("fleetPortal.scorecardTitle")}
        </h3>
        <div className="mb-3">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
        {scorecardQuery.isLoading ? (
          <p className="text-sm text-sand-600">{t("common.loading")}</p>
        ) : !s ? (
          <p className="text-sm text-sand-600">{t("errors.noData")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-sand-600">{t("fleetPortal.onTimeRate")}</dt>
            <dd dir="ltr" className="tabular-nums">{pct(s.onTimeRate, locale)}</dd>
            <dt className="text-sand-600">{t("fleetPortal.acceptanceRate")}</dt>
            <dd dir="ltr" className="tabular-nums">{pct(s.acceptanceRate, locale)}</dd>
            <dt className="text-sand-600">{t("fleetPortal.utilisation")}</dt>
            <dd dir="ltr" className="tabular-nums">{pct(s.utilisation, locale)}</dd>
            <dt className="text-sand-600">{t("fleetPortal.deliveredOrders")}</dt>
            <dd dir="ltr" className="tabular-nums">{formatNumber(s.deliveredOrders, locale)}</dd>
            <dt className="text-sand-600">{t("fleetPortal.onlineHours")}</dt>
            <dd dir="ltr" className="tabular-nums">
              {formatNumber(s.onlineHours, locale, { maximumFractionDigits: 1 })}
            </dd>
            <dt className="text-sand-600">{t("fleetPortal.contractedHours")}</dt>
            <dd dir="ltr" className="tabular-nums">
              {s.contractedHours != null
                ? formatNumber(s.contractedHours, locale, { maximumFractionDigits: 1 })
                : "n/a"}
            </dd>
            <dt className="text-sand-600">{t("fleetPortal.rating")}</dt>
            <dd dir="ltr" className="tabular-nums">
              {s.avgRating != null
                ? `${formatNumber(s.avgRating, locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} (${s.ratingCount})`
                : "n/a"}
            </dd>
          </dl>
        )}
      </section>

      {/* Statements */}
      <section>
        <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-2">
          {t("fleetPortal.payoutsTitle")}
        </h3>
        {statementsQuery.isLoading ? (
          <p className="text-sm text-sand-600">{t("common.loading")}</p>
        ) : statements.length === 0 ? (
          <p className="text-sm text-sand-600">{t("fleetPortal.noStatements")}</p>
        ) : (
          <ul className="divide-y divide-sand-200">
            {statements.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm text-sand-900" dir="ltr">{monthLabel(row.periodStart)}</p>
                  <p className="text-xs text-sand-600 mt-0.5" dir="ltr">
                    {formatNumber(row.deliveredOrders, locale)} x{" "}
                    {formatKwd(row.feePerOrderKwd, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span dir="ltr" className="text-sm text-sand-900 tabular-nums font-medium">
                    {formatKwd(row.totalKwd, locale)}
                  </span>
                  <StatusBadge status={row.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function FleetsPage() {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<FleetRow | null>(null);
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  /**
   * Revision 4 (#10). The client asked for the detail to be in the download.
   * The old client-side CSV could only ever carry the five list columns —
   * the scorecard and the payout history are separate queries the table never
   * makes. So the workbook is built server-side and streamed: three sheets,
   * with rates as real percentages and money as real numbers so Excel sorts
   * and sums them instead of treating them as text.
   */
  async function downloadWorkbook() {
    setDownloading(true);
    try {
      await exportWorkbook();
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setDownloading(false);
    }
  }

  const fleetsQuery = useQuery({
    queryKey: ["darb", "fleets"],
    queryFn: () => fleetsApi.list({ limit: 100 }),
  });

  if (fleetsQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={5} />;
  if (fleetsQuery.error) {
    return (
      <ErrorState
        error={
          fleetsQuery.error instanceof Error ? fleetsQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => fleetsQuery.refetch()}
      />
    );
  }

  const fleets = unwrapList<FleetRow>(fleetsQuery.data);

  return (
    <div className="space-y-6">
      <BackToSetup />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">
            {t("simple.setupCompanies")}
          </h1>
          <p className="text-sm text-sand-600 mt-1">{t("simple.setupCompaniesDesc")}</p>
        </div>
        <button
          type="button"
          onClick={() => void downloadWorkbook()}
          disabled={downloading || fleets.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
        >
          <Download size={12} aria-hidden="true" />
          {downloading ? t("common.processing") : t("fleetPortal.exportExcel")}
        </button>
      </div>

      <DataTable
        columns={[
          {
            key: "name",
            label: t("cockpit.fleetName"),
            render: (value: string) => <span dir="auto">{value}</span>,
          },
          {
            key: "_count",
            label: t("fleetPortal.navRoster"),
            sortable: false,
            render: (value: FleetRow["_count"]) =>
              value?.drivers != null ? formatNumber(value.drivers, locale) : "n/a",
            exportValue: (value: FleetRow["_count"]) =>
              value?.drivers != null ? value.drivers : "n/a",
          },
          {
            key: "disciplineStatus",
            label: t("cockpit.fleetDiscipline"),
            render: (value: string) => <StatusBadge status={value} />,
          },
          {
            key: "flatFeePerOrderKwd",
            label: t("fleetPortal.feePerOrder"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums">{formatKwd(value, locale)}</span>
            ),
          },
          {
            key: "isActive",
            label: t("fleetPortal.status"),
            render: (value: boolean) => (
              <StatusBadge status={value ? "ACTIVE" : "INACTIVE"} />
            ),
          },
        ]}
        data={fleets}
        onRowClick={(row: FleetRow) => setSelected(row)}
        emptyMessage={t("errors.noData")}
      />

      <SlidePanel
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={t("cockpit.fleetName")}
      >
        {selected && <ScorecardPanel fleet={selected} />}
      </SlidePanel>
    </div>
  );
}
