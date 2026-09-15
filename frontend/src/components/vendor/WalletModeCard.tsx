"use client";
// Vendor-portal note #3 (2026-09-15) — one wallet for the shop, or one per
// branch, with manual transfers between them.
//
// Client's words: "there should be a button for using the whole vendor account
// as one wallet, or to segregate each branch with its own wallet... the vendor
// will top up the main wallet and manually transfer to each branch wallet".
//
// The thing this card must never imply is that the money has been split into
// separate accounts. It has not: the ledger is one account, `VENDOR:{id}`, in
// both modes, and switching moves nothing. What the per-branch mode adds is a
// spending limit per counter that the shop sets itself. So the card always
// shows the account total at the top, and the branch figures underneath add up
// to it — which is also what stops the "where did my balance go" support call
// the first time somebody flips the switch.
//
// Changing the mode and moving money are OWNER-only. The controls are hidden
// for everybody else as well as refused by the endpoint, so nobody is shown a
// button that answers 403.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Building2, Wallet } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import SlidePanel from "@/components/shared/SlidePanel";
import { vendorApi } from "@/lib/darbApi";
import type { VendorWalletMode } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";
import { cn } from "@/lib/cn";

export default function WalletModeCard({ isOwner }: { isOwner: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [transferBranchId, setTransferBranchId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [historyOpen, setHistoryOpen] = useState(false);

  const viewQuery = useQuery({
    queryKey: ["darb", "vendor", "wallet-view"],
    queryFn: () => vendorApi.walletView(),
  });
  const transfersQuery = useQuery({
    queryKey: ["darb", "vendor", "wallet-transfers"],
    queryFn: () => vendorApi.branchTransfers(),
    enabled: historyOpen,
  });

  const view = viewQuery.data;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "wallet-view"] });
    void queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "wallet"] });
    void queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "wallet-transfers"] });
  }

  function failWith(err: unknown) {
    const payload = (err as { response?: { data?: { error?: string; code?: string } } })?.response
      ?.data;
    // The two refusals worth their own sentence: a transfer the pool or the
    // branch cannot cover. Both are ordinary, both are the shop's own money,
    // and a generic "could not save" would send them to support.
    const known =
      payload?.code === "INSUFFICIENT_MAIN_BALANCE"
        ? t("vendorWallet2.insufficientMain")
        : payload?.code === "INSUFFICIENT_BRANCH_BALANCE"
          ? t("vendorWallet2.insufficientBranch")
          : payload?.code === "WALLET_MODE_SINGLE"
            ? t("vendorWallet2.modeSingleOnly")
            : null;
    toast.error(known ?? payload?.error ?? t("errors.savingData"));
  }

  const modeMutation = useMutation({
    mutationFn: (mode: VendorWalletMode) => vendorApi.setWalletMode(mode),
    onSuccess: () => {
      toast.success(t("vendorWallet2.modeSaved"));
      refresh();
    },
    onError: failWith,
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      vendorApi.transferToBranch({
        branchId: transferBranchId!,
        // A negative amount returns money to the pool. One endpoint, two
        // directions, so the two can never disagree about what "available"
        // means.
        amountKwd: direction === "IN" ? Number(amount) : -Number(amount),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success(t("vendorWallet2.transferred"));
      setTransferBranchId(null);
      setAmount("");
      setNote("");
      refresh();
    },
    onError: failWith,
  });

  if (!view) return null;
  const perBranch = view.mode === "PER_BRANCH";

  return (
    <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-sand-900">{t("vendorWallet2.modeTitle")}</h2>
          {!isOwner && <p className="text-xs text-sand-500 mt-1">{t("vendorWallet2.ownerOnly")}</p>}
        </div>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="h-9 px-4 rounded-pill border border-sand-200 text-sand-700 text-sm"
        >
          {t("vendorWallet2.transfers")}
        </button>
      </div>

      {/* ── The switch ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(["SINGLE", "PER_BRANCH"] as const).map((mode) => {
          const active = view.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              disabled={!isOwner || modeMutation.isPending}
              onClick={() => !active && modeMutation.mutate(mode)}
              className={cn(
                "text-start rounded-2xl border p-4 transition-colors",
                active ? "border-primary bg-primary/5" : "border-sand-200 hover:bg-sand-50",
                !isOwner && "cursor-default opacity-80",
              )}
            >
              <div className="flex items-center gap-2">
                {mode === "SINGLE" ? (
                  <Wallet size={15} className="text-sand-500" aria-hidden="true" />
                ) : (
                  <Building2 size={15} className="text-sand-500" aria-hidden="true" />
                )}
                <span className={cn("text-sm font-medium", active ? "text-primary" : "text-sand-900")}>
                  {t(mode === "SINGLE" ? "vendorWallet2.modeSingle" : "vendorWallet2.modePerBranch")}
                </span>
              </div>
              <p className="text-xs text-sand-600 mt-1">
                {t(
                  mode === "SINGLE"
                    ? "vendorWallet2.modeSingleHint"
                    : "vendorWallet2.modePerBranchHint",
                )}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── The wallets ─────────────────────────────────────────────────── */}
      <div className="border-t border-sand-100 pt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-sand-50">
          <div>
            <p className="text-sm font-medium text-sand-900">{t("vendorWallet2.mainWallet")}</p>
            <p className="text-xs text-sand-500">{t("vendorWallet2.mainStatementHint")}</p>
          </div>
          <p dir="ltr" className="font-display text-lg text-sand-900 tabular-nums shrink-0">
            {formatKwd(view.mainAvailableKwd, locale)}
          </p>
        </div>

        {/* Branch rows are shown in both modes, because the derived figures are
            real in both: what changes in PER_BRANCH is that the shop can put
            money against them. Hiding them in SINGLE would make the switch
            look like it creates data rather than a limit. */}
        {view.branches.map((b) => (
          <div
            key={b.branchId}
            className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-2xl border border-sand-100"
          >
            <div className="min-w-0">
              <p className="text-sm text-sand-900 truncate">{b.branchName}</p>
              <p className="text-xs text-sand-500">
                {t("vendorWallet2.spent")}: {formatKwd(b.derivedKwd, locale)}
                {perBranch ? ` · ${t("vendorWallet2.allocated")}: ${formatKwd(b.allocatedKwd, locale)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p
                dir="ltr"
                className={cn(
                  "tabular-nums font-medium",
                  perBranch && Number(b.availableKwd) <= 0 ? "text-red-600" : "text-sand-900",
                )}
              >
                {formatKwd(b.availableKwd, locale)}
              </p>
              {perBranch && isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setTransferBranchId(b.branchId);
                    setDirection("IN");
                    setAmount("");
                    setNote("");
                  }}
                  title={t("vendorWallet2.transfer")}
                  className="h-8 w-8 rounded-pill grid place-items-center text-primary hover:bg-primary/10"
                >
                  <ArrowLeftRight size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* The consequence of an empty branch wallet, said out loud where the
            zero is: intake refuses that branch's orders in this mode. */}
        {perBranch && view.branches.some((b) => Number(b.availableKwd) <= 0) && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-2xl px-3 py-2">
            {t("vendorWallet2.branchEmpty")}
          </p>
        )}
      </div>

      {/* ── Move money ──────────────────────────────────────────────────── */}
      <SlidePanel
        open={transferBranchId !== null}
        onClose={() => setTransferBranchId(null)}
        title={t("vendorWallet2.transfer")}
        subtitle={view.branches.find((b) => b.branchId === transferBranchId)?.branchName}
      >
        <div className="space-y-4">
          <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit">
            {(["IN", "OUT"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={cn(
                  "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
                  direction === d
                    ? "bg-white text-sand-900 shadow-soft"
                    : "text-sand-600 hover:text-sand-900",
                )}
              >
                {t(d === "IN" ? "vendorWallet2.transferTo" : "vendorWallet2.transferBack")}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("vendorWallet2.transferAmount")}
            </label>
            <input
              type="number"
              min="0"
              step="0.001"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-10 px-3 rounded-pill border border-sand-200 bg-card text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("vendorWallet2.transferNote")}
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full h-10 px-3 rounded-pill border border-sand-200 bg-card text-sm"
            />
          </div>
          <button
            type="button"
            disabled={!amount || Number(amount) <= 0 || transferMutation.isPending}
            onClick={() => transferMutation.mutate()}
            className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          >
            {t("vendorWallet2.transfer")}
          </button>
        </div>
      </SlidePanel>

      {/* ── The transfer history ────────────────────────────────────────── */}
      <SlidePanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={t("vendorWallet2.transfers")}
      >
        {(transfersQuery.data?.data ?? []).length === 0 ? (
          <p className="text-sm text-sand-500">{t("vendorWallet2.noTransfers")}</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {(transfersQuery.data?.data ?? []).map((tr) => (
              <li key={tr.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-sand-900">{tr.branch.name}</p>
                  <p className="text-xs text-sand-500">
                    {formatDateTime(tr.createdAt, locale)}
                    {tr.createdBy ? ` · ${tr.createdBy.name}` : ""}
                  </p>
                  {tr.note && <p className="text-xs text-sand-600 mt-0.5">{tr.note}</p>}
                </div>
                <p
                  dir="ltr"
                  className={cn(
                    "tabular-nums font-medium shrink-0",
                    Number(tr.amountKwd) >= 0 ? "text-forest-700" : "text-sand-600",
                  )}
                >
                  {Number(tr.amountKwd) >= 0 ? "+" : ""}
                  {formatKwd(tr.amountKwd, locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SlidePanel>
    </section>
  );
}
