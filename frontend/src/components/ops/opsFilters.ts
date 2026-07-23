// Darb 2.0 — ops control-room filtering (client revision #2).
//
// The Keeta reference the client supplied groups live work two ways: a status
// dropdown ("All (555)") and a row of "irregular task" quick filters with live
// counts. This module is the pure logic behind both, kept out of the page so
// it can be reasoned about (and tested) without a map or a network.

import type { DeliveryOrder, DriverPosition } from "@/types/darb";
import { driverMapStatus, type DriverMapStatus } from "@/types/darb";

/** Statuses that put an order in the live control room. */
export const ACTIVE_STATUSES = [
  "CREATED",
  "DISPATCHING",
  "NO_DRIVER",
  "ASSIGNED",
  "PICKED_UP",
] as const;

/** An order at or above this value is flagged "large" for extra care. */
export const LARGE_ORDER_KWD = 15;

/** "Almost late" opens this far ahead of the SLA deadline. */
export const ALMOST_LATE_MS = 15 * 60_000;

export type QuickFilter =
  | "largeOrder"
  | "almostLate"
  | "late"
  | "unusualStop"
  | "courierIssue";

export const QUICK_FILTERS: QuickFilter[] = [
  "largeOrder",
  "almostLate",
  "late",
  "unusualStop",
  "courierIssue",
];

/** Extra per-order signals the order row itself does not carry. */
export interface OrderSignals {
  /** Order ids whose driver has not moved on an active job (dispatch overview). */
  stalledOrderIds: Set<string>;
  /** Order ids with an open incident raised by the courier. */
  incidentOrderIds: Set<string>;
}

export const EMPTY_SIGNALS: OrderSignals = {
  stalledOrderIds: new Set(),
  incidentOrderIds: new Set(),
};

function slaRemainingMs(order: DeliveryOrder, now: number): number | null {
  if (!order.slaDeadline) return null;
  const target = new Date(order.slaDeadline).getTime();
  return Number.isFinite(target) ? target - now : null;
}

export function matchesQuickFilter(
  order: DeliveryOrder,
  filter: QuickFilter,
  now: number,
  signals: OrderSignals
): boolean {
  switch (filter) {
    case "largeOrder":
      return Number(order.orderTotalKwd) >= LARGE_ORDER_KWD;
    case "almostLate": {
      const remaining = slaRemainingMs(order, now);
      // Strictly the warning window: an already-breached order belongs to
      // "late", not here, or it would be counted twice.
      return remaining !== null && remaining > 0 && remaining <= ALMOST_LATE_MS;
    }
    case "late": {
      const remaining = slaRemainingMs(order, now);
      return remaining !== null && remaining <= 0;
    }
    case "unusualStop":
      return signals.stalledOrderIds.has(order.id);
    case "courierIssue":
      return signals.incidentOrderIds.has(order.id);
  }
}

/**
 * Apply the status dropdown and any active quick filters.
 *
 * Quick filters are OR-ed with each other (the reference shows them as tags you
 * toggle on to widen the view of what is irregular) and AND-ed with the status
 * selection.
 */
export function filterOrders(
  orders: DeliveryOrder[],
  {
    status,
    quickFilters,
    now,
    signals,
  }: {
    status: string;
    quickFilters: QuickFilter[];
    now: number;
    signals: OrderSignals;
  }
): DeliveryOrder[] {
  return orders.filter((order) => {
    if (status && order.status !== status) return false;
    if (quickFilters.length === 0) return true;
    return quickFilters.some((f) => matchesQuickFilter(order, f, now, signals));
  });
}

export function countQuickFilter(
  orders: DeliveryOrder[],
  filter: QuickFilter,
  now: number,
  signals: OrderSignals
): number {
  return orders.reduce(
    (total, order) => total + (matchesQuickFilter(order, filter, now, signals) ? 1 : 0),
    0
  );
}

export type OrderSort = "acceptance" | "sla";

/** Sort live work the way the control room reads it. */
export function sortOrders(orders: DeliveryOrder[], sort: OrderSort, now: number): DeliveryOrder[] {
  const copy = [...orders];
  if (sort === "sla") {
    // Tightest runway first; orders with no deadline sink to the bottom.
    return copy.sort((a, b) => {
      const ra = slaRemainingMs(a, now);
      const rb = slaRemainingMs(b, now);
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return ra - rb;
    });
  }
  // Acceptance time, newest first — the reference's default ordering.
  return copy.sort((a, b) => {
    const ta = new Date(a.assignedAt ?? a.createdAt).getTime();
    const tb = new Date(b.assignedAt ?? b.createdAt).getTime();
    return tb - ta;
  });
}

/** Whole minutes since the order was created. */
export function elapsedMinutes(order: DeliveryOrder, now: number): number {
  const created = new Date(order.createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((now - created) / 60_000));
}

// ── Couriers ──────────────────────────────────────────────────────────────

export const DRIVER_STATUS_FILTERS: DriverMapStatus[] = ["busy", "idle", "offline", "stale"];

export function filterDrivers(
  drivers: DriverPosition[],
  statuses: DriverMapStatus[],
  search: string
): DriverPosition[] {
  const q = search.trim().toLowerCase();
  return drivers.filter((d) => {
    if (statuses.length > 0 && !statuses.includes(driverMapStatus(d))) return false;
    if (!q) return true;
    return (
      (d.name ?? "").toLowerCase().includes(q) ||
      (d.driverCode ?? "").toLowerCase().includes(q) ||
      (d.phone ?? "").includes(q)
    );
  });
}

export function countDriverStatus(drivers: DriverPosition[], status: DriverMapStatus): number {
  return drivers.reduce((total, d) => total + (driverMapStatus(d) === status ? 1 : 0), 0);
}
