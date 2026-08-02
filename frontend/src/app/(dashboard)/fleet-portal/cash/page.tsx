"use client";
// Darb 2.0 — /fleet-portal/cash (revision 14): the delivery company's own cash
// account with Darb.
//
// Two halves, and the difference between them is the whole feature. A DEPOSIT
// is an intent to pay: it credits nothing, an accountant at Darb confirms the
// money arrived, and the form says so rather than letting a company think it
// has topped itself up. A SETTLEMENT spends an already-confirmed balance and
// needs nobody's approval, because the money has been Darb's since that
// confirmation. That is the point of prepaying: a driver who handed cash to
// their supervisor on Monday does not wait on Darb's back office to stop
// reading as owing it.
//
// The settle form submits ALL OR NOTHING. One line the server refuses settles
// none of them, and the error says so, because a half-applied settlement is the
// one outcome neither side can reconcile afterwards.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, ExternalLink, Link2, Wallet, X } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import StatCard from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { fleetApi } from "@/lib/darbApi";
import type { FleetCashDriver, FleetDeposit } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";

export default function FleetCashPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  /** driverId → the amount typed for that driver. Absent means not settling. */
  const [lines, setLines] = useState<Record<string, string>>({});
  /**
   * Settlement asks first (client report, 2026-08-01).
   *
   * The batch settle sat beside Fill every driver, same pill, same size, one
   * press apart. The client pressed it expecting to fill and moved KD 1,420.084
   * across 37 drivers instantly. Nothing on the fleet side can undo that: a
   * settlement is a posted ledger entry, and the reversal is an accountant at
   * Darb writing a compensating one. An irreversible action that adjacent to a
   * harmless one has to stop and ask.
   */
  const [confirming, setConfirming] = useState(false);

  const cashQuery = useQuery({
    queryKey: ["darb", "fleet", "cash"],
    queryFn: () => fleetApi.cash(),
  });
  const settlementsQuery = useQuery({
    queryKey: ["darb", "fleet", "cash", "settlements"],
    queryFn: () => fleetApi.cashSettlements(),
  });

  const data = cashQuery.data;

  /**
   * What the typed lines add up to, and whether the balance covers them.
   *
   * Checked here as well as on the server, and the server is the authority: a
   * balance read a minute ago can be spent by the owner on another screen. This
   * exists so the common case reads as a disabled button with a reason rather
   * than a round trip that fails.
   */
  const totals = useMemo(() => {
    let total = 0;
    let count = 0;
    let overDriver = false;
    for (const driver of data?.drivers ?? []) {
      const raw = lines[driver.driverId];
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) continue;
      if (value > Number(driver.cashOnHandKwd)) overDriver = true;
      total += value;
      count += 1;
    }
    const balance = Number(data?.balanceKwd ?? 0);
    return { total, count, overDriver, overBalance: total > balance + 1e-9 };
  }, [lines, data]);

  if (cashQuery.isLoading) return <PageSkeleton statCards={3} tableRows={6} tableCols={4} />;
  if (cashQuery.error) {
    return (
      <ErrorState
        error={
          cashQuery.error instanceof Error ? cashQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => cashQuery.refetch()}
      />
    );
  }

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "cash"] }),
      // The roster shows cash-on-hand per driver, so a settlement changes it.
      queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "drivers"] }),
    ]);

  const fail = (err: unknown) =>
    toast.error(
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave"),
    );

  async function submitDeposit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      const deposit = await fleetApi.createDeposit({
        amountKwd: value.toFixed(3),
        note: note.trim() || undefined,
      });
      toast.success(`${t("fleetCash.depositSubmitted")} ${deposit.reference}`);
      setAmount("");
      setNote("");
      await refresh();
      // The link IS the deposit, so open it rather than leaving the company to
      // hunt for it in a table it has not scrolled to yet. A blocked popup is
      // survivable: the Pay button on the row below goes to the same place.
      if (deposit.paymentUrl) {
        window.open(deposit.paymentUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function cancelDeposit(row: FleetDeposit) {
    try {
      await fleetApi.cancelDeposit(row.id);
      toast.success(t("fleetCash.depositWithdrawn"));
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function settle() {
    setConfirming(false);
    const payload = Object.entries(lines)
      .map(([driverId, raw]) => ({ driverId, amountKwd: Number(raw) }))
      .filter((l) => Number.isFinite(l.amountKwd) && l.amountKwd > 0)
      .map((l) => ({ driverId: l.driverId, amountKwd: l.amountKwd.toFixed(3) }));
    if (payload.length === 0) return;

    setSaving(true);
    try {
      const result = await fleetApi.settleDriverCash(payload);
      toast.success(
        `${t("fleetCash.settled")}: ${result.lines.length} / ${formatKwd(result.totalKwd, locale)}`,
      );
      setLines({});
      await Promise.all([refresh(), settlementsQuery.refetch()]);
    } catch (err) {
      // Nothing was written. The server's message already says which line was
      // the problem; what matters is that the company does not go looking for
      // the other nine as though they had gone through.
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  const setLine = (driverId: string, value: string) =>
    setLines((prev) => {
      const next = { ...prev };
      if (!value) delete next[driverId];
      else next[driverId] = value;
      return next;
    });

  /** Fill every row with what that driver is carrying, up to the balance. */
  function settleAll() {
    const next: Record<string, string> = {};
    let remaining = Number(data?.balanceKwd ?? 0);
    for (const driver of data?.drivers ?? []) {
      const owed = Number(driver.cashOnHandKwd);
      if (owed <= 0 || remaining <= 0) continue;
      const take = Math.min(owed, remaining);
      next[driver.driverId] = take.toFixed(3);
      remaining -= take;
    }
    setLines(next);
  }

  const deposits = data?.deposits ?? [];
  const drivers = data?.drivers ?? [];
  const settlements = settlementsQuery.data ?? [];

  const canSettle =
    totals.count > 0 && !totals.overBalance && !totals.overDriver && !saving;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("fleetCash.title")}</h1>
        <p className="text-sm text-sand-600 mt-1" dir="auto">{t("fleetCash.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t("fleetCash.balance")}
          value={formatKwd(data?.balanceKwd ?? "0", locale)}
          icon={Wallet}
          highlight
        />
        <StatCard
          title={t("fleetCash.driversHolding")}
          value={formatKwd(data?.driverCashOutstandingKwd ?? "0", locale)}
          icon={Banknote}
        />
        <StatCard
          title={t("fleetCash.awaitingDarb")}
          value={formatKwd(data?.pendingDepositsKwd ?? "0", locale)}
        />
      </div>

      {/* ── Deposit ───────────────────────────────────────────────────── */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
        <header className="px-5 py-4 border-b border-sand-200">
          <h2 className="text-sm font-medium text-sand-900">{t("fleetCash.depositTitle")}</h2>
          <p className="text-xs text-sand-600 mt-0.5" dir="auto">
            {t("fleetCash.depositHint")}
          </p>
        </header>
        <div className="p-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-secondary">{t("fleetCash.amount")}</span>
            <input
              type="number"
              min="0"
              step="0.001"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 w-40 px-3 rounded-xl border border-sand-300 bg-card text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <span className="text-xs font-medium text-secondary">{t("fleetCash.note")}</span>
            <input
              type="text"
              dir="auto"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("fleetCash.notePlaceholder")}
              className="h-10 px-3 rounded-xl border border-sand-300 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <button
            type="button"
            data-testid="fleet-deposit-create-link"
            onClick={submitDeposit}
            disabled={saving || !amount || Number(amount) <= 0}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Link2 size={14} aria-hidden="true" />
            {t("fleetCash.submitDeposit")}
          </button>
        </div>

        {deposits.length > 0 && (
          <div className="border-t border-sand-200">
            <DataTable
              columns={[
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
                  key: "createdAt",
                  label: t("fleetCash.submittedAt"),
                  render: (value: string) => (
                    <span dir="ltr" className="tabular-nums text-sm">
                      {formatDateTime(value, locale)}
                    </span>
                  ),
                },
                {
                  key: "status",
                  label: t("fleetCash.status"),
                  render: (value: string, row: FleetDeposit) => (
                    <span className="inline-flex items-center gap-2">
                      <StatusBadge status={value} />
                      {value === "REJECTED" && row.rejectReason && (
                        <span className="text-xs text-red-600" dir="auto">
                          {row.rejectReason}
                        </span>
                      )}
                    </span>
                  ),
                },
                {
                  key: "id",
                  label: "",
                  sortable: false,
                  render: (_v: unknown, row: FleetDeposit) =>
                    // Only a deposit Darb has not acted on can be paid or taken
                    // back. The link is the deposit, so Pay comes first.
                    row.status === "PENDING" ? (
                      <span className="flex items-center gap-2">
                        {row.paymentUrl && (
                          <a
                            href={row.paymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="fleet-deposit-pay-link"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-primary text-white text-xs font-medium hover:bg-primary-hover"
                          >
                            <ExternalLink size={12} aria-hidden="true" />
                            {t("fleetCash.payNow")}
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => cancelDeposit(row)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200"
                        >
                          <X size={12} aria-hidden="true" />
                          {t("fleetCash.withdraw")}
                        </button>
                      </span>
                    ) : (
                      <span className="text-xs text-sand-500">n/a</span>
                    ),
                },
              ]}
              data={deposits}
              emptyMessage={t("fleetCash.noDeposits")}
            />
          </div>
        )}
      </section>

      {/* ── Settle drivers ────────────────────────────────────────────── */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
        <header className="px-5 py-4 border-b border-sand-200 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-medium text-sand-900">{t("fleetCash.settleTitle")}</h2>
            <p className="text-xs text-sand-600 mt-0.5" dir="auto">
              {t("fleetCash.settleHint")}
            </p>
          </div>
          {drivers.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={settleAll}
                className="h-9 px-3.5 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
              >
                {t("fleetCash.fillAll")}
              </button>
              {/*
                Settles every filled line in one press, and sits here because
                that is where the client asked for it: beside Fill every driver,
                the button it is the natural partner to. Fill types the amounts,
                this one commits them.

                It is the same call as Settle now in the bar below, deliberately.
                The pair reads as one motion at the top of a 36-row table, and
                the bar stays because somebody who edits individual lines while
                scrolling still needs the action within reach.
              */}
              <button
                type="button"
                data-testid="fleet-settle-clear-all"
                onClick={() => setConfirming(true)}
                disabled={!canSettle}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-pill bg-primary text-white text-xs font-medium hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Check size={12} aria-hidden="true" />
                {t("fleetCash.clearAll")}
              </button>
            </div>
          )}
        </header>

        {drivers.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-sand-600">
            {t("fleetCash.noDriversOwing")}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-sand-200">
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("fleetPortal.driverName")}
                    </th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("fleetPortal.darbId")}
                    </th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("fleetCash.cashOnHand")}
                    </th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("fleetCash.settleAmount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d: FleetCashDriver) => {
                    const typed = lines[d.driverId] ?? "";
                    const over = typed !== "" && Number(typed) > Number(d.cashOnHandKwd);
                    return (
                      <tr key={d.driverId} className="border-b border-sand-200 last:border-0">
                        <td dir="auto" className="px-5 py-3 text-sm">{d.name}</td>
                        <td dir="ltr" className="px-5 py-3 text-sm font-mono text-sand-600">
                          {d.driverCode ?? "n/a"}
                        </td>
                        <td dir="ltr" className="px-5 py-3 text-sm tabular-nums">
                          {formatKwd(d.cashOnHandKwd, locale)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              dir="ltr"
                              value={typed}
                              onChange={(e) => setLine(d.driverId, e.target.value)}
                              aria-label={t("fleetCash.settleAmount")}
                              className={`h-9 w-32 px-3 rounded-xl border bg-card text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary ${
                                over ? "border-red-400" : "border-sand-300"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setLine(d.driverId, d.cashOnHandKwd)}
                              className="h-9 px-3 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200"
                            >
                              {t("fleetCash.inFull")}
                            </button>
                          </div>
                          {over && (
                            <p className="text-xs text-red-600 mt-1" dir="auto">
                              {t("fleetCash.overDriver")}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/*
              Sticky, and that is the whole point of it.

              The client reported "there is no button to clear the deposits for
              the drivers". There was: this one. But it sat under a table of 36
              drivers, so pressing "Fill every driver" and scrolling the list
              never brought it into view, and the screen read as a form with no
              way to submit it. Pinning the bar to the bottom of the viewport
              means the running total and the action travel with the rows they
              describe, which is also where somebody checking their arithmetic
              wants them.
            */}
            <footer
              data-testid="fleet-settle-bar"
              className="sticky bottom-0 z-10 px-5 py-4 border-t border-sand-200 bg-card/95 backdrop-blur rounded-b-2xl flex items-center justify-between gap-3 flex-wrap"
            >
              <div className="text-sm">
                <span className="text-sand-600">{t("fleetCash.settling")}: </span>
                <span dir="ltr" className="tabular-nums font-medium text-sand-900">
                  {formatKwd(totals.total.toFixed(3), locale)}
                </span>
                <span className="text-sand-600">
                  {" "}
                  / {formatKwd(data?.balanceKwd ?? "0", locale)}
                </span>
                {totals.count > 0 && (
                  <span className="text-sand-600"> ({totals.count})</span>
                )}
                {totals.overBalance && (
                  <p className="text-xs text-red-600 mt-1" dir="auto">
                    {t("fleetCash.overBalance")}
                  </p>
                )}
              </div>
              <button
                type="button"
                data-testid="fleet-settle-submit"
                onClick={() => setConfirming(true)}
                disabled={!canSettle}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Check size={14} aria-hidden="true" />
                {t("fleetCash.settleButton")}
              </button>
            </footer>
          </>
        )}
      </section>

      {/*
        The dialog names the money and the number of drivers, because "are you
        sure" answers nothing. What makes this settlement worth stopping for is
        that the company cannot undo it: reversing one is a compensating entry
        an accountant at Darb has to write.
      */}
      <ConfirmModal
        open={confirming}
        title={t("fleetCash.confirmTitle")}
        message={`${t("fleetCash.confirmBody")} ${formatKwd(
          totals.total.toFixed(3),
          locale,
        )} / ${totals.count}`}
        confirmLabel={t("fleetCash.settleButton")}
        variant="warning"
        loading={saving}
        onConfirm={settle}
        onCancel={() => setConfirming(false)}
      />

      {/* ── What has been settled ─────────────────────────────────────── */}
      {settlements.length > 0 && (
        <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
          <header className="px-5 py-4 border-b border-sand-200">
            <h2 className="text-sm font-medium text-sand-900">{t("fleetCash.historyTitle")}</h2>
          </header>
          <DataTable
            columns={[
              { key: "driverName", label: t("fleetPortal.driverName") },
              {
                key: "driverCode",
                label: t("fleetPortal.darbId"),
                render: (value: string | null) => (
                  <span dir="ltr" className="font-mono text-xs text-sand-600">
                    {value ?? "n/a"}
                  </span>
                ),
              },
              {
                key: "amountKwd",
                label: t("fleetCash.amount"),
                render: (value: string) => (
                  <span dir="ltr" className="tabular-nums">{formatKwd(value, locale)}</span>
                ),
              },
              {
                key: "createdAt",
                label: t("fleetCash.settledAt"),
                render: (value: string) => (
                  <span dir="ltr" className="tabular-nums text-sm">
                    {formatDateTime(value, locale)}
                  </span>
                ),
              },
            ]}
            data={settlements}
            emptyMessage={t("fleetCash.noSettlements")}
          />
        </section>
      )}
    </div>
  );
}
