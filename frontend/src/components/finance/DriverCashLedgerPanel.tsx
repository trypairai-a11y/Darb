"use client";
// Revision 24 (#17) — "for the cash on hand of the drivers, we should be able
// to press on the driver and see the actual ledger of each transaction,
// visible for the admin and the delivery company portal."
//
// One panel, two callers: Finance › Cash with companies passes the staff
// endpoint, the fleet portal's Cash tab passes its own (which the server
// fences to the company's own drivers). The rows are the driver's DRIVER_CASH
// postings exactly as the ledger holds them, newest first, so the top row's
// balance is the cash-on-hand figure the reader clicked.
import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import SlidePanel from "@/components/shared/SlidePanel";
import ErrorState from "@/components/shared/ErrorState";
import type { DriverCashLedgerEntry, DriverCashLedgerPayload } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd, formatNumber } from "@/i18n/format";
import { cn } from "@/lib/cn";

const PAGE_SIZE = 50;

const KNOWN_TYPES = ["COD_SETTLEMENT", "REMITTANCE", "TIP", "ADJUSTMENT", "REFUND"];

export function ledgerTypeKey(entry: Pick<DriverCashLedgerEntry, "type" | "settledByCompany">): string {
  if (entry.type === "REMITTANCE" && entry.settledByCompany) return "cashLedger.typeREMITTANCE_COMPANY";
  return KNOWN_TYPES.includes(entry.type) ? `cashLedger.type${entry.type}` : "cashLedger.typeOTHER";
}

export default function DriverCashLedgerPanel({
  driver,
  scope,
  fetchPage,
  onClose,
}: {
  /** The driver whose ledger is open, or null when the panel is closed. */
  driver: { driverId: string; name: string; driverCode?: string | null } | null;
  /** Keeps the staff and fleet caches apart. */
  scope: "staff" | "fleet";
  fetchPage: (driverId: string, params: { page: number; limit: number }) => Promise<DriverCashLedgerPayload>;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();

  const query = useInfiniteQuery({
    queryKey: ["darb", scope, "driver-cash-ledger", driver?.driverId],
    queryFn: ({ pageParam }) => fetchPage(driver!.driverId, { page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    enabled: !!driver,
  });

  const first = query.data?.pages[0];
  const entries = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = first?.pagination.total ?? 0;

  return (
    <SlidePanel
      open={!!driver}
      onClose={onClose}
      wide
      title={driver?.name ?? t("cashLedger.title")}
      subtitle={t("cashLedger.title")}
    >
      {!driver ? null : query.error ? (
        <ErrorState
          error={query.error instanceof Error ? query.error.message : t("errors.loadingData")}
          onRetry={() => query.refetch()}
        />
      ) : (
        <div className="space-y-4" data-testid="driver-cash-ledger">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-sand-50 border border-sand-200 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-sand-600">{t("cashLedger.balance")}</p>
              <p dir="ltr" className="text-2xl font-display tabular-nums mt-0.5 text-sand-900" data-testid="driver-cash-ledger-balance">
                {first ? formatKwd(first.balanceKwd, locale) : "..."}
              </p>
            </div>
            <div className="text-xs text-sand-600 text-end">
              {driver.driverCode && <p dir="ltr" className="font-mono">{driver.driverCode}</p>}
              {first?.driver.fleetPartnerName && <p dir="auto">{first.driver.fleetPartnerName}</p>}
            </div>
          </div>
          <p className="text-xs text-sand-600">{t("cashLedger.hint")}</p>

          {query.isLoading ? (
            <p className="text-sm text-sand-600">{t("common.loading")}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-sand-600">{t("cashLedger.empty")}</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200">
                    <th className="text-start text-xs font-medium text-sand-600 py-2 px-1">{t("cashLedger.date")}</th>
                    <th className="text-start text-xs font-medium text-sand-600 py-2 px-1">{t("cashLedger.order")}</th>
                    <th className="text-start text-xs font-medium text-sand-600 py-2 px-1">{t("cashLedger.type")}</th>
                    <th className="text-end text-xs font-medium text-sand-600 py-2 px-1">{t("cashLedger.debit")}</th>
                    <th className="text-end text-xs font-medium text-sand-600 py-2 px-1">{t("cashLedger.credit")}</th>
                    <th className="text-end text-xs font-medium text-sand-600 py-2 px-1">{t("cashLedger.runningBalance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-sand-100 last:border-0" data-testid="driver-cash-ledger-row">
                      <td className="py-2 px-1 text-xs text-sand-700 whitespace-nowrap">{formatDateTime(e.createdAt, locale)}</td>
                      <td className="py-2 px-1 text-xs font-mono text-sand-800" dir="ltr">{e.orderNumber ?? "n/a"}</td>
                      <td className="py-2 px-1 text-xs text-sand-800">
                        {t(ledgerTypeKey(e))}
                        {e.type === "ADJUSTMENT" && e.memo && (
                          <span className="block text-[11px] text-sand-500" dir="auto">{e.memo}</span>
                        )}
                      </td>
                      <td className={cn("py-2 px-1 text-end tabular-nums", e.direction === "IN" ? "text-sand-900" : "text-sand-400")} dir="ltr">
                        {e.direction === "IN" ? formatKwd(e.amountKwd, locale) : ""}
                      </td>
                      <td className={cn("py-2 px-1 text-end tabular-nums", e.direction === "OUT" ? "text-emerald-700" : "text-sand-400")} dir="ltr">
                        {e.direction === "OUT" ? formatKwd(e.amountKwd, locale) : ""}
                      </td>
                      <td className="py-2 px-1 text-end tabular-nums font-medium text-sand-900" dir="ltr">
                        {formatKwd(e.runningBalanceKwd, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {entries.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-sand-500">
                {t("cashLedger.showing")
                  .replace("{shown}", formatNumber(entries.length, locale))
                  .replace("{total}", formatNumber(total, locale))}
              </p>
              {query.hasNextPage && (
                <button
                  type="button"
                  onClick={() => void query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                  data-testid="driver-cash-ledger-more"
                  className="h-9 px-4 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 disabled:opacity-50"
                >
                  {query.isFetchingNextPage ? t("common.loading") : t("cashLedger.loadMore")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </SlidePanel>
  );
}
