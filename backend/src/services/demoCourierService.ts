/**
 * demoCourierService — the other side of the offer, on demo tenants only.
 *
 * Dispatch is a conversation: the engine offers an order to the nearest driver
 * and waits up to offerWindowSec for him to press Accept in the driver app. No
 * accept, no assignment. That is the correct rule, and on a tenant with real
 * couriers it is the only safe one.
 *
 * A demo tenant has no phones. Its roster is a fixture that demoPresenceService
 * keeps breathing, so candidates are found and offers do go out, and then every
 * single one expires unanswered. Production on 2026-07-29 had an order that had
 * been through nine offers to nine different drivers, all EXPIRED, none declined
 * and none accepted, cycling DISPATCHING → NO_DRIVER → retry for six days. From
 * the ops board that is indistinguishable from "dispatch cannot find anyone",
 * which is exactly how it was reported. Nothing was broken. Nobody was
 * answering.
 *
 * This answers. Offers get accepted after a plausible pause, orders get
 * collected, deliveries get completed, so a demo order walks the whole route on
 * its own while somebody watches.
 *
 * OFF BEHIND TWO SWITCHES, because this one moves money — completeDelivery
 * settles the wallet, and a real merchant's order marked delivered by a robot
 * would be far worse than the stall it fixes:
 *
 *   1. DEMO_AUTO_COURIER=true — the master switch, off by default.
 *   2. DEMO_PRESENCE_TENANTS — the same allow-list that governs synthetic GPS.
 *      A tenant whose couriers are fixtures is one whose couriers cannot
 *      answer; that is the same set, so it is the same list.
 *
 * Both must be on. Every query below names an allow-listed tenant id.
 *
 * It runs from the dispatch sweep, after the dispatch leg, so an offer made
 * this tick is still fresh when this pass looks and waits for the next one.
 */
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { acceptOffer } from "./dispatch/dispatchEngine";
import { completeDelivery } from "./orderService";
import { flushOrderEvents, transitionOrder } from "./orderStateMachine";
import { demoTenantIds } from "./demoPresenceService";

/**
 * How long an offer sits before the demo driver takes it. Long enough that
 * anyone watching the ops board sees a genuine Offered row appear and then be
 * answered, short enough to stay inside the 15s offer window rather than
 * letting it expire and cost the order another round.
 */
const ACCEPT_AFTER_SEC = 6;

/** Minutes at the merchant before the order is collected. */
const PICKUP_AFTER_SEC = 120;

/** Minutes on the road before the drop is completed. */
const DELIVER_AFTER_SEC = 300;

/** Rows touched per leg per tenant per tick — a sweep must stay quick. */
const BATCH = 25;

export interface DemoCourierResult {
  tenants: number;
  accepted: number;
  pickedUp: number;
  delivered: number;
}

/**
 * The master switch. Trimmed before comparing: `vercel env add` keeps the
 * trailing newline off an echoed value, which is how DEMO_REFRESH_ENABLED came
 * to be set to "true\n" in production and read as off for six days.
 */
function autoCourierEnabled(): boolean {
  return (process.env.DEMO_AUTO_COURIER ?? "").trim() === "true";
}

/** Accept every offer that has been sitting long enough to have been read. */
async function acceptDueOffers(tenantId: string, now: Date): Promise<number> {
  const offers = await prisma.dispatchOffer.findMany({
    where: {
      tenantId,
      status: "OFFERED",
      // Not yet expired: acceptOffer guards on this too, so an offer that aged
      // out between the read and the write is simply lost, never resurrected.
      expiresAt: { gt: now },
      createdAt: { lte: new Date(now.getTime() - ACCEPT_AFTER_SEC * 1000) },
    },
    select: { id: true, driverId: true },
    orderBy: { createdAt: "asc" }, // longest-waiting customer first
    take: BATCH,
  });

  let accepted = 0;
  for (const offer of offers) {
    try {
      await acceptOffer({ tenantId, offerId: offer.id, driverId: offer.driverId });
      accepted += 1;
    } catch (err) {
      // Ordinary: the offer expired or another writer won it. The order is
      // still in DISPATCHING and the sweep will offer it again.
      logger.debug({ err, offerId: offer.id, tenantId }, "demo courier: accept skipped");
    }
  }
  return accepted;
}

