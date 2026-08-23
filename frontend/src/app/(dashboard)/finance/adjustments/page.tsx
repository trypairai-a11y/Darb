"use client";
// Darb 2.0 — /finance/adjustments: manual wallet corrections (ADMIN).
// Wallet picker → direction → amount → mandatory reason → ConfirmModal with
// before/after balances → POST /api/wallets/adjustments; audit table below.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { walletsApi, unwrapList } from "@/lib/darbApi";
import type { WalletAccount, WalletAdjustment, WalletEntryDirection } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";

function accountLabel(account: WalletAccount): string {
  if (account.ownerName) return `${account.ownerName} — ${account.ownerKey}`;
  return account.ownerKey;
}

export default function AdjustmentsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState<WalletEntryDirection>("DEBIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["darb", "wallet-accounts"],
    queryFn: () => walletsApi.accounts(),
  });
  const accounts = useMemo(() => unwrapList<WalletAccount>(accountsQuery.data), [accountsQuery.data]);
  const account = accounts.find((a) => a.id === accountId);

  const auditQuery = useQuery({
    queryKey: ["darb", "wallet-adjustments"],
    queryFn: () => walletsApi.adjustments(),
    retry: false,
  });
  const audit = useMemo(() => unwrapList<WalletAdjustment>(auditQuery.data), [auditQuery.data]);

  const numericAmount = Number(amount);
  const validAmount = Number.isFinite(numericAmount) && numericAmount > 0;
  const before = account ? Number(account.balanceKwd) || 0 : 0;
  const after = direction === "DEBIT" ? before + numericAmount : before - numericAmount;
  const canSubmit = !!account && validAmount && reason.trim().length > 0;

  async function handleApply() {
    if (!canSubmit || !account) return;
    setSaving(true);
    try {
      await walletsApi.createAdjustment({
        accountId: account.id,
        direction,
        amountKwd: numericAmount.toFixed(3),
        reason: reason.trim(),
      });
      toast.success(t("wallet.adjustmentApplied"));
      setConfirming(false);
      setAmount("");
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["darb", "wallet-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["darb", "wallet-adjustments"] }),
      ]);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: "createdAt",
      label: t("wallet.date"),
      render: (v: string) => <span dir="ltr">{formatDateTime(v, locale)}</span>,
    },
    {
      key: "account",
      label: t("wallet.account"),
      sortable: false,
      render: (v: WalletAdjustment["account"], row: WalletAdjustment) => (
        <span className="font-mono text-xs">
          {v ? accountLabel(v) : accounts.find((a) => a.id === row.accountId)?.ownerKey ?? row.accountId}
        </span>
      ),
    },
    {
      key: "direction",
      label: t("wallet.direction"),
      render: (v: WalletEntryDirection) => (
        <span
          className={
            v === "DEBIT"
              ? "inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium bg-green-50 text-green-700"
              : "inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium bg-red-50 text-red-600"
          }
        >
          {v === "DEBIT" ? t("wallet.debit") : t("wallet.credit")}
        </span>
      ),
    },
    {
      key: "amountKwd",
      label: t("wallet.amount"),
      render: (v: WalletAdjustment["amountKwd"]) => (
        <span dir="ltr" className="tabular-nums font-medium">
          {formatKwd(v, locale)}
        </span>
      ),
    },
    {
      key: "reason",
      label: t("wallet.reason"),
      sortable: false,
      render: (v: string) => <span dir="auto">{v}</span>,
    },
    {
      key: "createdBy",
      label: t("common.user"),
      sortable: false,
      render: (v: WalletAdjustment["createdBy"]) =>
        v?.name ? <span dir="auto">{v.name}</span> : <span className="text-sand-400">—</span>,
    },
  ];

  if (accountsQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={6} />;
  if (accountsQuery.error) {
    return (
      <ErrorState
        error={
          accountsQuery.error instanceof Error ? accountsQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => accountsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("wallet.adjustmentsTitle")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("wallet.adjustmentsSubtitle")}</p>
      </div>

      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 space-y-4 max-w-2xl">
        <h2 className="font-medium text-sand-900 flex items-center gap-2">
          <Scale size={16} aria-hidden="true" className="text-primary" />
          {t("wallet.applyAdjustment")}
        </h2>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) setConfirming(true);
          }}
        >
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("wallet.account")}
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            >
              <option value="">{t("wallet.selectAccount")}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)} — {formatKwd(a.balanceKwd, locale)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("wallet.direction")}
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as WalletEntryDirection)}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="DEBIT">{t("wallet.debitOption")}</option>
                <option value="CREDIT">{t("wallet.creditOption")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("wallet.amount")}
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("wallet.reason")}
            </label>
            <input
              type="text"
              dir="auto"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
            <p className="text-xs text-sand-600 mt-1.5">{t("wallet.reasonRequired")}</p>
          </div>

          {account && validAmount && (
            <div className="flex items-center gap-4 text-sm bg-sand-100/60 rounded-xl px-4 py-3">
              <span className="text-sand-600">{t("wallet.beforeBalance")}:</span>
              <span dir="ltr" className="tabular-nums font-medium">
                {formatKwd(before, locale)}
              </span>
              <span className="text-sand-400" aria-hidden="true">
                →
              </span>
              <span className="text-sand-600">{t("wallet.afterBalance")}:</span>
              <span dir="ltr" className="tabular-nums font-medium">
                {formatKwd(after, locale)}
              </span>
            </div>
          )}

          <button type="submit" disabled={!canSubmit} className="btn-primary px-5 h-10 disabled:opacity-50">
            {t("wallet.applyAdjustment")}
          </button>
        </form>
      </div>

      <div>
        <h2 className="font-medium text-sand-900 mb-3">{t("wallet.auditLog")}</h2>
        {auditQuery.isError ? (
          <p className="text-sm text-sand-600">{t("errors.noData")}</p>
        ) : (
          <DataTable
            columns={columns}
            data={audit}
            loading={auditQuery.isLoading}
            exportFilename="wallet-adjustments"
            emptyMessage={t("errors.noData")}
          />
        )}
      </div>

      <ConfirmModal
        open={confirming}
        title={t("wallet.adjustConfirmTitle")}
        message={t("wallet.adjustConfirmMessage")
          .replace("{before}", formatKwd(before, locale))
          .replace("{after}", formatKwd(after, locale))}
        variant="warning"
        loading={saving}
        confirmLabel={t("wallet.applyAdjustment")}
        onConfirm={() => void handleApply()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
