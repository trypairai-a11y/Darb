"use client";
// Darb 2.0 PRD §12 — the customer tracking experience. Mobile-first single
// column, co-branded (merchant brand + "delivered by Darb"), 6s polling that
// stops on terminal states, map only while the order is on the road, and
// rating + tip cards after delivery. Uses trackApi (plain fetch) — never the
// shared axios instance.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Phone, Star } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import {
  TrackApiError,
  TrackPayload,
  getTrack,
  postCancelRequest,
  postRating,
  postTip,
} from "@/lib/trackApi";

const LiveMap = dynamic(() => import("@/components/map/LiveMap"), { ssr: false });

const TERMINAL = new Set(["DELIVERED", "CANCELLED", "FAILED", "RETURNED", "REJECTED"]);

const STATUS_KEY: Record<string, string> = {
  CREATED: "track.statusCreated",
  REJECTED: "track.statusCancelled",
  DISPATCHING: "track.statusDispatching",
  NO_DRIVER: "track.statusDispatching",
  ASSIGNED: "track.statusAssigned",
  PICKED_UP: "track.statusPickedUp",
  DELIVERED: "track.statusDelivered",
  FAILED: "track.statusFailed",
  CANCELLED: "track.statusCancelled",
  RETURNED: "track.statusReturned",
};

const TIMELINE_STEPS = [
  { key: "track.timelinePlaced", reached: () => true },
  { key: "track.timelineAssigned", reached: (o: TrackPayload) => !!o.assignedAt },
  { key: "track.timelinePickedUp", reached: (o: TrackPayload) => !!o.pickedUpAt },
  { key: "track.timelineDelivered", reached: (o: TrackPayload) => !!o.deliveredAt },
];

