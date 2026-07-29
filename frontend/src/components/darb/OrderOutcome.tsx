"use client";
// Darb 2.0 — why an order ended the way it did.
//
// FAILED, CANCELLED, REJECTED and RETURNED rows used to render as a red badge
// and nothing else, so /orders with the FAILED filter on was a wall of red no
// supervisor could explain to a merchant. The reason is already stored, just
// in three different columns depending on how the order died:
//
//   failureReason   free text from the driver app ("customer unreachable")
//   cancelReason    free text from whoever cancelled (staff, vendor, customer)
//   rejectionReason a system code the intake guard wrote, never free text
//
// This module is the single place that decides which column applies and how
// it reads, so the table cell, the ops panel and the orders panel agree.

import { AlertTriangle } from "lucide-react";
import type { DeliveryOrder, DeliveryOrderStatus } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";

/** Statuses that owe the reader an explanation. */
export const OUTCOME_STATUSES: DeliveryOrderStatus[] = [
  "FAILED",
  "CANCELLED",
  "REJECTED",
  "RETURNED",
];

export function hasOutcome(status: DeliveryOrderStatus): boolean {
  return OUTCOME_STATUSES.includes(status);
}

type Order = Pick<
  DeliveryOrder,
  "status" | "failureReason" | "cancelReason" | "rejectionReason"
>;

/** Turn an unmapped system code into something readable rather than shouting
 *  OUT_OF_ZONE_DROPOFF at an operator. */
function humanizeCode(code: string): string {
  return code
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * The recorded reason, or null when nothing was recorded. Never invents one:
 * a missing reason is a gap in the record, and the caller says so explicitly
 * rather than filling it with a guess.
 */
export function outcomeReason(
  order: Order,
  t: (key: string) => string,
): string | null {
  if (order.status === "REJECTED") {
    if (!order.rejectionReason) return null;
    const key = `rejectReason.${order.rejectionReason}`;
    const label = t(key);
    // t() echoes the key back when it is missing, which is how a code the
    // backend added but the dictionary has not caught up with is detected.
    return label === key ? humanizeCode(order.rejectionReason) : label;
  }
  const raw =
    order.status === "CANCELLED" ? order.cancelReason : order.failureReason;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** Table cell: the reason, "not recorded" for an unexplained bad outcome, and
 *  `n/a` for orders that ended fine and have nothing to explain. */
export function OrderOutcomeCell({ order }: { order: Order }) {
  const { t } = useI18n();
  if (!hasOutcome(order.status)) {
    return <span className="text-sand-400">n/a</span>;
  }
  const reason = outcomeReason(order, t);
  if (!reason) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
        <AlertTriangle size={11} aria-hidden="true" />
        {t("dispatch.reasonMissing")}
      </span>
    );
  }
  return (
    <span dir="auto" className="text-xs text-sand-800 line-clamp-2" title={reason}>
      {reason}
    </span>
  );
}

/**
 * Panel banner. Sits directly under the status badge so the first thing a
 * supervisor reads about a dead order is why it died. `onRecord` adds the
 * "record reason" affordance for the statuses that accept one.
 */
export function OrderOutcomeBanner({
  order,
  onRecord,
}: {
  order: Order;
  onRecord?: () => void;
}) {
  const { t } = useI18n();
  if (!hasOutcome(order.status)) return null;

  const reason = outcomeReason(order, t);
  const editable = order.status !== "REJECTED" && !!onRecord;

  return (
    <section
      className={
        reason
          ? "rounded-xl border border-sand-200 bg-sand-100/60 px-4 py-3"
          : "rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600">
            {t("dispatch.outcomeReason")}
          </h3>
          {reason ? (
            <p dir="auto" className="mt-1 text-sm text-sand-900">
              {reason}
            </p>
          ) : (
            <p className="mt-1 text-sm text-amber-800">
              {order.status === "REJECTED"
                ? t("dispatch.reasonMissing")
                : t("dispatch.reasonMissingHint")}
            </p>
          )}
        </div>
        {editable && (
          <button
            type="button"
            onClick={onRecord}
            className="shrink-0 px-3 h-8 rounded-pill bg-white border border-sand-300 text-xs font-medium text-sand-800 hover:bg-sand-100 transition-colors"
          >
            {reason ? t("dispatch.editReason") : t("dispatch.recordReason")}
          </button>
        )}
      </div>
    </section>
  );
}
