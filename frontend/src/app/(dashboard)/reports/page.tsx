"use client";
// Darb 2.0 — /reports: date-ranged CSV exports. Four cards (orders, vendor
// settlements, driver cash, zone volumes); each Download button pulls the
// matching list endpoint with the selected range and builds the CSV
// client-side (same escaping as DataTable's export).
import { useState } from "react";
import { Briefcase, Download, HandCoins, Hexagon, Loader2, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import FilterBar from "@/components/shared/FilterBar";
import { useToast } from "@/components/shared/Toast";
import { deliveryOrdersApi, walletsApi, unwrapList } from "@/lib/darbApi";
import { downloadCsv } from "@/lib/csv";
import type { DeliveryOrder, WalletEntry } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";

const EXPORT_LIMIT = 1000;

type ExportKey = "orders" | "settlements" | "driverCash" | "zoneVolumes";

export default function ReportsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<ExportKey | null>(null);

  const range = {
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  };

  async function fetchOrders(): Promise<DeliveryOrder[]> {
    const res = await deliveryOrdersApi.list({ ...range, limit: EXPORT_LIMIT });
    return unwrapList<DeliveryOrder>(res);
  }

  async function fetchEntries(ownerType: string): Promise<WalletEntry[]> {
    const res = await walletsApi.entries({ ...range, ownerType, limit: EXPORT_LIMIT });
    return unwrapList<WalletEntry>(res);
  }

  const entryRows = (rows: WalletEntry[]) =>
    rows.map((e) => [
      e.createdAt,
      e.transaction?.type ?? "",
      e.transaction?.order?.orderNumber ?? e.transaction?.orderId ?? "",
      e.direction === "DEBIT" ? String(e.amountKwd) : "",
      e.direction === "CREDIT" ? String(e.amountKwd) : "",
      String(e.runningBalanceKwd ?? ""),
    ]);

  const entryHeaders = [
    t("wallet.date"),
    t("wallet.type"),
    t("wallet.orderRef"),
    t("wallet.debit"),
    t("wallet.credit"),
    t("wallet.runningBalance"),
  ];

  async function runExport(key: ExportKey) {
    setRunning(key);
    try {
      let rowCount = 0;
      if (key === "orders") {
        const orders = await fetchOrders();
        rowCount = orders.length;
        if (rowCount > 0) {
          downloadCsv(
            "orders",
            [
              t("dispatch.orderNumber"),
              t("dispatch.vendor"),
              t("dispatch.status"),
              t("dispatch.customer"),
              t("dispatch.driver"),
              t("dispatch.pickupZone"),
              t("dispatch.dropoffZone"),
              t("dispatch.paymentMethod"),
              t("dispatch.orderTotal"),
              t("dispatch.deliveryFee"),
              t("dispatch.createdAt"),
            ],
            orders.map((o) => [
              o.orderNumber,
              o.vendor?.name ?? o.vendorId,
              o.status,
              o.customerName ?? "",
              o.driver?.name ?? "",
              o.pickupZone?.name ?? "",
              o.dropoffZone?.name ?? "",
              o.paymentMethod,
              String(o.orderTotalKwd ?? ""),
              String(o.deliveryFeeKwd ?? ""),
              o.createdAt,
            ])
          );
        }
      } else if (key === "settlements") {
        const rows = await fetchEntries("VENDOR_PAYABLE");
        rowCount = rows.length;
        if (rowCount > 0) downloadCsv("vendor-settlements", entryHeaders, entryRows(rows));
      } else if (key === "driverCash") {
        const rows = await fetchEntries("DRIVER_CASH");
        rowCount = rows.length;
        if (rowCount > 0) downloadCsv("driver-cash", entryHeaders, entryRows(rows));
      } else {
        // Zone volumes — aggregate the order list per dropoff zone.
        const orders = await fetchOrders();
        const byZone = new Map<string, { name: string; count: number; fees: number; totals: number }>();
        for (const o of orders) {
          const zoneKey = o.dropoffZoneId ?? o.dropoffZone?.id ?? "unzoned";
          const name = o.dropoffZone?.name ?? "—";
          const agg = byZone.get(zoneKey) ?? { name, count: 0, fees: 0, totals: 0 };
          agg.count += 1;
          agg.fees += Number(o.deliveryFeeKwd) || 0;
          agg.totals += Number(o.orderTotalKwd) || 0;
          byZone.set(zoneKey, agg);
        }
        rowCount = byZone.size;
        if (rowCount > 0) {
          downloadCsv(
            "zone-volumes",
            [t("opsPages.zone"), t("opsPages.activeOrders"), t("dispatch.fee"), t("dispatch.total")],
            Array.from(byZone.values())
              .sort((a, b) => b.count - a.count)
              .map((z) => [z.name, z.count, z.fees.toFixed(3), z.totals.toFixed(3)])
          );
        }
      }
      if (rowCount === 0) {
        toast.info(t("reportsPage.noData"));
      } else {
        toast.success(`${rowCount} ${t("reportsPage.rowsExported")}`);
      }
    } catch {
      toast.error(t("reportsPage.exportFailed"));
    } finally {
      setRunning(null);
    }
  }

  const cards: { key: ExportKey; icon: LucideIcon; title: string; desc: string }[] = [
    { key: "orders", icon: Briefcase, title: t("reportsPage.ordersCard"), desc: t("reportsPage.ordersDesc") },
    {
      key: "settlements",
      icon: Store,
      title: t("reportsPage.settlementsCard"),
      desc: t("reportsPage.settlementsDesc"),
    },
    {
      key: "driverCash",
      icon: HandCoins,
      title: t("reportsPage.driverCashCard"),
      desc: t("reportsPage.driverCashDesc"),
    },
    {
      key: "zoneVolumes",
      icon: Hexagon,
      title: t("reportsPage.zoneVolumesCard"),
      desc: t("reportsPage.zoneVolumesDesc"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("reportsPage.title")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("reportsPage.subtitle")}</p>
      </div>

      <FilterBar
        filters={[{ key: "dateFrom", label: t("wallet.date"), type: "dateRange", toKey: "dateTo" }]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClear={() => setFilters({})}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {cards.map(({ key, icon: Icon, title, desc }) => (
          <article
            key={key}
            className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 flex flex-col gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-pill bg-primary/10 flex items-center justify-center text-primary">
                <Icon size={18} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-sand-900">{title}</h2>
                <p className="text-xs text-sand-600 mt-1">{desc}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void runExport(key)}
              disabled={running !== null}
              className="self-start inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
            >
              {running === key ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <Download size={12} aria-hidden="true" />
              )}
              {running === key ? t("reportsPage.preparing") : t("reportsPage.download")}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
