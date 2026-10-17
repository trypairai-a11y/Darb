// Revision 24 #13: "for the timeline, please include a map with it showing
// the driver path until the order is delivered, and it must have the vendor
// location + customer location". The card fetches the order's route and draws
// the store pin, the customer pin and the driver's GPS path (dashed grey to
// the store, solid green to the customer). With no GPS recorded it still shows
// both pins and says so.
//
// Client note (Osama, 15 Oct 2026): "for the order map must show the route the
// driver took and the store + customer location, must be able to copy the
// link". The map used to vanish without a word when its request failed, and on
// the Live panel it only rendered once the timeline had loaded. It now always
// says what it has, and carries copy buttons for the store, the customer, a
// store to customer directions link and the customer's tracking link.
"use client";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Copy, MapPin } from "lucide-react";
import { deliveryOrdersApi, vendorApi } from "@/lib/darbApi";
import { useI18n } from "@/i18n/I18nProvider";
import { useToast } from "@/components/shared/Toast";
import { copyText, googleMapsDirectionsUrl, googleMapsPlaceUrl, type LatLng } from "@/lib/mapLinks";
import { ROUTE_COLORS } from "./routeColors";

const OrderRouteMapInner = dynamic(() => import("./OrderRouteMapInner"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-sand-100" />,
});

/** Statuses that will not move again, so the route stops polling. */
const ENDED = ["DELIVERED", "FAILED", "RETURNED", "CANCELLED", "REJECTED"];

export interface OrderRouteMapProps {
  orderId: string;
  height?: number;
  /** "vendor" reads the merchant-scoped endpoint; staff screens use "ops". */
  scope?: "ops" | "vendor";
  /** The customer's public tracking link, when the order has one. */
  trackingUrl?: string | null;
  /** The driver's live fix, drawn over the end of the recorded path. */
  live?: LatLng | null;
}

export default function OrderRouteMap({ orderId, height = 220, scope = "ops", trackingUrl, live }: OrderRouteMapProps) {
  const { t } = useI18n();
  const toast = useToast();
  const routeQuery = useQuery({
    queryKey: ["darb", scope === "vendor" ? "vendor-order" : "delivery-order", orderId, "route"],
    queryFn: () => (scope === "vendor" ? vendorApi.orderRoute(orderId) : deliveryOrdersApi.route(orderId)),
    refetchInterval: (query) => (query.state.data && ENDED.includes(query.state.data.status) ? false : 20_000),
    retry: 1,
  });
  const route = routeQuery.data;

  async function copy(url: string) {
    if (await copyText(url)) {
      toast.success(t("orderMap.copied"));
      return;
    }
    toast.error(t("orderMap.copyFailed"));
    // Last resort: a box the link can be copied out of by hand.
    if (typeof window !== "undefined") window.prompt(t("orderMap.copyPrompt"), url);
  }

  const links: { key: string; label: string; url: string }[] = [];
  if (route?.pickup) links.push({ key: "store", label: t("orderMap.copyStore"), url: googleMapsPlaceUrl(route.pickup) });
  if (route?.dropoff) links.push({ key: "customer", label: t("orderMap.copyCustomer"), url: googleMapsPlaceUrl(route.dropoff) });
  if (route?.pickup && route?.dropoff) {
    links.push({ key: "route", label: t("orderMap.copyRoute"), url: googleMapsDirectionsUrl(route.pickup, route.dropoff) });
  }
  if (trackingUrl) links.push({ key: "tracking", label: t("orderMap.copyTracking"), url: trackingUrl });

  let body: ReactNode;
  if (routeQuery.isLoading) {
    body = <div className="rounded-xl bg-sand-100 animate-pulse" style={{ height }} />;
  } else if (!route) {
    body = <p className="text-sm text-sand-600">{t("orderMap.loadFailed")}</p>;
  } else if (!route.pickup && !route.dropoff && route.path.length === 0) {
    body = <p className="text-sm text-sand-600">{t("orderMap.noPins")}</p>;
  } else {
    body = (
      <>
        <div dir="ltr" className="relative z-0 isolate overflow-hidden rounded-xl border border-sand-200" style={{ height }}>
          <OrderRouteMapInner
            route={route}
            pickupLabel={t("orderMap.store")}
            dropoffLabel={t("orderMap.customer")}
            live={live ?? null}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-sand-600">
          {route.pickup && <Legend color={ROUTE_COLORS.pickup} label={t("orderMap.store")} dot />}
          {route.dropoff && <Legend color={ROUTE_COLORS.dropoff} label={t("orderMap.customer")} dot />}
          {route.path.length > 0 && (
            <>
              <Legend color={ROUTE_COLORS.toPickup} label={`${t("orderMap.driverRoute")}: ${t("orderMap.toStore")}`} dashed />
              <Legend color={ROUTE_COLORS.toDropoff} label={`${t("orderMap.driverRoute")}: ${t("orderMap.toCustomer")}`} />
            </>
          )}
        </div>
        {route.path.length === 0 && <p className="text-xs text-sand-500">{t("orderMap.noRoute")}</p>}
      </>
    );
  }

  return (
    <section className="space-y-2" data-testid="order-route-map">
      <h3 className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide font-medium text-sand-600">
        <MapPin size={12} aria-hidden="true" />
        {t("orderMap.title")}
      </h3>
      {body}
      {links.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="order-route-links">
          <span className="text-[11px] text-sand-500">{t("orderMap.copyLinks")}:</span>
          {links.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => void copy(l.url)}
              title={l.url}
              data-testid={`order-route-copy-${l.key}`}
              className="inline-flex items-center gap-1 px-2.5 h-7 rounded-pill bg-white border border-sand-300 text-[11px] font-medium text-sand-800 hover:bg-sand-100 transition-colors"
            >
              <Copy size={11} aria-hidden="true" />
              {l.label}
            </button>
          ))}
        </div>
      )}
    </section>
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