/** Collect orders that have been held at the merchant long enough. */
async function pickUpDueOrders(tenantId: string, now: Date): Promise<number> {
  const orders = await prisma.deliveryOrder.findMany({
    where: {
      tenantId,
      status: "ASSIGNED",
      assignedAt: { lte: new Date(now.getTime() - PICKUP_AFTER_SEC * 1000) },
    },
    select: { id: true, orderNumber: true, vendorId: true, driverId: true },
    orderBy: { assignedAt: "asc" },
    take: BATCH,
  });

  let pickedUp = 0;
  for (const order of orders) {
    try {
      // Through the FSM, exactly as the driver app does it: a guarded
      // updateMany, an OrderEvent and the order.picked_up SSE. A demo that
      // writes status directly is a demo of something we do not ship.
      const { tx } = await prisma.$transaction(async (trx) => {
        await transitionOrder(trx, {
          orderId: order.id,
          tenantId,
          from: "ASSIGNED",
          to: "PICKED_UP",
          actor: { type: "DRIVER", id: order.driverId ?? undefined, name: "demo courier" },
          data: { pickedUpAt: now },
          eventMeta: {
            orderNumber: order.orderNumber,
            vendorId: order.vendorId,
            driverId: order.driverId,
            demo: true,
          },
        });
        return { tx: trx };
      });
      flushOrderEvents(tx as unknown as Prisma.TransactionClient);
      pickedUp += 1;
    } catch (err) {
      logger.debug({ err, orderId: order.id, tenantId }, "demo courier: pickup skipped");
    }
  }
  return pickedUp;
}

/** Complete drops that have been on the road long enough. */
async function deliverDueOrders(tenantId: string, now: Date): Promise<number> {
  const orders = await prisma.deliveryOrder.findMany({
    where: {
      tenantId,
      status: "PICKED_UP",
      pickedUpAt: { lte: new Date(now.getTime() - DELIVER_AFTER_SEC * 1000) },
    },
    select: { id: true, driverId: true, paymentMethod: true, orderTotalKwd: true },
    orderBy: { pickedUpAt: "asc" },
    take: BATCH,
  });

  let delivered = 0;
  for (const order of orders) {
    try {
      await completeDelivery({
        tenantId,
        orderId: order.id,
        actor: { type: "DRIVER", id: order.driverId ?? undefined, name: "demo courier" },
        podMethod: "PIN",
        // COD only. A prepaid order has no cash to hand over, and inventing a
        // collection would post a driver-cash leg that never happened.
        ...(order.paymentMethod === "COD"
          ? { codCollectedKwd: String(order.orderTotalKwd) }
          : {}),
      });
      delivered += 1;
    } catch (err) {
      logger.debug({ err, orderId: order.id, tenantId }, "demo courier: delivery skipped");
    }
  }
  return delivered;
}

/**
 * One pass over every demo tenant. Safe to call every tick, a no-op unless both
 * switches are on.
 *
 * Never throws: this runs inside the dispatch sweep, and the sweep is the only
 * thing moving real orders on this deployment. A demo convenience failing must
 * not take it down.
 */
export async function runDemoCouriers(now: Date = new Date()): Promise<DemoCourierResult> {
  const result: DemoCourierResult = { tenants: 0, accepted: 0, pickedUp: 0, delivered: 0 };
  if (!autoCourierEnabled()) return result;

  const tenantIds = demoTenantIds();
  if (tenantIds.length === 0) return result;

  for (const tenantId of tenantIds) {
    result.tenants += 1;
    // Each leg is guarded on its own: a failure to accept must not cost the
    // orders already on the road their delivery.
    try {
      result.accepted += await acceptDueOffers(tenantId, now);
    } catch (err) {
      logger.warn({ err, tenantId }, "demo courier: accept leg failed");
    }
    try {
      result.pickedUp += await pickUpDueOrders(tenantId, now);
    } catch (err) {
      logger.warn({ err, tenantId }, "demo courier: pickup leg failed");
    }
    try {
      result.delivered += await deliverDueOrders(tenantId, now);
    } catch (err) {
      logger.warn({ err, tenantId }, "demo courier: delivery leg failed");
    }
  }
  return result;
}
