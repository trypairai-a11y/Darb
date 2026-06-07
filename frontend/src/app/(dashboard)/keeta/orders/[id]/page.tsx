"use client";
import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useApiGet } from "@/hooks/useApi";
import { cleanDriverName } from "@/lib/formatters";
import { type TimelineStep } from "@/components/shared/OrderTimeline";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import { formatDate } from "@/i18n/format";

const OrderTimeline = dynamic(() => import("@/components/shared/OrderTimeline"), {
  ssr: false,
  loading: () => <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />,
});

function OrderFlowSection({ orderId }: { orderId: string | undefined }) {
  const { t } = useI18n();
  const { data, loading, error } = useApiGet<{ orderId: string; steps: TimelineStep[]; totalEvents: number }>(
    orderId ? `/api/order-flow/orders/${orderId}/flow` : null
  );
  if (!orderId) return null;
  if (loading) {
    return (
      <div className="pt-2">
        <h3 className="text-xs font-medium text-secondary uppercase mb-3">{t("keetaPage.orderFlow")}</h3>
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Loader2 size={20} className="animate-spin text-keeta" />
          <p className="text-xs text-secondary">{t("keetaPage.loadingTimeline")}</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="pt-2">
        <h3 className="text-xs font-medium text-secondary uppercase mb-3">{t("keetaPage.orderFlow")}</h3>
        <div className="text-center py-8 text-sm text-secondary">{t("keetaPage.unableLoadFlow")}</div>
      </div>
    );
  }
  const steps = data?.steps || [];
  if (steps.length === 0) {
    return (
      <div className="pt-2">
        <h3 className="text-xs font-medium text-secondary uppercase mb-3">{t("keetaPage.orderFlow")}</h3>
        <div className="text-center py-8 text-sm text-secondary">{t("keetaPage.noFlowData")}</div>
      </div>
    );
  }
  return (
    <div className="pt-2">
      <h3 className="text-xs font-medium text-secondary uppercase mb-3">{t("keetaPage.orderFlow")}</h3>
      <OrderTimeline steps={steps} />
    </div>
  );
}

export default function KeetaOrderDetailPage() {
  const { t, locale } = useI18n();
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);

  const { data: order, loading, error } = useApiGet<any>(id ? `/api/orders/${id}` : null);

  const driverName = order ? cleanDriverName(order.driver?.name || order.driverName) || "—" : "—";

  return (
    <div className="space-y-6 w-full">
      {/* Back link */}
      <Link
        href="/keeta/orders"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary hover:text-foreground transition-colors"
      >
        <DirectionalIcon kind="chevron-back" size={16} />
        {t("keetaPage.ordersTitle")}
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-keeta" />
        <h1 className="text-xl font-semibold">
          {loading ? t("common.loading") : driverName}
        </h1>
        <span className="text-sm text-secondary">Keeta / {t("keetaPage.sidra")}</span>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Loader2 size={22} className="animate-spin text-keeta" />
          <p className="text-sm text-secondary">{t("common.loading")}</p>
        </div>
      )}

      {!loading && (error || !order) && (
        <div className="bg-white rounded-2xl shadow-sm px-5 py-16 text-center text-sm text-secondary">
          {t("keetaPage.noOrdersFound")}
        </div>
      )}

      {!loading && order && (
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              [t("table.date"), order.date ? formatDate(order.date, locale) : "-"],
              [t("keetaPage.orderNumCol"), order.orderNumber || order.id?.slice(0, 8) || "-"],
              [t("table.driver"), driverName],
              [t("table.zone"), order.driver?.zone || order.zone || "-"],
              [t("keetaPage.orderCount"), order.orderCount ?? order.orders ?? "-"],
              [t("keetaPage.distanceCol"), order.distanceKm != null ? `${Number(order.distanceKm).toFixed(1)} km` : "-"],
              [t("keetaPage.avgOnTimeRate"), order.onTimeRate != null ? `${order.onTimeRate}%` : "-"],
              [t("keetaPage.source"), order.source || "-"],
              [t("table.platform"), "KEETA"],
              [t("keetaPage.paymentCol"), order.paymentSource || t("keetaPage.digitalCashless")],
            ].map(([label, val]) => (
              <div key={label as string} className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                <p className="text-sm font-medium mt-0.5">{val}</p>
              </div>
            ))}
          </div>
          {order.notes && (
            <div className="bg-yellow-50 rounded-xl p-3">
              <p className="text-[10px] text-secondary uppercase font-medium mb-1">{t("keetaPage.notesLabel")}</p>
              <p className="text-sm">{order.notes}</p>
            </div>
          )}
          <OrderFlowSection orderId={order.id} />
        </div>
      )}
    </div>
  );
}
