/**
 * staleOrderService — revision 24 (#18): "it's showing orders from 76 days ago
 * still not delivered".
 *
 * Nothing ever ended an order that stopped moving. Ops → Orders filtered by
 * "Arrived at shop" listed orders from 29 July, every one "76d late", because
 * an order only leaves a driver-held status when somebody presses something,
 * and for those nobody ever would. The demo courier never collected ARRIVED
 * orders and the demo refresh's own sweep left ARRIVED out (both fixed beside
 * this), but the hole is general: a driver who uninstalls the app mid-order
 * leaves exactly the same row behind on a real tenant.
 *
 * What "stale" means here is "nothing has been written to the order for
 * STALE_AFTER_HOURS" (its updatedAt), and what happens depends on whether the
 * bag ever left the shop:
 *
 *   - ASSIGNED / ARRIVED (still at the shop, never collected): CANCELLED with a
 *     reason naming the timeout, through the FSM, driver released, no WhatsApp
 *     to a customer who stopped waiting a day ago. Nothing was collected, so
 *     there is no money to move: the wallet is untouched (completeDelivery is
 *     the only path that posts, and it is not on this one).
 *   - PICKED_UP / FAILED, or any order on its way back to the shop: FLAGGED,
 *     never moved. Somebody may be holding the customer's goods or their cash,
 *     and closing that silently is how money goes missing. The order gets
 *     metadata.staleFlaggedAt and ops gets one summary notification.
 *   - CREATED (due) / DISPATCHING / NO_DRIVER: FLAGGED too. The client's rule
 *     (revision 24 #5) is that an order is never cancelled for want of a
 *     driver, so a day-old order still looking for one goes in front of a
 *     person instead.
 *
 * Each order is flagged once (staleFlaggedAt). The cron runs this daily and
 * the opportunistic sweep at most hourly; backend/scripts/clear-stale-orders.ts
 * is the same function, dry-run by default, for the backlog that already
 * exists.
 */
import { DeliveryOrderStatus, Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { cancelOrder } from "./orderService";
import { OrderStateConflictError, SYSTEM_ACTOR, isReturningToMerchant } from "./orderStateMachine";

/** An order nobody has touched for this long is stale. */
export const STALE_AFTER_HOURS = 24;

/** Still at the shop: closed. */
export const STALE_CLOSE_STATUSES: DeliveryOrderStatus[] = ["ASSIGNED", "ARRIVED"];

/** Goods or cash may be in somebody's hands, or the order is still looking for a driver: flagged. */
export const STALE_FLAG_STATUSES: DeliveryOrderStatus[] = [
  "PICKED_UP",
  "FAILED",
  "CREATED",
  "DISPATCHING",
  "NO_DRIVER",
];

export const STALE_CANCEL_REASON =
  "Closed automatically: not collected from the shop within 24 hours";

const OPS_ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] as const;

export interface StaleOrderRow {
  id: string;
  tenantId: string;
  orderNumber: string;
  status: DeliveryOrderStatus;
  updatedAt: Date;
  driverId: string | null;
  action: "CLOSE" | "FLAG";
}

export interface StaleSweepResult {
  dryRun: boolean;
  closed: number;
  flagged: number;
  skipped: number;
  orders: StaleOrderRow[];
}

function metaOf(order: { metadata?: unknown }): Record<string, unknown> {
  const meta = order.metadata;
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? { ...(meta as Record<string, unknown>) }
    : {};
}

/** CREATED orders scheduled for later are waiting on purpose, not stuck. */
function isScheduledLater(order: { status: string; scheduledAt?: Date | null }, now: Date): boolean {
  return order.status === "CREATED" && !!order.scheduledAt && order.scheduledAt.getTime() > now.getTime();
}

