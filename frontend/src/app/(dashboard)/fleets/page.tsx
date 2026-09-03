"use client";
// Darb 2.0 PRD build — /fleets: the delivery-company list. Client note
// (2026-08-31): a company opens as a full page (/fleets/[id], the vendor
// profile layout) instead of the old SlidePanel, with its drivers listed on
// their own tab. The sections that used to live in the panel moved there.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { downloadBlob } from "@/utils/downloadBlob";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { fleetsApi, unwrapList } from "@/lib/darbApi";
import type { FleetProfile } from "@/types/darb";
import BackToSetup from "@/components/shared/BackToSetup";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatNumber } from "@/i18n/format";

type FleetRow = FleetProfile & { _count?: { drivers?: number; users?: number } };

export default function FleetsPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  /**
   * Revision 4 (#10). Three sheets, built server-side, with rates as real
   * percentages and money as real numbers so Excel sorts and sums them.
   */
  async function downloadWorkbook() {
    setDownloading(true);
    try {
      await downloadBlob(
        "/api/fleets/export.xlsx",
        `fleets-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
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
        onRowClick={(row: FleetRow) => router.push(`/fleets/${row.id}`)}
        emptyMessage={t("errors.noData")}
      />
    </div>
  );
}
