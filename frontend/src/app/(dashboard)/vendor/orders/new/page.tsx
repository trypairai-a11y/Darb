"use client";
// Darb 2.0 — /vendor/orders/new: create a delivery. Zone select (or map
// pin-drop) resolves the dropoff; a debounced POST /api/zones/quote shows
// "Delivery fee: KD 0.750 (Hawally → Salmiya)" before the vendor confirms.
// Submit → POST /api/vendor/orders → toast → back to the board.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, TriangleAlert } from "lucide-react";
import LiveMap from "@/components/map/LiveMap";
import type { OrderMarker } from "@/components/map/LiveMap";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { vendorApi, unwrapList } from "@/lib/darbApi";
import { pointInZone, zoneCentroid } from "@/lib/geo";
import type { DeliveryZone, ZoneQuote } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd } from "@/i18n/format";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function VendorNewOrderPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    staleTime: 60_000,
  });
  const branches = useMemo(() => meQuery.data?.branches ?? [], [meQuery.data?.branches]);

  const zonesQuery = useQuery({
    queryKey: ["darb", "vendor", "zones"],
    queryFn: () => vendorApi.zones(),
    staleTime: 5 * 60_000,
  });
  const zones = useMemo(
    () => unwrapList<DeliveryZone>(zonesQuery.data).filter((z) => z.isActive !== false),
    [zonesQuery.data]
  );

  const [branchId, setBranchId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [address, setAddress] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "PREPAID">("COD");
  const [orderTotal, setOrderTotal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [quote, setQuote] = useState<ZoneQuote | null>(null);
  const [quoting, setQuoting] = useState(false);

  // Default the branch when there's only one.
  useEffect(() => {
    if (!branchId && branches.length === 1) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const selectedZone = zones.find((z) => z.id === zoneId) ?? null;

  // Effective dropoff: explicit pin first, else the selected zone's centroid.
  const dropoff = useMemo<{ lat: number; lng: number } | null>(() => {
    if (pin) return pin;
    if (selectedZone) {
      const c = zoneCentroid(selectedZone);
      if (c) return { lat: c[0], lng: c[1] };
    }
    return null;
  }, [pin, selectedZone]);

  // Debounced fee quote.
  useEffect(() => {
    if (!branchId || !dropoff) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    const timer = setTimeout(() => {
      vendorApi
        .quote({ branchId, dropoff })
        .then((q) => setQuote(q))
        .catch(() => setQuote(null))
        .finally(() => setQuoting(false));
    }, 500);
    return () => {
      clearTimeout(timer);
      setQuoting(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, dropoff?.lat, dropoff?.lng]);

  function handleMapClick(lat: number, lng: number) {
    setPin({ lat, lng });
    // Keep the zone select in sync with the pin when it falls inside a zone.
    const hit = zones.find((z) => pointInZone(lat, lng, z));
    if (hit) setZoneId(hit.id);
  }

  const selectedBranch = branches.find((b) => b.id === branchId) ?? null;

  const mapOrders = useMemo<OrderMarker[]>(() => {
    const pickup =
      selectedBranch && selectedBranch.lat != null && selectedBranch.lng != null
        ? {
            lat: Number(selectedBranch.lat),
            lng: Number(selectedBranch.lng),
            label: selectedBranch.name,
          }
        : null;
    const drop = pin ? { ...pin, label: t("vendorPortal.zone") } : null;
    if (!pickup && !drop) return [];
    return [{ id: "new-order", pickup, dropoff: drop, showLine: !!(pickup && drop) }];
  }, [selectedBranch, pin, t]);

  const zoneName = (z: ZoneQuote["pickupZone"]) =>
    (locale === "ar" && z?.nameAr ? z.nameAr : z?.name) ?? "—";

  const totalValid = orderTotal !== "" && Number.isFinite(Number(orderTotal)) && Number(orderTotal) >= 0;
  const canSubmit =
    !!branchId &&
    customerPhone.trim() !== "" &&
    !!dropoff &&
    totalValid &&
    !!quote?.ok &&
    !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !dropoff) return;
    setSubmitting(true);
    try {
      await vendorApi.createOrder({
        branchId,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim(),
        dropoffAddress: address.trim() || undefined,
        dropoff: { lat: dropoff.lat, lng: dropoff.lng },
        orderTotalKwd: orderTotal,
        paymentMethod,
      });
      toast.success(t("vendorPortal.orderPlaced"));
      await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "orders"] });
      router.push("/vendor");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
      setSubmitting(false);
    }
  }

  if (meQuery.isLoading || zonesQuery.isLoading) {
    return <PageSkeleton statCards={0} tableRows={6} tableCols={2} />;
  }
  if (meQuery.error) {
    return (
      <ErrorState
        error={meQuery.error instanceof Error ? meQuery.error.message : t("errors.loadingData")}
        onRetry={() => meQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("vendorPortal.newOrderTitle")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("vendorPortal.newOrderSubtitle")}</p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── Form fields ── */}
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 space-y-4">
          {branches.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorPortal.branch")}
              </label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
                <option value="">{t("vendorPortal.selectBranch")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorPortal.customerName")}
              </label>
              <input
                type="text"
                dir="auto"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorPortal.customerPhone")} *
              </label>
              <input
                type="tel"
                dir="ltr"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("vendorPortal.zone")}
            </label>
            <select
              value={zoneId}
              onChange={(e) => {
                setZoneId(e.target.value);
                setPin(null); // zone choice replaces a previous pin
              }}
              className={inputClass}
            >
              <option value="">{t("vendorPortal.selectZone")}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {locale === "ar" && z.nameAr ? z.nameAr : z.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("vendorPortal.address")}
            </label>
            <input
              type="text"
              dir="auto"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("vendorPortal.addressPlaceholder")}
              className={inputClass}
            />
          </div>

          {/* Payment + total */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("dispatch.paymentMethod")}
              </label>
              <div className="flex rounded-xl border border-sand-300 overflow-hidden h-10">
                {(["COD", "PREPAID"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={cn(
                      "flex-1 text-sm font-medium transition-colors",
                      paymentMethod === m
                        ? "bg-primary text-white"
                        : "bg-white text-sand-700 hover:bg-sand-100"
                    )}
                  >
                    {m === "COD" ? t("dispatch.cod") : t("dispatch.prepaid")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("dispatch.orderTotal")} *
              </label>
              <input
                type="number"
                dir="ltr"
                min="0"
                step="0.001"
                value={orderTotal}
                onChange={(e) => setOrderTotal(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          {/* Quote banner */}
          {(quoting || quote) && (
            <div
              className={cn(
                "flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm",
                quoting
                  ? "border-sand-200 bg-sand-100/60 text-sand-700"
                  : quote?.ok
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-red-200 bg-red-50 text-red-700"
              )}
            >
              {quoting ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  {t("vendorPortal.quoteChecking")}
                </>
              ) : quote?.ok ? (
                <>
                  <BadgeCheck size={15} aria-hidden="true" />
                  <span>
                    {t("dispatch.deliveryFee")}:{" "}
                    <strong dir="ltr" className="tabular-nums">
                      {formatKwd(quote.feeKwd ?? 0, locale)}
                    </strong>{" "}
                    <span dir="auto">
                      ({zoneName(quote.pickupZone)} → {zoneName(quote.dropoffZone)})
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <TriangleAlert size={15} aria-hidden="true" />
                  {t("vendorPortal.quoteUnserviceable")}
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-11 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {submitting ? t("common.processing") : t("vendorPortal.placeOrder")}
          </button>
        </div>

        {/* ── Pin-drop map ── */}
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-sand-200">
            <p className="text-xs text-sand-600">{t("vendorPortal.mapPinHint")}</p>
          </div>
          <LiveMap
            height="440px"
            zones={zones}
            zoneFillOpacity={0.08}
            selectedZoneId={zoneId || null}
            orders={mapOrders}
            onMapClick={handleMapClick}
            fitBounds={
              pin
                ? [[pin.lat, pin.lng]]
                : selectedZone
                  ? (() => {
                      const c = zoneCentroid(selectedZone);
                      return c ? [c] : null;
                    })()
                  : null
            }
          />
        </div>
      </form>
    </div>
  );
}
