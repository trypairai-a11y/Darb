"use client";
// Revision 24 (#7) — Finance › Settle accounts.
//
// "There should be one more tab for settling accounts with the vendors and
// delivery companies. So if the amount is transferred, the action we will take
// is pressing either Settled or Partially settled."
//
// One row per monthly statement that has money in it: a shop's statement
// (either direction) or a delivery company's payout statement. The amount due
// is the statement's own figure, so this tab and Shop statements can never
// disagree about what is owed. Settled records the whole remaining balance as
// transferred; Partially settled records an amount and keeps the rest open.
// Both ask for the date and the bank reference, because a settlement nobody
// can trace back to a transfer is a settlement nobody can audit.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ChevronDown, ChevronUp, Coins, Store, Truck } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { useToast } from "@/components/shared/Toast";
import { financeDeskApi } from "@/lib/darbApi";
import type { SettleAccountRow } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatKwd, formatNumber, localeTag } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

type PartyFilter = "ALL" | "VENDOR" | "FLEET";
type StateFilter = "open" | "settled" | "all";
type Action = "SETTLED" | "PARTIALLY_SETTLED";

const STATE_TONE: Record<SettleAccountRow["state"], string> = {
  OPEN: "bg-amber-100 text-amber-700",
  PARTIALLY_SETTLED: "bg-sky-100 text-sky-700",
  SETTLED: "bg-forest-100 text-forest-700",
};

