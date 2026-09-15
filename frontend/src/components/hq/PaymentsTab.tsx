"use client";
// Revision 20 — Finance › Payments.
//
// "this tab is for the finance team to acknowledge the top ups made by the
// vendors/delivery companies, also to update the status of the pending
// payments".
//
// Both halves of the plumbing already existed and both were reachable only from
// inside one account's detail panel, so a transfer from a shop nobody happened
// to open that day sat unconfirmed for a week. This is the desk: one list
// across merchants and delivery companies, worked top-down.
//
// Confirming credits a real wallet, so the button says "Confirm it arrived"
// rather than "Confirm". The accountant is asserting that the money is in the
// bank, not that they have read the row.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Store, Truck, X } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { useToast } from "@/components/shared/Toast";
import { financeDeskApi } from "@/lib/darbApi";
import type { PaymentRow } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  PAID: "bg-forest-100 text-forest-700",
  CONFIRMED: "bg-forest-100 text-forest-700",
  CANCELLED: "bg-sand-200 text-sand-600",
  REJECTED: "bg-red-100 text-red-700",
  FAILED: "bg-red-100 text-red-700",
};

export default function PaymentsTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  const canSettle = hasRole("ACCOUNTANT");

  const [status, setStatus] = useState<"PENDING" | "ALL">("PENDING");
  const [side, setSide] = useState<"ALL" | "VENDOR" | "FLEET">("ALL");
  const [rejecting, setRejecting] = useState<PaymentRow | null>(null);
  const [reason, setReason] = useState("");

  const query = useQuery({
    queryKey: ["darb", "payments", status, side],
    queryFn: () => financeDeskApi.payments({ status, side }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["darb", "payments"] });
    // A confirmation credits a wallet, so the balances on the Money screen are
    // stale the moment this succeeds.
    void queryClient.invalidateQueries({ queryKey: ["darb", "wallet-accounts"] });
  }
  function failWith(err: unknown) {
    const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    toast.error(message ?? t("errors.savingData"));
  }

  const confirmMutation = useMutation({
    mutationFn: (row: PaymentRow) =>
      row.kind === "VENDOR_TOP_UP"
        ? financeDeskApi.confirmTopUp(row.id)
        : financeDeskApi.confirmDeposit(row.id),
    onSuccess: (data) => {
      const already = (data as { alreadyPaid?: boolean })?.alreadyPaid;
      toast.success(already ? t("financeDesk.alreadyPaid") : t("financeDesk.confirmed"));
      refresh();
    },
    onError: failWith,
  });

  const rejectMutation = useMutation({
    mutationFn: (row: PaymentRow) =>
      row.kind === "VENDOR_TOP_UP"
        ? financeDeskApi.cancelTopUp(row.id)
        : financeDeskApi.rejectDeposit(row.id, reason.trim()),
    onSuccess: () => {
      toast.success(t("financeDesk.cancelled"));
      setRejecting(null);
      setReason("");
      refresh();
    },
    onError: failWith,
  });

  if (query.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={6} />;
  if (query.error) {
    return (
      <ErrorState
        error={query.error instanceof Error ? query.error.message : t("errors.loadingData")}
        onRetry={() => query.refetch()}
      />
    );
  }

  const rows = query.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-sand-900">{t("financeDesk.paymentsTitle")}</h2>
        <p className="text-sm text-sand-600 mt-1">{t("financeDesk.paymentsSubtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-sand-100 rounded-pill p-1">
          {(["PENDING", "ALL"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
                status === s ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
              )}
            >
              {t(s === "PENDING" ? "financeDesk.showPending" : "financeDesk.showAll")}
            </button>
          ))}
        </div>
        <select
          value={side}
          onChange={(e) => setSide(e.target.value as "ALL" | "VENDOR" | "FLEET")}
          className="h-9 px-3 rounded-pill border border-sand-200 bg-card text-sm"
        >
          <option value="ALL">{t("financeDesk.sideAll")}</option>
          <option value="VENDOR">{t("financeDesk.sideVendor")}</option>
          <option value="FLEET">{t("financeDesk.sideFleet")}</option>
        </select>
      </div>

      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand-50 text-sand-600">
              <tr>
                <th className="text-start font-medium px-4 py-3">{t("financeDesk.account")}</th>
                <th className="text-end font-medium px-4 py-3">{t("financeDesk.amount")}</th>
                <th className="text-start font-medium px-4 py-3">{t("financeDesk.reference")}</th>
                <th className="text-start font-medium px-4 py-3">{t("financeDesk.requested")}</th>
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.state")}</th>
                {canSettle && (
                  <th className="text-end font-medium px-4 py-3">{t("driverTracking.actions")}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canSettle ? 6 : 5} className="px-4 py-10 text-center text-sand-500">
                    {t("financeDesk.noPayments")}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={`${row.kind}-${row.id}`} className="hover:bg-sand-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {row.kind === "VENDOR_TOP_UP" ? (
                        <Store size={14} className="text-sand-400 shrink-0" aria-hidden="true" />
                      ) : (
                        <Truck size={14} className="text-sand-400 shrink-0" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sand-900 truncate">{row.accountName ?? "n/a"}</p>
                        <p className="text-xs text-sand-500">{t(`financeDesk.kind${row.kind}`)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums font-medium text-sand-900">
                    {formatKwd(row.amountKwd, locale)}
                  </td>
                  <td className="px-4 py-3 text-sand-600 font-mono text-xs">
                    {row.reference ?? "n/a"}
                    {row.providerRef ? <span className="block text-sand-400">{row.providerRef}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-sand-600 text-xs">
                    {formatDateTime(row.createdAt, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "px-2 h-6 inline-flex items-center rounded-pill text-[11px] font-medium",
                        STATUS_TONE[row.status] ?? "bg-sand-200 text-sand-700",
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                  {canSettle && (
                    <td className="px-4 py-3">
                      {row.status === "PENDING" ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            disabled={confirmMutation.isPending}
                            onClick={() => confirmMutation.mutate(row)}
                            className="h-8 px-4 inline-flex items-center gap-1.5 rounded-pill bg-forest-600 text-white text-xs font-medium disabled:opacity-40"
                          >
                            <Check size={13} aria-hidden="true" />
                            {t("financeDesk.confirm")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejecting(row);
                              setReason("");
                            }}
                            className="h-8 w-8 rounded-pill grid place-items-center text-sand-500 hover:bg-sand-100"
                            title={t("financeDesk.cancelPayment")}
                          >
                            <X size={15} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-end text-xs text-sand-400">
                          {row.paidAt ? formatDateTime(row.paidAt, locale) : "n/a"}
                        </p>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SlidePanel
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={
          rejecting?.kind === "FLEET_DEPOSIT"
            ? t("financeDesk.rejectPayment")
            : t("financeDesk.cancelPayment")
        }
        subtitle={rejecting?.accountName ?? ""}
      >
        <div className="space-y-4">
          {/* A company deposit needs a reason; a shop top-up is simply
              cancelled, which is what the endpoint behind it accepts. */}
          {rejecting?.kind === "FLEET_DEPOSIT" && (
            <div>
              <label className="block text-sm font-medium text-sand-900 mb-1">
                {t("financeDesk.rejectReason")}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-sand-200 bg-card p-3 text-sm"
              />
            </div>
          )}
          <button
            type="button"
            disabled={
              rejectMutation.isPending ||
              (rejecting?.kind === "FLEET_DEPOSIT" && !reason.trim())
            }
            onClick={() => rejecting && rejectMutation.mutate(rejecting)}
            className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          >
            {rejecting?.kind === "FLEET_DEPOSIT"
              ? t("financeDesk.rejectPayment")
              : t("financeDesk.cancelPayment")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
