"use client";
// Darb 2.0 — /finance/remittances: record cash handed in by drivers.
// Driver search → shows current held cash → amount/method/note form →
// POST /api/wallets/remittances; history table below.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import api from "@/lib/api";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { walletsApi, unwrapList, fetchAllPages } from "@/lib/darbApi";
import type { Remittance, RemittanceMethod, WalletAccount } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";

interface DriverOption {
  id: string;
  name: string;
  /** Darb-issued driver ID ("DRB-0001") — the primary remittance search key. */
  driverCode: string | null;
}

const METHODS: RemittanceMethod[] = ["CASH", "BANK_TRANSFER", "AL_MUZAINI"];

export default function RemittancesPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Record<string, string>>({});
  const driverId = filters.driverId || "";
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<RemittanceMethod>("CASH");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const driversQuery = useQuery({
    queryKey: ["darb", "drivers-options"],
    queryFn: async () => {
      const { data } = await api.get("/api/drivers", { params: { limit: 500 } });
      return data;
    },
    staleTime: 120_000,
  });
  const drivers: DriverOption[] = useMemo(() => {
    const list = unwrapList<{
      id: string;
      name?: string;
      fullName?: string;
      driverCode?: string | null;
    }>(driversQuery.data);
    return list.map((d) => ({
      id: d.id,
      name: d.name ?? d.fullName ?? d.id,
      driverCode: d.driverCode ?? null,
    }));
  }, [driversQuery.data]);

  // Paged: one wallet account per driver means the selected driver is usually
  // past the server's 100-row clamp, which rendered "held balance —".
  const accountsQuery = useQuery({
    queryKey: ["darb", "wallet-accounts", "all"],
    queryFn: () => fetchAllPages<WalletAccount>((p) => walletsApi.accounts(p)),
  });
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const heldAccount = driverId
    ? accounts.find((a) => a.ownerType === "DRIVER_CASH" && a.ownerKey === `DRIVER:${driverId}`)
    : undefined;
  const heldBalance = heldAccount ? Number(heldAccount.balanceKwd) || 0 : null;

  const historyQuery = useQuery({
    queryKey: ["darb", "remittances", driverId],
    queryFn: () => walletsApi.remittances(driverId ? { driverId } : undefined),
  });
  const history = useMemo(() => unwrapList<Remittance>(historyQuery.data), [historyQuery.data]);

  async function handleRecord() {
    const value = Number(amount);
    if (!driverId || !Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      await walletsApi.createRemittance({
        driverId,
        amountKwd: value.toFixed(3),
        method,
        note: note.trim() || undefined,
      });
      toast.success(t("wallet.remittanceRecorded"));
      setAmount("");
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["darb", "remittances"] }),
        queryClient.invalidateQueries({ queryKey: ["darb", "wallet-accounts"] }),
      ]);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const methodLabel = (m: RemittanceMethod | string) =>
    m === "CASH"
      ? t("wallet.methodCash")
      : m === "BANK_TRANSFER"
        ? t("wallet.methodBankTransfer")
        : m === "AL_MUZAINI"
          ? t("wallet.methodAlMuzaini")
          : m;

  const columns = [
    {
      key: "createdAt",
      label: t("wallet.date"),
      render: (v: string) => <span dir="ltr">{formatDateTime(v, locale)}</span>,
    },
    {
      key: "driver",
      label: t("wallet.driver"),
      sortable: false,
      render: (v: Remittance["driver"], row: Remittance) => {
        const fallback = drivers.find((d) => d.id === row.driverId);
        const code = v?.driverCode ?? fallback?.driverCode;
        return (
          <span dir="auto" className="inline-flex items-center gap-2">
            <span dir="ltr" className="font-mono text-xs text-sand-600">
              {code ?? "n/a"}
            </span>
            <span>{v?.name ?? fallback?.name ?? row.driverId}</span>
          </span>
        );
      },
    },
    {
      key: "amountKwd",
      label: t("wallet.amount"),
      render: (v: Remittance["amountKwd"]) => (
        <span dir="ltr" className="tabular-nums font-medium">
          {formatKwd(v, locale)}
        </span>
      ),
    },
    {
      key: "method",
      label: t("wallet.method"),
      render: (v: string) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium bg-purple-50 text-purple-600">
          {methodLabel(v)}
        </span>
      ),
    },
    {
      key: "note",
      label: t("wallet.note"),
      sortable: false,
      render: (v: string | null) =>
        v ? <span dir="auto">{v}</span> : <span className="text-sand-400">—</span>,
    },
  ];

  if (accountsQuery.isLoading && historyQuery.isLoading) {
    return <PageSkeleton statCards={1} tableRows={6} tableCols={5} />;
  }
  if (historyQuery.error) {
    return (
      <ErrorState
        error={
          historyQuery.error instanceof Error ? historyQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => historyQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("wallet.remittancesTitle")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("wallet.remittancesSubtitle")}</p>
      </div>

      {/* Record form */}
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 space-y-4 max-w-2xl">
        <h2 className="font-medium text-sand-900 flex items-center gap-2">
          <HandCoins size={16} aria-hidden="true" className="text-primary" />
          {t("wallet.recordRemittance")}
        </h2>

        <FilterBar
          filters={[
            {
              key: "driverId",
              label: t("wallet.driver"),
              type: "driver-search",
              placeholder: t("wallet.searchByDriverId"),
              options: drivers.map((d) => ({
                value: d.id,
                label: d.name,
                code: d.driverCode,
              })),
            },
          ]}
          values={filters}
          onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        />

        {driverId && (
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span dir="ltr" className="font-mono text-xs text-sand-600">
              {drivers.find((d) => d.id === driverId)?.driverCode ?? "n/a"}
            </span>
            <span className="text-sand-600">{t("wallet.heldBalance")}:</span>
            <span dir="ltr" className="font-medium tabular-nums text-sand-900">
              {heldBalance != null ? formatKwd(heldBalance, locale) : "—"}
            </span>
          </div>
        )}

        <form
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void handleRecord();
          }}
        >
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
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("wallet.method")}
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as RemittanceMethod)}
              className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("wallet.note")}
            </label>
            <input
              type="text"
              dir="auto"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={saving || !driverId || !amount}
              className="btn-primary px-5 h-10 disabled:opacity-50"
            >
              {saving ? t("common.processing") : t("wallet.record")}
            </button>
          </div>
        </form>
      </div>

      {/* History */}
      <div>
        <h2 className="font-medium text-sand-900 mb-3">{t("wallet.history")}</h2>
        <DataTable
          columns={columns}
          data={history}
          loading={historyQuery.isLoading}
          exportFilename="remittances"
          emptyMessage={t("errors.noData")}
        />
      </div>
    </div>
  );
}
