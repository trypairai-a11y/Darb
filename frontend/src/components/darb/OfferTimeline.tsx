// Darb 2.0 — vertical stepper of dispatch offer rounds for an order.
"use client";
import { CheckCircle2, XCircle, Clock, CircleSlash, Loader2, UserCog } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { formatTime } from "@/i18n/format";
import type { DispatchOffer, OfferStatus } from "@/types/darb";

const STATUS_META: Record<OfferStatus, { icon: typeof CheckCircle2; className: string; i18n: string }> = {
  ACCEPTED: { icon: CheckCircle2, className: "text-green-600 bg-green-50", i18n: "dispatch.offerAccepted" },
  DECLINED: { icon: XCircle, className: "text-red-500 bg-red-50", i18n: "dispatch.offerDeclined" },
  EXPIRED: { icon: Clock, className: "text-sand-500 bg-sand-100", i18n: "dispatch.offerExpired" },
  CANCELLED: { icon: CircleSlash, className: "text-sand-500 bg-sand-100", i18n: "dispatch.offerCancelled" },
  OFFERED: { icon: Loader2, className: "text-blue-600 bg-blue-50", i18n: "dispatch.offerPending" },
};

interface OfferTimelineProps {
  offers: DispatchOffer[];
  className?: string;
}

export default function OfferTimeline({ offers, className }: OfferTimelineProps) {
  const { t, locale } = useI18n();

  if (!offers || offers.length === 0) {
    return <p className={cn("text-sm text-sand-600", className)}>{t("dispatch.noOffers")}</p>;
  }

  const sorted = [...offers].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return new Date(a.offeredAt).getTime() - new Date(b.offeredAt).getTime();
  });

  return (
    <ol className={cn("space-y-0", className)}>
      {sorted.map((offer, i) => {
        const meta = STATUS_META[offer.status] ?? STATUS_META.OFFERED;
        const Icon = meta.icon;
        const isLast = i === sorted.length - 1;
        const manual = offer.round < 0;
        const distance =
          offer.distanceKm != null && offer.distanceKm !== ""
            ? Number(offer.distanceKm).toFixed(1)
            : null;
        return (
          <li key={offer.id} className="relative flex gap-3 pb-5 last:pb-0">
            {/* connector */}
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute start-[15px] top-8 bottom-0 w-px bg-sand-200"
              />
            )}
            <span
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                meta.className
              )}
            >
              {manual ? (
                <UserCog size={15} aria-hidden="true" />
              ) : (
                <Icon
                  size={15}
                  aria-hidden="true"
                  className={offer.status === "OFFERED" ? "animate-spin" : undefined}
                />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium text-sand-900" dir="auto">
                {offer.driver?.name ?? offer.driverId}
                <span className="ms-2 text-xs font-normal text-sand-600">
                  {manual
                    ? t("dispatch.manualAssign")
                    : `${t("dispatch.round")} ${offer.round}`}
                </span>
              </p>
              <p className="text-xs text-sand-600 mt-0.5">
                {t(meta.i18n)}
                {distance && (
                  <span dir="ltr" className="ms-2">
                    {distance} km
                  </span>
                )}
              </p>
              <p className="text-[11px] text-sand-500 mt-0.5" dir="ltr">
                {formatTime(offer.offeredAt, locale)}
                {offer.respondedAt && <> → {formatTime(offer.respondedAt, locale)}</>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