export default function TrackView({ token }: { token: string }) {
  const { t, locale, setLocale } = useI18n();

  const query = useQuery<TrackPayload, TrackApiError>({
    queryKey: ["track", token],
    queryFn: () => getTrack(token),
    refetchInterval: (q) =>
      q.state.data && TERMINAL.has(q.state.data.status) ? false : 6000,
    retry: (count, err) => err.status !== 404 && count < 3,
  });

  const order = query.data;

  const brandHeader = (
    <header className="pt-8 pb-5 text-center">
      <button
        onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
        className="absolute top-4 end-4 rounded-pill border border-sand-300 px-3 py-1 text-xs text-secondary hover:bg-sand-100"
      >
        {locale === "ar" ? "English" : "عربي"}
      </button>
      {order && (
        <>
          <h1 className="font-display text-2xl text-slate-900">
            {locale === "ar" && order.vendor.nameAr ? order.vendor.nameAr : order.vendor.name}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-sand-600">
            {t("track.deliveredByDarb")}
          </p>
        </>
      )}
    </header>
  );

  if (query.isLoading) {
    return (
      <Shell>
        {brandHeader}
        <p className="py-16 text-center text-sm text-secondary">{t("track.loading")}</p>
      </Shell>
    );
  }

  if (query.error?.status === 404) {
    return (
      <Shell>
        <div className="py-20 text-center space-y-2">
          <h1 className="font-display text-xl text-slate-900">{t("track.notFoundTitle")}</h1>
          <p className="text-sm text-secondary">{t("track.notFoundBody")}</p>
        </div>
      </Shell>
    );
  }

  if (!order) {
    return (
      <Shell>
        {brandHeader}
        <p className="py-16 text-center text-sm text-secondary">{t("track.errorGeneric")}</p>
      </Shell>
    );
  }

  const showMap =
    (order.status === "ASSIGNED" || order.status === "PICKED_UP") &&
    (order.driverPosition || order.dropoff);

  return (
    <Shell>
      {brandHeader}

      {/* Status + ETA */}
      <section className="rounded-2xl bg-white shadow-soft border border-sand-200 p-5 text-center">
        <p className="text-xs text-sand-600">
          {t("track.orderLabel")} <span dir="ltr" className="font-medium tabular-nums">{order.orderNumber}</span>
        </p>
        <h2 className="mt-2 font-display text-xl text-slate-900">
          {t(STATUS_KEY[order.status] ?? "track.statusCreated")}
        </h2>
        {order.etaMin != null && !TERMINAL.has(order.status) && (
          <p className="mt-2 inline-flex items-baseline gap-1 rounded-pill bg-forest-900 px-4 py-1.5 text-white">
            <span className="text-xs opacity-80">{t("track.etaLabel")}</span>
            <span dir="ltr" className="font-display text-lg tabular-nums">{order.etaMin}</span>
            <span className="text-xs opacity-80">{t("track.minutes")}</span>
          </p>
        )}
      </section>

      {/* Timeline */}
      <section className="mt-4 rounded-2xl bg-white shadow-soft border border-sand-200 p-5">
        <ol className="space-y-3">
          {TIMELINE_STEPS.map((step, i) => {
            const reached = step.reached(order);
            return (
              <li key={step.key} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                    reached ? "bg-forest-900 text-white" : "bg-sand-200 text-sand-500",
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn("text-sm", reached ? "text-slate-900" : "text-sand-500")}>
                  {t(step.key)}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Driver + map */}
      {order.driver && (
        <section className="mt-4 rounded-2xl bg-white shadow-soft border border-sand-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-sand-600">{t("track.yourDriver")}</p>
              <p className="font-medium text-slate-900">{order.driver.firstName}</p>
            </div>
            {order.driver.phone && (
              <a
                href={`tel:${order.driver.phone}`}
                className="inline-flex items-center gap-2 rounded-pill bg-forest-900 px-4 py-2 text-sm text-white"
              >
                <Phone size={14} /> {t("track.callDriver")}
              </a>
            )}
          </div>
        </section>
      )}

      {showMap && (
        <section className="mt-4 overflow-hidden rounded-2xl border border-sand-200 shadow-soft">
          <LiveMap
            height="240px"
            drivers={
              order.driverPosition
                ? [{
                    driverId: "driver",
                    lat: order.driverPosition.lat,
                    lng: order.driverPosition.lng,
                    at: new Date().toISOString(),
                    name: order.driver?.firstName ?? null,
                  }]
                : []
            }
            marker={order.dropoff ? { ...order.dropoff, label: t("track.orderLabel") } : null}
            fitBounds={[
              ...(order.driverPosition ? [[order.driverPosition.lat, order.driverPosition.lng] as [number, number]] : []),
              ...(order.dropoff ? [[order.dropoff.lat, order.dropoff.lng] as [number, number]] : []),
            ]}
          />
        </section>
      )}

      {/* Post-delivery: rating + tip */}
      {order.status === "DELIVERED" && (
        <>
          <RatingCard token={token} alreadyRated={order.rated} onDone={() => query.refetch()} />
          <TipCard token={token} tipKwd={order.tipKwd} onDone={() => query.refetch()} />
        </>
      )}

      {/* Cancel request */}
      {order.canCancel && <CancelCard token={token} />}

      <footer className="py-8 text-center text-[11px] text-sand-500">
        Darb · {t("track.deliveredByDarb")}
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-sand-50">
      <div className="mx-auto max-w-md px-4">{children}</div>
    </div>
  );
}

function RatingCard({
  token,
  alreadyRated,
  onDone,
}: {
  token: string;
  alreadyRated: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    alreadyRated ? "done" : "idle",
  );

  if (state === "done") {
    return (
      <section className="mt-4 rounded-2xl bg-white shadow-soft border border-sand-200 p-5 text-center text-sm text-forest-900">
        {t("track.rateThanks")}
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-2xl bg-white shadow-soft border border-sand-200 p-5">
      <h3 className="font-medium text-slate-900">{t("track.rateTitle")}</h3>
      <div className="mt-3 flex justify-center gap-2" dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setStars(n)} aria-label={`${n} stars`}>
            <Star
              size={30}
              className={n <= stars ? "fill-amber-400 text-amber-400" : "text-sand-300"}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("track.ratePlaceholder")}
        rows={2}
        className="mt-3 w-full rounded-xl border border-sand-300 p-3 text-sm"
      />
      <button
        disabled={stars === 0 || state === "busy"}
        onClick={async () => {
          setState("busy");
          try {
            await postRating(token, { stars, comment: comment || undefined });
            setState("done");
            onDone();
          } catch (err) {
            setState(err instanceof TrackApiError && err.status === 409 ? "done" : "error");
          }
        }}
        className="mt-3 w-full rounded-pill bg-forest-900 py-2.5 text-sm text-white disabled:opacity-40"
      >
        {t("track.rateSubmit")}
      </button>
      {state === "error" && (
        <p className="mt-2 text-center text-xs text-red-600">{t("track.errorGeneric")}</p>
      )}
    </section>
  );
}

const TIP_PRESETS = [0.25, 0.5, 1];

function TipCard({
  token,
  tipKwd,
  onDone,
}: {
  token: string;
  tipKwd: string | null;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    tipKwd ? "done" : "idle",
  );

  const effective = useMemo(() => {
    if (custom) {
      const n = Number(custom);
      return Number.isFinite(n) && n > 0 && n <= 20 ? n : null;
    }
    return amount;
  }, [amount, custom]);

  if (state === "done") {
    return (
      <section className="mt-4 rounded-2xl bg-white shadow-soft border border-sand-200 p-5 text-center text-sm text-forest-900">
        {t("track.tipThanks")}
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-2xl bg-white shadow-soft border border-sand-200 p-5">
      <h3 className="font-medium text-slate-900">{t("track.tipTitle")}</h3>
      <p className="mt-1 text-xs text-sand-600">{t("track.tipSubtitle")}</p>
      <div className="mt-3 flex gap-2">
        {TIP_PRESETS.map((n) => (
          <button
            key={n}
            onClick={() => { setAmount(n); setCustom(""); }}
            className={cn(
              "flex-1 rounded-pill border py-2 text-sm tabular-nums",
              amount === n && !custom
                ? "border-forest-900 bg-forest-900 text-white"
                : "border-sand-300 text-slate-900 hover:bg-sand-100",
            )}
            dir="ltr"
          >
            {n.toFixed(3)}
          </button>
        ))}
      </div>
      <input
        value={custom}
        onChange={(e) => { setCustom(e.target.value); setAmount(null); }}
        placeholder={t("track.tipCustom")}
        inputMode="decimal"
        className="mt-2 w-full rounded-xl border border-sand-300 p-3 text-sm"
      />
      <button
        disabled={!effective || state === "busy"}
        onClick={async () => {
          if (!effective) return;
          setState("busy");
          try {
            await postTip(token, { amountKwd: effective });
            setState("done");
            onDone();
          } catch (err) {
            setState(err instanceof TrackApiError && err.status === 409 ? "done" : "error");
          }
        }}
        className="mt-3 w-full rounded-pill bg-forest-900 py-2.5 text-sm text-white disabled:opacity-40"
      >
        {t("track.tipSubmit")}
      </button>
      {state === "error" && (
        <p className="mt-2 text-center text-xs text-red-600">{t("track.errorGeneric")}</p>
      )}
    </section>
  );
}

function CancelCard({ token }: { token: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  if (state === "done") {
    return (
      <section className="mt-4 rounded-2xl bg-white shadow-soft border border-sand-200 p-5 text-center text-sm text-slate-900">
        {t("track.cancelSent")}
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft">
      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full text-center text-sm text-sand-600 hover:text-slate-900">
          {t("track.cancelTitle")}
        </button>
      ) : (
        <>
          <h3 className="font-medium text-slate-900">{t("track.cancelTitle")}</h3>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("track.cancelReason")}
            rows={2}
            className="mt-3 w-full rounded-xl border border-sand-300 p-3 text-sm"
          />
          <button
            disabled={state === "busy"}
            onClick={async () => {
              setState("busy");
              try {
                await postCancelRequest(token, { reason: reason || undefined });
                setState("done");
              } catch {
                setState("error");
              }
            }}
            className="mt-3 w-full rounded-pill border border-red-300 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            {t("track.cancelSubmit")}
          </button>
          {state === "error" && (
            <p className="mt-2 text-center text-xs text-red-600">{t("track.errorGeneric")}</p>
          )}
        </>
      )}
    </section>
  );
}
