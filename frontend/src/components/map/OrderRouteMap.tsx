// Revision 24 #13 — "for the timeline, please include a map with it showing
// the driver path until the order is delivered, and it must have the vendor
// location + customer location". The card fetches GET
// /api/delivery-orders/:id/route and draws the shop pin, the customer pin and
// the driver's GPS path (dashed grey to the shop, solid green to the customer).
// With no GPS recorded it still shows both pins and says so.
"use client";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { deliveryOrdersApi } from "@/lib/darbApi";
import { useI18n } from "@/i18n/I18nProvider";
import { ROUTE_COLORS } from "./routeColors";

const OrderRouteMapInner = dynamic(() => import("./OrderRouteMapInner"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-sand-100" />,
});

/** Statuses that will not move again, so the route stops polling. */
const ENDED = ["DELIVERED", "FAILED", "RETURNED", "CANCELLED", "REJECTED"];

export default function OrderRouteMap({ orderId, height = 220 }: { orderId: string; height?: number }) {
  const { t } = useI18n();
  const routeQuery = useQuery({
    queryKey: ["darb", "delivery-order", orderId, "route"],
    queryFn: () => deliveryOrdersApi.route(orderId),
    refetchInterval: (query) => (query.state.data && ENDED.includes(query.state.data.status) ? false : 20_000),
    retry: false,
  });
  const route = routeQuery.data;

  if (routeQuery.isLoading) {
    return <div className="rounded-xl bg-sand-100 animate-pulse" style={{ height }} />;
  }
  if (!route) return null;
  if (!route.pickup && !route.dropoff && route.path.length === 0) {
    return <p className="text-sm text-sand-600">{t("rev24Ops.routeNoPins")}</p>;
  }

  return (
    <div className="space-y-2" data-testid="order-route-map">
      <div dir="ltr" className="relative z-0 isolate overflow-hidden rounded-xl border border-sand-200" style={{ height }}>
        <OrderRouteMapInner
          route={route}
          pickupLabel={t("rev24Ops.routePickup")}
          dropoffLabel={t("rev24Ops.routeDropoff")}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-sand-600">
        <Legend color={ROUTE_COLORS.pickup} label={t("rev24Ops.routePickup")} dot />
        <Legend color={ROUTE_COLORS.dropoff} label={t("rev24Ops.routeDropoff")} dot />
        {route.path.length > 0 && (
          <>
            <Legend color={ROUTE_COLORS.toPickup} label={t("rev24Ops.routeToPickup")} dashed />
            <Legend color={ROUTE_COLORS.toDropoff} label={t("rev24Ops.routeToDropoff")} />
          </>
        )}
      </div>
      {route.path.length === 0 && <p className="text-xs text-sand-500">{t("rev24Ops.routeNoPath")}</p>}
    </div>
  );
}

function Legend({ color, label, dot, dashed }: { color: string; label: string; dot?: boolean; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dot ? (
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
      ) : (
        <span
          className="w-4 border-t-2"
          style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}