/** One summary per tenant, only when something new was flagged. */
async function notifyOps(tenantId: string, flagged: StaleOrderRow[]): Promise<void> {
  if (flagged.length === 0) return;
  try {
    const users = await prisma.user.findMany({
      where: { tenantId, role: { in: [...OPS_ROLES] }, isActive: true },
      select: { id: true },
    });
    if (users.length === 0) return;
    const numbers = flagged.slice(0, 10).map((o) => o.orderNumber).join(", ");
    const more = flagged.length > 10 ? ` and ${flagged.length - 10} more` : "";
    const moreAr = flagged.length > 10 ? ` و${flagged.length - 10} أخرى` : "";
    await prisma.notification.createMany({
      data: users.map((user) => ({
        tenantId,
        userId: user.id,
        title: "Orders stuck for over a day",
        message: `${flagged.length} order(s) have not moved for ${STALE_AFTER_HOURS} hours and need a person to close them: ${numbers}${more}. Orders already collected may involve the customer's goods or cash.`,
        titleAr: "طلبات متوقفة لأكثر من يوم",
        bodyAr: `${flagged.length} من الطلبات لم تتحرك منذ ${STALE_AFTER_HOURS} ساعة وتحتاج إلى إغلاق يدوي: ${numbers}${moreAr}. الطلبات التي استُلمت من المتجر قد تتضمن بضاعة العميل أو نقداً.`,
        type: "ORDERS_STALE",
        severity: "HIGH",
        sourceId: flagged[0].id,
        category: "OPS_TODO",
        metadata: {
          orderIds: flagged.map((o) => o.id),
          orderNumbers: flagged.map((o) => o.orderNumber),
        } as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    logger.warn({ err, tenantId }, "stale orders: ops notification failed");
  }
}

/**
 * Find and resolve stale orders. Cross-tenant unless `tenantId` is given.
 * `dryRun` reads and reports, and writes nothing.
 */
export async function sweepStaleOrders(
  opts: { now?: Date; dryRun?: boolean; tenantId?: string; staleAfterHours?: number; limit?: number } = {},
): Promise<StaleSweepResult> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun === true;
  const hours = opts.staleAfterHours ?? STALE_AFTER_HOURS;
  const cutoff = new Date(now.getTime() - hours * 3_600_000);
  const limit = opts.limit ?? 500;

  // eslint-disable-next-line no-restricted-syntax -- cron/script sweep is cross-tenant by design; every write below re-filters on the row's own tenantId
  const rows = await prisma.deliveryOrder.findMany({
    where: {
      ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
      status: { in: [...STALE_CLOSE_STATUSES, ...STALE_FLAG_STATUSES] },
      updatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      tenantId: true,
      orderNumber: true,
      status: true,
      updatedAt: true,
      driverId: true,
      scheduledAt: true,
      metadata: true,
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  const result: StaleSweepResult = { dryRun, closed: 0, flagged: 0, skipped: 0, orders: [] };
  const flaggedByTenant = new Map<string, StaleOrderRow[]>();

  for (const row of rows) {
    if (isScheduledLater(row, now)) continue;
    const meta = metaOf(row);
    const close =
      (STALE_CLOSE_STATUSES as string[]).includes(row.status) && !isReturningToMerchant(row);

    if (!close && meta.staleFlaggedAt) {
      result.skipped += 1; // flagged on an earlier run; a person has been told
      continue;
    }

    const entry: StaleOrderRow = {
      id: row.id,
      tenantId: row.tenantId,
      orderNumber: row.orderNumber,
      status: row.status,
      updatedAt: row.updatedAt,
      driverId: row.driverId,
      action: close ? "CLOSE" : "FLAG",
    };
    result.orders.push(entry);
    if (dryRun) {
      if (close) result.closed += 1;
      else result.flagged += 1;
      continue;
    }

    try {
      if (close) {
        await cancelOrder({
          tenantId: row.tenantId,
          orderId: row.id,
          reason: STALE_CANCEL_REASON,
          actor: SYSTEM_ACTOR,
          allowFrom: STALE_CLOSE_STATUSES,
          notifyCustomer: false,
        });
        result.closed += 1;
      } else {
        // Guarded on the status we read, so an order that moved meanwhile is
        // left to whoever moved it.
        const { count } = await prisma.deliveryOrder.updateMany({
          where: { id: row.id, tenantId: row.tenantId, status: row.status },
          data: {
            metadata: { ...meta, staleFlaggedAt: now.toISOString() } as Prisma.InputJsonValue,
          },
        });
        if (count === 0) {
          result.skipped += 1;
          continue;
        }
        result.flagged += 1;
        const list = flaggedByTenant.get(row.tenantId) ?? [];
        list.push(entry);
        flaggedByTenant.set(row.tenantId, list);
      }
    } catch (err) {
      if (err instanceof OrderStateConflictError) {
        result.skipped += 1; // moved under us: not stale after all
        continue;
      }
      logger.warn({ err, orderId: row.id }, "stale orders: resolving one order failed");
      result.skipped += 1;
    }
  }

  for (const [tenantId, flagged] of flaggedByTenant) {
    await notifyOps(tenantId, flagged);
  }

  if (!dryRun && (result.closed > 0 || result.flagged > 0)) {
    logger.info(
      { closed: result.closed, flagged: result.flagged, skipped: result.skipped },
      "stale order sweep",
    );
  }
  return result;
}