function rowKey(r: SettleAccountRow) {
  return `${r.partyType}:${r.statementId}`;
}

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Last twelve months, newest first, as YYYY-MM. */
function recentMonths(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export default function SettleAccountsTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isRole } = useRole();
  // The server takes ADMIN or ACCOUNTANT, same as Mark paid on a statement.
  const canSettle = isRole("ADMIN", "ACCOUNTANT");

  const [party, setParty] = useState<PartyFilter>("ALL");
  const [state, setState] = useState<StateFilter>("open");
  const [month, setMonth] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [acting, setActing] = useState<{ row: SettleAccountRow; action: Action } | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["darb", "finance", "settlements", party, state, month],
    queryFn: () =>
      financeDeskApi.settlements({
        partyType: party === "ALL" ? undefined : party,
        state,
        month: month || undefined,
      }),
  });

  const months = useMemo(recentMonths, []);
  const monthLabel = (iso: string) =>
    new Date(iso.length === 7 ? `${iso}-01T00:00:00Z` : iso).toLocaleDateString(localeTag(locale), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

  function openAction(row: SettleAccountRow, action: Action) {
    setActing({ row, action });
    setAmount("");
    setDate(todayIso());
    setReference("");
    setNote("");
  }

  const mutation = useMutation({
    mutationFn: () =>
      financeDeskApi.recordSettlement({
        partyType: acting!.row.partyType,
        statementId: acting!.row.statementId,
        action: acting!.action,
        amountKwd: acting!.action === "PARTIALLY_SETTLED" ? amount.trim() : undefined,
        transferredAt: date,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t("settleAccounts.saved"));
      setActing(null);
      void queryClient.invalidateQueries({ queryKey: ["darb", "finance", "settlements"] });
      // The last transfer posts the month's payout, which moves balances.
      void queryClient.invalidateQueries({ queryKey: ["darb", "wallet-accounts"] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message ?? t("errors.savingData"));
    },
  });

  if (query.isLoading) return <PageSkeleton statCards={2} tableRows={6} tableCols={7} />;
  if (query.error || !query.data) {
    return (
      <ErrorState
        error={query.error instanceof Error ? query.error.message : t("errors.loadingData")}
        onRetry={() => query.refetch()}
      />
    );
  }

  const rows = query.data.data;
  const totals = query.data.totals;
  const remaining = acting ? Number(acting.row.remainingKwd) : 0;
  const typed = Number(amount);
  const amountValid =
    acting?.action === "SETTLED" ||
    (/^\d+(\.\d{1,3})?$/.test(amount.trim()) && typed > 0 && typed <= remaining);
  const tooHigh = acting?.action === "PARTIALLY_SETTLED" && typed > remaining;

  return (
    <div className="space-y-4" data-testid="settle-accounts-tab">
      <div>
        <h2 className="font-display text-xl text-sand-900">{t("settleAccounts.title")}</h2>
        <p className="text-sm text-sand-600 mt-1">{t("settleAccounts.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t("settleAccounts.owedByDarb"), value: formatKwd(totals.owedByDarbKwd, locale), testId: "settle-owed-by-darb" },
          { label: t("settleAccounts.owedToDarb"), value: formatKwd(totals.owedToDarbKwd, locale), testId: "settle-owed-to-darb" },
          { label: t("settleAccounts.openCount"), value: formatNumber(totals.open, locale), testId: "settle-open" },
          { label: t("settleAccounts.partialCount"), value: formatNumber(totals.partial, locale), testId: "settle-partial" },
        ].map((card) => (
          <div key={card.testId} className="bg-card border border-sand-200 rounded-2xl shadow-soft p-4">
            <p className="text-xs text-sand-600">{card.label}</p>
            <p className="font-display text-xl text-sand-900 tabular-nums mt-1" dir="ltr" data-testid={card.testId}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-sand-100 rounded-pill p-1">
          {(["open", "settled", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={cn(
                "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
                state === s ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
              )}
            >
              {t(s === "open" ? "settleAccounts.stateOpen" : s === "settled" ? "settleAccounts.stateSettled" : "settleAccounts.stateAll")}
            </button>
          ))}
        </div>
        <select
          value={party}
          onChange={(e) => setParty(e.target.value as PartyFilter)}
          aria-label={t("settleAccounts.party")}
          className="h-9 px-3 rounded-pill border border-sand-200 bg-card text-sm"
        >
          <option value="ALL">{t("settleAccounts.partyAll")}</option>
          <option value="VENDOR">{t("settleAccounts.partyVendors")}</option>
          <option value="FLEET">{t("settleAccounts.partyFleets")}</option>
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label={t("settleAccounts.month")}
          className="h-9 px-3 rounded-pill border border-sand-200 bg-card text-sm"
        >
          <option value="">{t("settleAccounts.allMonths")}</option>
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
      </div>

      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand-50 text-sand-600">
              <tr>
                <th className="text-start font-medium px-4 py-3">{t("settleAccounts.party")}</th>
                <th className="text-start font-medium px-4 py-3">{t("settleAccounts.period")}</th>
                <th className="text-start font-medium px-4 py-3">{t("settleAccounts.direction")}</th>
                <th className="text-end font-medium px-4 py-3">{t("settleAccounts.due")}</th>
                <th className="text-end font-medium px-4 py-3">{t("settleAccounts.settled")}</th>
                <th className="text-end font-medium px-4 py-3">{t("settleAccounts.remaining")}</th>
                <th className="text-start font-medium px-4 py-3">{t("settleAccounts.status")}</th>
                {canSettle && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canSettle ? 8 : 7} className="px-4 py-10 text-center text-sand-500">
                    {t("settleAccounts.empty")}
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const key = rowKey(row);
                const isOpen = expanded === key;
                return (
                  <SettleRow
                    key={key}
                    row={row}
                    open={isOpen}
                    canSettle={canSettle}
                    monthLabel={monthLabel(row.periodStart)}
                    onToggle={() => setExpanded(isOpen ? null : key)}
                    onAction={(action) => openAction(row, action)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SlidePanel
        open={!!acting}
        onClose={() => setActing(null)}
        title={acting?.action === "SETTLED" ? t("settleAccounts.dialogSettled") : t("settleAccounts.dialogPartial")}
        subtitle={acting ? `${acting.row.partyName} · ${monthLabel(acting.row.periodStart)}` : undefined}
      >
        {acting && (
          <form
            className="space-y-4"
            data-testid="settle-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (amountValid && date && !mutation.isPending) mutation.mutate();
            }}
          >
            <div className="rounded-xl bg-sand-50 border border-sand-200 p-3 text-sm space-y-1">
              <p className="flex justify-between gap-3">
                <span className="text-sand-600">{t("settleAccounts.due")}</span>
                <span dir="ltr" className="tabular-nums">{formatKwd(acting.row.amountDueKwd, locale)}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span className="text-sand-600">{t("settleAccounts.remaining")}</span>
                <span dir="ltr" className="tabular-nums font-medium text-sand-900">
                  {formatKwd(acting.row.remainingKwd, locale)}
                </span>
              </p>
            </div>

            {acting.action === "SETTLED" ? (
              <p className="text-sm text-sand-700">
                {t("settleAccounts.fullAmount").replace("{amount}", formatKwd(acting.row.remainingKwd, locale))}
              </p>
            ) : (
              <div>
                <label className="block text-xs font-medium text-sand-700 mb-1.5" htmlFor="settle-amount">
                  {t("settleAccounts.amountTransferred")} *
                </label>
                <input
                  id="settle-amount"
                  type="number"
                  min="0"
                  step="0.001"
                  dir="ltr"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="settle-amount"
                  className={cn(
                    "w-full h-10 px-3 rounded-xl border bg-card text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary",
                    tooHigh ? "border-red-400" : "border-sand-300",
                  )}
                />
                {tooHigh ? (
                  <p className="text-xs text-red-600 mt-1">{t("settleAccounts.amountTooHigh")}</p>
                ) : amountValid ? (
                  <p className="text-xs text-sand-600 mt-1">
                    {t("settleAccounts.remainingAfter").replace(
                      "{amount}",
                      formatKwd((remaining - typed).toFixed(3), locale),
                    )}
                  </p>
                ) : null}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5" htmlFor="settle-date">
                {t("settleAccounts.transferDate")} *
              </label>
              <input
                id="settle-date"
                type="date"
                dir="ltr"
                max={todayIso()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-sand-300 bg-card text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5" htmlFor="settle-reference">
                {t("settleAccounts.reference")}
              </label>
              <input
                id="settle-reference"
                dir="ltr"
                maxLength={120}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t("settleAccounts.referencePlaceholder")}
                className="w-full h-10 px-3 rounded-xl border border-sand-300 bg-card text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5" htmlFor="settle-note">
                {t("settleAccounts.note")}
              </label>
              <textarea
                id="settle-note"
                dir="auto"
                maxLength={500}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand-300 bg-card text-sm"
              />
            </div>

            <p className="text-xs text-sand-500">
              {acting.row.flow === "PARTY_PAYS" ? t("settleAccounts.partyPaysNote") : t("settleAccounts.ledgerNote")}
            </p>

            <button
              type="submit"
              disabled={!amountValid || !date || mutation.isPending}
              data-testid="settle-submit"
              className="w-full h-10 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
            >
              {mutation.isPending ? t("common.processing") : t("settleAccounts.save")}
            </button>
          </form>
        )}
      </SlidePanel>
    </div>
  );
}

function SettleRow({
  row,
  open,
  canSettle,
  monthLabel,
  onToggle,
  onAction,
}: {
  row: SettleAccountRow;
  open: boolean;
  canSettle: boolean;
  monthLabel: string;
  onToggle: () => void;
  onAction: (action: Action) => void;
}) {
  const { t, locale } = useI18n();
  const cols = canSettle ? 8 : 7;
  return (
    <>
      <tr
        className={cn("hover:bg-sand-50/60 cursor-pointer", open && "bg-sand-50/60")}
        onClick={onToggle}
        data-testid="settle-row"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {open ? (
              <ChevronUp size={14} className="text-sand-400 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown size={14} className="text-sand-400 shrink-0" aria-hidden="true" />
            )}
            {row.partyType === "VENDOR" ? (
              <Store size={14} className="text-sand-400 shrink-0" aria-hidden="true" />
            ) : (
              <Truck size={14} className="text-sand-400 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="font-medium text-sand-900 truncate" dir="auto">{row.partyName}</p>
              <p className="text-xs text-sand-500">{t(`settleAccounts.party${row.partyType}`)}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sand-700 whitespace-nowrap">{monthLabel}</td>
        <td className="px-4 py-3 text-xs">
          <span className={row.flow === "DARB_PAYS" ? "text-sand-700" : "text-amber-700"}>
            {t(`settleAccounts.flow${row.flow}`)}
          </span>
        </td>
        <td className="px-4 py-3 text-end tabular-nums" dir="ltr">{formatKwd(row.amountDueKwd, locale)}</td>
        <td className="px-4 py-3 text-end tabular-nums" dir="ltr">{formatKwd(row.settledKwd, locale)}</td>
        <td className="px-4 py-3 text-end tabular-nums font-medium text-sand-900" dir="ltr" data-testid="settle-remaining">
          {formatKwd(row.remainingKwd, locale)}
        </td>
        <td className="px-4 py-3">
          <span className={cn("px-2 py-0.5 rounded-pill text-xs font-medium whitespace-nowrap", STATE_TONE[row.state])} data-testid="settle-state">
            {t(`settleAccounts.state${row.state}`)}
          </span>
          {row.paidOutsideSettlement && (
            <span className="block text-[11px] text-sand-500 mt-0.5">{t("settleAccounts.paidElsewhere")}</span>
          )}
          {(row.blockedReason === "NOT_CONFIRMED" || row.blockedReason === "DISPUTED") && (
            <span className="block text-[11px] text-amber-700 mt-0.5">{t(`settleAccounts.blocked${row.blockedReason}`)}</span>
          )}
        </td>
        {canSettle && (
          <td className="px-4 py-3 text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            {row.canSettle && (
              <div className="inline-flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onAction("SETTLED")}
                  data-testid="settle-mark-settled"
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-pill bg-primary text-white text-xs font-medium hover:bg-primary-hover"
                >
                  <CheckCheck size={12} aria-hidden="true" />
                  {t("settleAccounts.markSettled")}
                </button>
                <button
                  type="button"
                  onClick={() => onAction("PARTIALLY_SETTLED")}
                  data-testid="settle-mark-partial"
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200"
                >
                  <Coins size={12} aria-hidden="true" />
                  {t("settleAccounts.markPartial")}
                </button>
              </div>
            )}
          </td>
        )}
      </tr>
      {open && (
        <tr>
          <td colSpan={cols} className="px-4 pb-4 pt-1 bg-sand-50/60">
            <p className="text-xs font-medium text-sand-600 py-2">{t("settleAccounts.history")}</p>
            {row.transfers.length === 0 ? (
              <p className="text-xs text-sand-600 pb-2">{t("settleAccounts.noHistory")}</p>
            ) : (
              <table className="w-full text-xs" data-testid="settle-history">
                <thead className="text-sand-500">
                  <tr>
                    <th className="text-start font-medium px-3 py-2">{t("settleAccounts.transferDate")}</th>
                    <th className="text-end font-medium px-3 py-2">{t("settleAccounts.settled")}</th>
                    <th className="text-end font-medium px-3 py-2">{t("settleAccounts.remaining")}</th>
                    <th className="text-start font-medium px-3 py-2">{t("settleAccounts.reference")}</th>
                    <th className="text-start font-medium px-3 py-2">{t("settleAccounts.note")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {row.transfers.map((tr) => (
                    <tr key={tr.id}>
                      <td className="px-3 py-2 text-sand-700 whitespace-nowrap">
                        {formatDate(tr.transferredAt, locale)}
                        {tr.createdByName && (
                          <span className="block text-sand-500">
                            {t("settleAccounts.by").replace("{name}", tr.createdByName)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums text-sand-900" dir="ltr">{formatKwd(tr.amountKwd, locale)}</td>
                      <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{formatKwd(tr.remainingKwd, locale)}</td>
                      <td className="px-3 py-2 font-mono text-sand-700" dir="ltr">{tr.reference ?? "n/a"}</td>
                      <td className="px-3 py-2 text-sand-700" dir="auto">{tr.note ?? "n/a"}</td>
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
