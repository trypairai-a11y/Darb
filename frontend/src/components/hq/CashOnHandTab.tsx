"use client";
// Revision 21c (client note, 2026-09-21): "in the finance I need a record of
// how much cash is with each company, and if I press on the company it will
// show me each driver's cash on hand, also the list must be able to download".
//
// The number here is the DRIVER_CASH ledger, folded by the company the driver
// belongs to. It is the same figure the fleet portal's Cash tab shows a
// company about itself, so Darb and the company are arguing over one number.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Download, Wallet } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { financeDeskApi } from "@/lib/darbApi";
import { downloadBlob } from "@/utils/downloadBlob";
import type { CashOnHandCompany } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd, formatNumber } from "@/i18n/format";
import { cn } from "@/lib/cn";

export default function CashOnHandTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const query = useQuery({
    queryKey: ["darb", "finance", "cash-on-hand"],
    queryFn: () => financeDeskApi.cashOnHand(),
    refetchInterval: 60_000,
  });

  const companies = useMemo<CashOnHandCompany[]>(() => query.data?.companies ?? [], [query.data]);

  async function download() {
    setDownloading(true);
    try {
      await downloadBlob(
        financeDeskApi.cashOnHandXlsxUrl,
        `darb-cash-on-hand-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch {
      toast.error(t("errors.loadingData"));
    } finally {
      setDownloading(false);
    }
  }

  if (query.isLoading) return <PageSkeleton statCards={1} tableRows={6} tableCols={5} />;
  if (query.error || !query.data) {
    return (
      <ErrorState
        error={query.error instanceof Error ? query.error.message : t("errors.loadingData")}
        onRetry={() => query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="cash-on-hand-tab">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-sand-900">{t("financeDesk.cashTitle")}</h2>
          <p className="text-sm text-sand-600 mt-1">{t("financeDesk.cashSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading}
          data-testid="cash-on-hand-download"
          className="h-9 px-4 inline-flex items-center gap-2 rounded-pill border border-sand-200 text-sand-700 text-sm hover:bg-sand-50 disabled:opacity-40"
        >
          <Download size={14} aria-hidden="true" />
          {t("financeDesk.cashDownload")}
        </button>
      </div>

      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-pill bg-primary/10 text-primary grid place-items-center shrink-0">
          <Wallet size={18} aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs text-sand-600">{t("financeDesk.cashTotal")}</p>
          <p className="font-display text-2xl text-sand-900 tabular-nums" dir="ltr">
            {formatKwd(query.data.totalKwd, locale)}
          </p>
        </div>
        {query.data.walletTotalKwd != null && (
          <div className="ps-4 ms-2 border-s border-sand-200" data-testid="cash-wallet-total">
            <p className="text-xs text-sand-600">{t("financeDesk.cashWalletTotal")}</p>
            <p className="font-display text-2xl text-sand-900 tabular-nums" dir="ltr">
              {formatKwd(query.data.walletTotalKwd, locale)}
            </p>
          </div>
        )}
        <p className="ms-auto text-xs text-sand-500">
          {t("financeDesk.cashAsOf").replace("{time}", formatDateTime(query.data.asOf, locale))}
        </p>
      </div>

      {companies.length === 0 ? (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center">
          <p className="text-sm text-sand-600">{t("financeDesk.cashEmpty")}</p>
        </div>
      ) : (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand-50 text-xs text-sand-600">
              <tr>
                <th className="text-start font-medium px-4 py-3">{t("financeDesk.cashCompany")}</th>
                <th className="text-end font-medium px-4 py-3">{t("financeDesk.cashDrivers")}</th>
                <th className="text-end font-medium px-4 py-3">{t("financeDesk.cashCarrying")}</th>
                <th className="text-end font-medium px-4 py-3">{t("financeDesk.cashAmount")}</th>
                <th className="text-end font-medium px-4 py-3">{t("financeDesk.cashWallet")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {companies.map((c) => {
                const key = c.fleetPartnerId ?? "darb";
                const isOpen = open === key;
                return (
                  <CompanyRows
                    key={key}
                    company={c}
                    open={isOpen}
                    onToggle={() => setOpen(isOpen ? null : key)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CompanyRows({
  company,
  open,
  onToggle,
}: {
  company: CashOnHandCompany;
  open: boolean;
  onToggle: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <>
      <tr
        className={cn("cursor-pointer hover:bg-sand-50 transition-colors", open && "bg-sand-50")}
        onClick={onToggle}
        data-testid="cash-company-row"
      >
        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-2 font-medium text-sand-900" dir="auto">
            {open ? (
              <ChevronUp size={14} className="text-sand-400" aria-hidden="true" />
            ) : (
              <ChevronDown size={14} className="text-sand-400" aria-hidden="true" />
            )}
            {company.name}
          </span>
        </td>
        <td className="px-4 py-3 text-end tabular-nums">{formatNumber(company.driverCount, locale)}</td>
        <td className="px-4 py-3 text-end tabular-nums">{formatNumber(company.driversCarrying, locale)}</td>
        <td className="px-4 py-3 text-end tabular-nums font-medium text-sand-900" dir="ltr">
          {formatKwd(company.cashOnHandKwd, locale)}
        </td>
        <td className="px-4 py-3 text-end tabular-nums text-sand-900" dir="ltr" data-testid="cash-company-wallet">
          {company.walletKwd == null ? "n/a" : formatKwd(company.walletKwd, locale)}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="px-4 pb-4 pt-1 bg-sand-50/60">
            {company.drivers.length === 0 ? (
              <p className="text-xs text-sand-600 py-2">{t("financeDesk.cashNoDrivers")}</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-sand-500">
                  <tr>
                    <th className="text-start font-medium px-3 py-2">{t("financeDesk.cashDriver")}</th>
                    <th className="text-start font-medium px-3 py-2">{t("table.status")}</th>
                    <th className="text-end font-medium px-3 py-2">{t("financeDesk.cashAmount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {company.drivers.map((d) => (
                    <tr key={d.driverId} data-testid="cash-driver-row">
                      <td className="px-3 py-2">
                        <span className="text-sand-900" dir="auto">{d.name}</span>
                        <span className="text-sand-500 ms-2 font-mono" dir="ltr">
                          {d.driverCode ?? "n/a"}
                        </span>
                        {d.phone && (
                          <span className="text-sand-500 ms-2" dir="ltr">{d.phone}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sand-700">{d.status}</td>
                      <td className="px-3 py-2 text-end tabular-nums text-sand-900" dir="ltr">
                        {formatKwd(d.cashOnHandKwd, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
