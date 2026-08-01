"use client";
// The cash desk's other queue (revision 14): money arriving from a delivery
// company rather than from a driver.
//
// It sits at the cash desk rather than under /fleets/[id] for a working reason.
// An accountant with three envelopes on the desk needs one list of what is
// waiting; a per-company panel would make them know which companies to click
// into before they could find out.
//
// Confirming is what credits that company's account. Nothing else does, which
// is why the button is ACCOUNTANT+ while the queue itself is visible to the
// cash collector who takes the envelope: seeing what has arrived is the desk's
// job, deciding it is money on Darb's books is an accountant's.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Inbox, X } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { unwrapList, walletsApi } from "@/lib/darbApi";
import { useRole } from "@/hooks/useRole";
import type { FleetDeposit } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";

interface FleetDepositQueueProps {
  /** "PENDING" is the work queue; "ALL" is the history beside the hand-ins. */
  status?: "PENDING" | "ALL";
}

export default function FleetDepositQueue({ status = "PENDING" }: FleetDepositQueueProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canViewFinancials } = useRole();

  const [rejecting, setRejecting] = useState<FleetDeposit | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const depositsQuery = useQuery({
    queryKey: ["darb", "fleet-deposits", status],
    queryFn: () => walletsApi.fleetDeposits({ status }),
  });
  const deposits = unwrapList<FleetDeposit>(depositsQuery.data);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["darb", "fleet-deposits"] }),
      queryClient.invalidateQueries({ queryKey: ["darb", "wallet-accounts"] }),
    ]);

  const fail = (err: unknown) =>
    toast.error(
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave"),
    );

  async function confirm(row: FleetDeposit) {
    setBusy(true);
    try {
      await walletsApi.confirmFleetDeposit(row.id);
      toast.success(t("cashDesk.depositConfirmed"));
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejecting) return;
    const text = reason.trim();
    if (!text) { toast.error(t("cashDesk.rejectReasonRequired")); return; }
    setBusy(true);
    try {
      await walletsApi.rejectFleetDeposit(rejecting.id, text);
      toast.success(t("cashDesk.depositRejected"));
      setRejecting(null);
      setReason("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  // An empty pending queue is not worth a card on a screen whose main job is
  // the hand-in form. The history view always renders, because an empty history
  // is information.
  if (status === "PENDING" && deposits.length === 0) return null;

  return (
    <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
      <header className="px-5 py-4 border-b border-sand-200">
        <h2 className="text-sm font-medium text-sand-900 flex items-center gap-2">
          <Inbox size={16} aria-hidden="true" className="text-primary" />
          {t("cashDesk.depositsTitle")}
        </h2>
        <p className="text-xs text-sand-600 mt-0.5" dir="auto">{t("cashDesk.depositsHint")}</p>
      </header>

      <DataTable
        columns={[
          {
            key: "fleetPartnerName",
            label: t("cashDesk.company"),
            render: (value: string | undefined) => <span dir="auto">{value ?? "n/a"}</span>,
          },
          {
            key: "reference",
            label: t("fleetCash.reference"),
            render: (value: string) => (
              <span dir="ltr" className="font-mono text-xs">{value}</span>
            ),
          },
          {
            key: "amountKwd",
            label: t("fleetCash.amount"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums font-medium">
                {formatKwd(value, locale)}
              </span>
            ),
          },
          {
            // Revision 14b — deposits are paid by link, so what an accountant
            // needs is the rail that took the money, not a method the company
            // no longer picks.
            key: "provider",
            label: t("cashDesk.paidVia"),
            render: (value: string | null) => (
              <span className="text-sm">
                {value === "MYFATOORAH" ? t("cashDesk.viaGateway") : t("cashDesk.viaTransfer")}
              </span>
            ),
          },
          {
            key: "createdAt",
            label: t("fleetCash.submittedAt"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums text-sm">
                {formatDateTime(value, locale)}
              </span>
            ),
          },
          {
            key: "note",
            label: t("fleetCash.note"),
            sortable: false,
            render: (value: string | null) => (
              <span dir="auto" className="text-sm text-sand-600">{value || "n/a"}</span>
            ),
          },
          {
            key: "status",
            label: t("fleetCash.status"),
            render: (value: string, row: FleetDeposit) => (
              <span className="inline-flex items-center gap-2">
                <StatusBadge status={value} />
                {value === "REJECTED" && row.rejectReason && (
                  <span className="text-xs text-red-600" dir="auto">{row.rejectReason}</span>
                )}
              </span>
            ),
          },
          {
            key: "id",
            label: "",
            sortable: false,
            render: (_v: unknown, row: FleetDeposit) => {
              // Nothing to decide on a deposit somebody has already decided,
              // and a cash collector never decides at all.
              if (row.status !== "PENDING" || !canViewFinancials) {
                return <span className="text-xs text-sand-500">n/a</span>;
              }
              return (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => confirm(row)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-forest-600 text-white text-xs font-medium hover:bg-forest-700 disabled:opacity-50"
                  >
                    <Check size={12} aria-hidden="true" />
                    {t("cashDesk.confirmDeposit")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setRejecting(row); setReason(""); }}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 disabled:opacity-50"
                  >
                    <X size={12} aria-hidden="true" />
                    {t("cashDesk.rejectDeposit")}
                  </button>
                </span>
              );
            },
          },
        ]}
        data={deposits}
        emptyMessage={t("cashDesk.noDeposits")}
      />

      {rejecting && (
        <div className="px-5 py-4 border-t border-sand-200 space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-secondary">
              {t("cashDesk.rejectReasonLabel")}
            </span>
            <textarea
              dir="auto"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="px-3 py-2 rounded-xl border border-sand-300 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={reject}
              className="h-9 px-4 rounded-pill bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {t("cashDesk.rejectDeposit")}
            </button>
            <button
              type="button"
              onClick={() => { setRejecting(null); setReason(""); }}
              className="h-9 px-4 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
