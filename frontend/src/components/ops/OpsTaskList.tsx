"use client";
// Darb 2.0 — the "By task" list in the ops control room (client revision #2),
// modelled on the Keeta reference: vendor name, order number, acceptance
// state, elapsed time and time left for delivery, one row per live order.
//
// Each row also carries a copy control (revision #4) so rider support can lift
// the whole task into a chat or a ticket in one click.
import { Copy } from "lucide-react";
import OrderStatusBadge from "@/components/darb/OrderStatusBadge";
import SlaCountdown from "@/components/darb/SlaCountdown";
import type { DeliveryOrder } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { elapsedMinutes, LARGE_ORDER_KWD } from "./opsFilters";

interface OpsTaskListProps {
  orders: DeliveryOrder[];
  selectedId: string | null;
  now: number;
  onSelect: (orderId: string) => void;
  onCopy: (order: DeliveryOrder) => void;
}

export default function OpsTaskList({
  orders,
  selectedId,
  now,
  onSelect,
  onCopy,
}: OpsTaskListProps) {
  const { t, locale } = useI18n();

  if (orders.length === 0) {
    return <p className="px-1 py-6 text-sm text-sand-600">{t("opsMap.noTasks")}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {orders.map((order) => {
        const selected = order.id === selectedId;
        const accepted = !!order.driverId;
        const large = Number(order.orderTotalKwd) >= LARGE_ORDER_KWD;
        return (
          <li key={order.id}>
            <div
              className={cn(
                "group rounded-xl border px-3 py-2.5 transition-colors",
                selected
                  ? "border-primary/50 bg-primary/5"
                  : "border-sand-200 bg-white hover:border-primary/30 hover:bg-sand-50"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(order.id)}
                className="w-full text-start"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-sand-900 truncate" dir="auto">
                    {order.vendor?.name ?? t("opsMap.unknownVendor")}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-sand-600">
                    {accepted ? t("opsMap.accepted") : t("opsMap.awaitingDriver")}
                  </span>
                </div>

                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span dir="ltr" className="font-mono text-[11px] text-sand-600 truncate">
                    {order.orderNumber}
                  </span>
                  <span className="text-[11px] text-sand-600 tabular-nums">
                    {t("opsMap.totalTime")}: {elapsedMinutes(order, now)} {t("opsMap.minShort")}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <OrderStatusBadge status={order.status} />
                    {large && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-pill bg-amber-50 text-amber-700 text-[10px] font-medium shrink-0">
                        {t("opsMap.large")}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-sand-600 shrink-0">
                    <SlaCountdown deadline={order.slaDeadline} className="text-[11px] me-1" />
                    {t("opsMap.leftForDelivery")}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-sand-500">
                  <span className="truncate" dir="auto">
                    {order.driver?.name ?? t("opsMap.noDriverYet")}
                  </span>
                  <span dir="ltr" className="tabular-nums shrink-0">
                    {formatKwd(order.orderTotalKwd, locale)}
                  </span>
                </div>
              </button>

              <div className="mt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onCopy(order)}
                  className="inline-flex items-center gap-1 px-2 h-6 rounded-pill text-[10px] font-medium text-sand-600 hover:bg-sand-100 hover:text-sand-900 transition-colors"
                >
                  <Copy size={10} aria-hidden="true" />
                  {t("opsMap.copyTask")}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
