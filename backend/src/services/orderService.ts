/**
 * Darb 2.0 order service (plan §A2 / §A8) — the single entry point for
 * creating and driving DeliveryOrders. Foodics webhook ingest, the vendor
 * portal, and supervisor manual creation ALL call createDeliveryOrder with
 * identical semantics (rejections persist a REJECTED row, never throw).
 *
 * All transitions go through services/orderStateMachine.transitionOrder
 * (status-guarded updateMany + OrderEvent append + post-commit SSE).
 * Money is Prisma.Decimal everywhere.
 */
import { randomInt } from "crypto";
import { DeliveryOrder, DeliveryOrderStatus, Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { quoteDelivery } from "./pricingService";
import {
  postCodSettlement,
  postPrepaidSettlement,
} from "./wallet/walletService";
import {
  OrderActor,
  OrderStateConflictError,
  SYSTEM_ACTOR,
  flushOrderEvents,
  publishOrderEvent,
  transitionOrder,
} from "./orderStateMachine";
import { enqueueDispatchStart, removeOfferExpiryJob } from "../queues/dispatchQueue";
import { markDriverBusy, releaseDriverToOnline } from "./dispatch/driverPresence";
import { enqueueFoodicsWriteback } from "./foodics/writebackHook";
import { sendDispatchDriverPush } from "./driverAppPushService";

/**
 * v1 flat delivery promise: order placed → at the customer's door in 45
 * minutes. slaDeadline = createdAt + SLA_PROMISE_MINUTES; the ops jeopardy
 * rail and the driver app SLA banner both count down against it.
 */
export const SLA_PROMISE_MINUTES = 45;

/** Domain error for lookups — routes map to HTTP 404. */
export class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`);
    this.name = "OrderNotFoundError";
  }
}

// ─── Contracts ─────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  tenantId: string;
  source: "FOODICS" | "VENDOR_PORTAL" | "SUPERVISOR";
  vendorId: string;
  branchId: string;
  paymentMethod: "COD" | "PREPAID";
  orderTotalKwd: string | number;
  customerName?: string;
  customerPhone?: string;
  dropoffAddress?: string;
  dropoff: { lat?: number; lng?: number; zoneId?: string };
  foodicsOrderId?: string;
  metadata?: Record<string, unknown>;
  actor: OrderActor;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Next per-tenant, per-vendor order number "DRB-{vendorCode}-{seq}" —
 * analogous to utils/ticketNumber.ts (max-existing + 1, zero-padded so the
 * string sort stays numeric). The @@unique([tenantId, orderNumber])
 * constraint backstops concurrent creators; createDeliveryOrder retries once
 * on P2002.
 */
async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  vendorCode: string,
): Promise<string> {
  const prefix = `DRB-${vendorCode}-`;
  const last = await tx.deliveryOrder.findFirst({
    where: { tenantId, orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const nextNum = last
    ? parseInt(last.orderNumber.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

/** 4 random digits (leading zeros allowed), crypto-sourced. */
function generatePodPin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

function isP2002(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "P2002";
}

function toDecimal(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function baseEventMeta(order: {
  orderNumber: string;
  vendorId: string;
  driverId?: string | null;
  deliveryFeeKwd?: Prisma.Decimal | null;
}): Record<string, unknown> {
  return {
    orderNumber: order.orderNumber,
    vendorId: order.vendorId,
    ...(order.driverId ? { driverId: order.driverId } : {}),
    ...(order.deliveryFeeKwd != null ? { feeKwd: order.deliveryFeeKwd.toFixed(3) } : {}),
  };
}

async function getOrderOrThrow(
  tenantId: string,
  orderId: string,
): Promise<DeliveryOrder> {
  const order = await prisma.deliveryOrder.findFirst({ where: { id: orderId, tenantId } });
  if (!order) throw new OrderNotFoundError(orderId);
  return order;
}

/** Fire-and-forget Foodics milestone write-back (never blocks the lifecycle). */
function fireFoodicsWriteback(
  orderId: string,
  milestone: "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "CANCELLED",
): void {
  void enqueueFoodicsWriteback(orderId, milestone).catch((err) =>
    logger.warn({ err, orderId, milestone }, "foodics writeback enqueue failed"),
  );
}

/**
 * Cancel every still-OFFERED offer for an order inside the caller's tx.
 * Returns the ids so the caller can best-effort remove their expiry jobs
 * after commit.
 */
async function cancelOpenOffers(
  tx: Prisma.TransactionClient,
  tenantId: string,
  orderId: string,
): Promise<string[]> {
  const open = await tx.dispatchOffer.findMany({
    where: { tenantId, orderId, status: "OFFERED" },
    select: { id: true },
  });
  if (open.length === 0) return [];
  await tx.dispatchOffer.updateMany({
    where: { tenantId, orderId, status: "OFFERED" },
    data: { status: "CANCELLED", respondedAt: new Date() },
  });
  return open.map((o) => o.id);
}

function removeExpiryJobs(offerIds: string[]): void {
  for (const id of offerIds) {
    void removeOfferExpiryJob(id).catch(() => {});
  }
}

// ─── Create ────────────────────────────────────────────────────────────────

/**
 * Create a delivery order. Identical path for Foodics ingest, vendor portal,
 * and supervisor manual creation:
 *
 *   - vendor paused          ⇒ persist REJECTED (VENDOR_PAUSED), return it
 *   - quote not ok           ⇒ persist REJECTED (quote reason), return it
 *   - quote ok               ⇒ CREATED row (orderNumber, podPin, slaDeadline,
 *                              zones + fee from the quote) → transition to
 *                              DISPATCHING → enqueueDispatchStart → SSE
 *                              order.created
 *
 * Returns the row WHATEVER its status (REJECTED included) — callers inspect
 * `status`/`rejectionReason`. Throws only for caller errors (unknown vendor
 * or branch) and infrastructure failures.
 */
export async function createDeliveryOrder(input: CreateOrderInput): Promise<DeliveryOrder> {
  const { tenantId, actor } = input;

  const vendor = await prisma.vendor.findFirst({
    where: { id: input.vendorId, tenantId },
    select: { id: true, code: true, isPaused: true, requiresCarOnly: true },
  });
  if (!vendor) throw new Error(`Vendor ${input.vendorId} not found`);

  const branch = await prisma.vendorBranch.findFirst({
    where: { id: input.branchId, tenantId, vendorId: input.vendorId },
    select: { id: true },
  });
  if (!branch) throw new Error(`Branch ${input.branchId} not found for vendor ${input.vendorId}`);

  const dropoffLat =
    typeof input.dropoff?.lat === "number" && Number.isFinite(input.dropoff.lat)
      ? input.dropoff.lat
      : null;
  const dropoffLng =
    typeof input.dropoff?.lng === "number" && Number.isFinite(input.dropoff.lng)
      ? input.dropoff.lng
      : null;

  const baseData = {
    tenantId,
    source: input.source,
    vendorId: input.vendorId,
    branchId: input.branchId,
    paymentMethod: input.paymentMethod,
    orderTotalKwd: toDecimal(input.orderTotalKwd),
    customerName: input.customerName ?? null,
    customerPhone: input.customerPhone ?? null,
    dropoffAddress: input.dropoffAddress ?? null,
    dropoffLat,
    dropoffLng,
    foodicsOrderId: input.foodicsOrderId ?? null,
    requiresCarOnly: vendor.requiresCarOnly,
    metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
  };

  // ── Rejection path (persist + SSE, identical for every source) ──────────
  const persistRejected = async (reason: string): Promise<DeliveryOrder> => {
    const attempt = () =>
      prisma.$transaction(async (tx) => {
        const orderNumber = await nextOrderNumber(tx, tenantId, vendor.code);
        const order = await tx.deliveryOrder.create({
          data: {
            ...baseData,
            orderNumber,
            status: "REJECTED",
            rejectionReason: reason,
          },
        });
        await tx.orderEvent.create({
          data: {
            tenantId,
            orderId: order.id,
            action: "order.rejected",
            description: `Order ${orderNumber} rejected: ${reason}`,
            operator: actor.name ?? actor.type,
            operatorId: actor.id ?? null,
            timestamp: new Date(),
            metadata: { reason, source: input.source, actorType: actor.type } as Prisma.InputJsonValue,
          },
        });
        return order;
      });

    let order: DeliveryOrder;
    try {
      order = await attempt();
    } catch (err) {
      if (!isP2002(err)) throw err;
      order = await attempt(); // orderNumber race — retry once
    }
    publishOrderEvent(tenantId, "order.rejected", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      vendorId: order.vendorId,
      status: "REJECTED",
      reason,
    });
    return order;
  };

  if (vendor.isPaused) return persistRejected("VENDOR_PAUSED");

  const quote = await quoteDelivery(tenantId, {
    branchId: input.branchId,
    dropoff: input.dropoff ?? {},
  });
  if (!quote.ok) {
    // Explicit narrowing — ts-jest compiles with strict:false, where the
    // `!quote.ok` discriminant doesn't narrow the union.
    const rejection = quote as Extract<typeof quote, { ok: false }>;
    return persistRejected(rejection.reason);
  }

  // ── Happy path: CREATED row → DISPATCHING ───────────────────────────────
  const attemptCreate = () =>
    prisma.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx, tenantId, vendor.code);
      const order = await tx.deliveryOrder.create({
        data: {
          ...baseData,
          orderNumber,
          status: "CREATED",
          pickupZoneId: quote.pickupZoneId,
          dropoffZoneId: quote.dropoffZoneId,
          deliveryFeeKwd: quote.feeKwd,
          podPin: generatePodPin(),
          slaDeadline: new Date(Date.now() + SLA_PROMISE_MINUTES * 60_000),
        },
      });
      await tx.orderEvent.create({
        data: {
          tenantId,
          orderId: order.id,
          action: "order.created",
          description: `Order ${orderNumber} created via ${input.source}`,
          operator: actor.name ?? actor.type,
          operatorId: actor.id ?? null,
          timestamp: new Date(),
          metadata: {
            source: input.source,
            actorType: actor.type,
            feeKwd: quote.feeKwd.toFixed(3),
            pickupZoneId: quote.pickupZoneId,
            dropoffZoneId: quote.dropoffZoneId,
          } as Prisma.InputJsonValue,
        },
      });
      await transitionOrder(tx, {
        orderId: order.id,
        tenantId,
        from: "CREATED",
        to: "DISPATCHING",
        actor: SYSTEM_ACTOR,
        eventMeta: baseEventMeta({ ...order, deliveryFeeKwd: quote.feeKwd }),
      });
      const updated = await tx.deliveryOrder.findFirst({ where: { id: order.id, tenantId } });
      return { tx, order: updated ?? { ...order, status: "DISPATCHING" as DeliveryOrderStatus } };
    });

  let created: { tx: object; order: DeliveryOrder };
  try {
    created = await attemptCreate();
  } catch (err) {
    if (!isP2002(err)) throw err;
    created = await attemptCreate(); // orderNumber race — retry once
  }
  const order = created.order;

  flushOrderEvents(created.tx); // (CREATED→DISPATCHING collects no SSE type)
  publishOrderEvent(tenantId, "order.created", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    vendorId: order.vendorId,
    status: order.status,
    feeKwd: quote.feeKwd.toFixed(3),
  });

  try {
    await enqueueDispatchStart(order.id, tenantId);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "enqueueDispatchStart failed — order stuck in DISPATCHING until redispatch");
  }

  return order;
}

// ─── Cancel ────────────────────────────────────────────────────────────────

const VENDOR_CANCELLABLE: DeliveryOrderStatus[] = [
  "CREATED",
  "DISPATCHING",
  "NO_DRIVER",
  "ASSIGNED",
];

/**
 * Cancel an order. `allowFrom` defaults to the pre-pickup set (vendor
 * semantics); supervisors pass the wider pre-DELIVERED set. Cancels any
 * still-OFFERED dispatch offers first.
 */
export async function cancelOrder(args: {
  tenantId: string;
  orderId: string;
  reason: string;
  actor: OrderActor;
  allowFrom?: DeliveryOrderStatus[];
}): Promise<DeliveryOrder> {
  const { tenantId, orderId, reason, actor } = args;
  const allowFrom = args.allowFrom ?? VENDOR_CANCELLABLE;

  const order = await getOrderOrThrow(tenantId, orderId);
  if (!allowFrom.includes(order.status)) {
    throw new OrderStateConflictError(orderId, order.status, "CANCELLED");
  }

  const { tx, cancelledOffers, updated } = await prisma.$transaction(async (trx) => {
    const offers = await cancelOpenOffers(trx, tenantId, orderId);
    await transitionOrder(trx, {
      orderId,
      tenantId,
      from: order.status,
      to: "CANCELLED",
      actor,
      data: { cancelReason: reason, cancelledAt: new Date() },
      eventMeta: { ...baseEventMeta(order), reason },
    });
    // A driver mid-delivery is freed back to ONLINE (contract #2).
    if (order.driverId) {
      await releaseDriverToOnline(trx, tenantId, order.driverId);
    }
    const row = await trx.deliveryOrder.findFirst({ where: { id: orderId, tenantId } });
    return { tx: trx, cancelledOffers: offers, updated: row };
  });

  flushOrderEvents(tx);
  removeExpiryJobs(cancelledOffers);
  fireFoodicsWriteback(orderId, "CANCELLED");
  return updated ?? { ...order, status: "CANCELLED", cancelReason: reason };
}

// ─── Deliver ───────────────────────────────────────────────────────────────

/**
 * PICKED_UP → DELIVERED + wallet settlement, atomically (one interactive
 * transaction — plan §A5: the settlement posts INSIDE the DELIVERED
 * transition's tx; both idempotent postings collapse replays via P2002).
 */
export async function completeDelivery(args: {
  tenantId: string;
  orderId: string;
  actor: OrderActor;
  codCollectedKwd?: string | number;
  proofPhotoUrl?: string;
  podMethod?: "PIN" | "PHOTO";
}): Promise<{ order: DeliveryOrder }> {
  const { tenantId, orderId, actor } = args;

  const order = await getOrderOrThrow(tenantId, orderId);
  if (order.paymentMethod === "COD" && !order.driverId) {
    // Settlement needs the driver's cash account; a PICKED_UP order always
    // has one — anything else is data corruption we refuse to settle.
    throw new OrderStateConflictError(orderId, order.status, "DELIVERED");
  }

  const { tx, updated } = await prisma.$transaction(async (trx) => {
    await transitionOrder(trx, {
      orderId,
      tenantId,
      from: "PICKED_UP",
      to: "DELIVERED",
      actor,
      data: {
        deliveredAt: new Date(),
        ...(args.codCollectedKwd != null
          ? { codCollectedKwd: toDecimal(args.codCollectedKwd) }
          : {}),
        ...(args.proofPhotoUrl ? { proofPhotoUrl: args.proofPhotoUrl } : {}),
      },
      eventMeta: {
        ...baseEventMeta(order),
        ...(args.podMethod ? { podMethod: args.podMethod } : {}),
      },
    });

    const settlementOrder = {
      id: order.id,
      tenantId,
      driverId: order.driverId as string,
      vendorId: order.vendorId,
      orderTotalKwd: new Prisma.Decimal(order.orderTotalKwd),
      deliveryFeeKwd: new Prisma.Decimal(order.deliveryFeeKwd ?? 0),
    };
    if (order.paymentMethod === "COD") {
      await postCodSettlement(trx, settlementOrder);
    } else {
      await postPrepaidSettlement(trx, settlementOrder);
    }

    // Trip done — the driver's BUSY session goes back to ONLINE (contract #2).
    if (order.driverId) {
      await releaseDriverToOnline(trx, tenantId, order.driverId);
    }

    const row = await trx.deliveryOrder.findFirst({ where: { id: orderId, tenantId } });
    return { tx: trx, updated: row };
  });

  flushOrderEvents(tx); // publishes order.delivered
  fireFoodicsWriteback(orderId, "DELIVERED");

  return { order: updated ?? { ...order, status: "DELIVERED" } };
}

// ─── Fail ──────────────────────────────────────────────────────────────────

/** ASSIGNED | PICKED_UP → FAILED with a reason (driver-reported). */
export async function failDelivery(args: {
  tenantId: string;
  orderId: string;
  reason: string;
  actor: OrderActor;
}): Promise<DeliveryOrder> {
  const { tenantId, orderId, reason, actor } = args;

  const order = await getOrderOrThrow(tenantId, orderId);
  if (order.status !== "ASSIGNED" && order.status !== "PICKED_UP") {
    throw new OrderStateConflictError(orderId, order.status, "FAILED");
  }

  const { tx, updated } = await prisma.$transaction(async (trx) => {
    await transitionOrder(trx, {
      orderId,
      tenantId,
      from: order.status,
      to: "FAILED",
      actor,
      data: { failureReason: reason },
      eventMeta: { ...baseEventMeta(order), reason },
    });
    // Failed trip still frees the driver (contract #2).
    if (order.driverId) {
      await releaseDriverToOnline(trx, tenantId, order.driverId);
    }
    const row = await trx.deliveryOrder.findFirst({ where: { id: orderId, tenantId } });
    return { tx: trx, updated: row };
  });

  flushOrderEvents(tx); // publishes order.failed
  // Foodics has no FAILED milestone — the write-back worker maps it to a
  // cancellation on the POS side.
  fireFoodicsWriteback(orderId, "CANCELLED");
  return updated ?? { ...order, status: "FAILED", failureReason: reason };
}

// ─── Manual assign ─────────────────────────────────────────────────────────

/**
 * Supervisor manual assignment from NO_DRIVER or DISPATCHING: cancels any
 * open OFFERED rows, records an ACCEPTED DispatchOffer at round -1, sets
 * driverId/assignedAt, and nudges the driver via Expo push (best-effort).
 */
export async function assignDriverManually(args: {
  tenantId: string;
  orderId: string;
  driverId: string;
  actor: OrderActor;
}): Promise<DeliveryOrder> {
  const { tenantId, orderId, driverId, actor } = args;

  const order = await getOrderOrThrow(tenantId, orderId);
  if (order.status !== "NO_DRIVER" && order.status !== "DISPATCHING") {
    throw new OrderStateConflictError(orderId, order.status, "ASSIGNED");
  }

  const driver = await prisma.driver.findFirst({
    where: { id: driverId, tenantId },
    select: { id: true, name: true },
  });
  if (!driver) throw new Error(`Driver ${driverId} not found`);

  const now = new Date();
  const { tx, cancelledOffers, updated } = await prisma.$transaction(async (trx) => {
    const offers = await cancelOpenOffers(trx, tenantId, orderId);
    // Manual assignment = ACCEPTED offer row at round -1 (upsert so a repeat
    // manual assign of the same driver after a redispatch doesn't P2002).
    await trx.dispatchOffer.upsert({
      where: { orderId_driverId_round: { orderId, driverId, round: -1 } },
      create: {
        tenantId,
        orderId,
        driverId,
        round: -1,
        status: "ACCEPTED",
        offeredAt: now,
        expiresAt: now,
        respondedAt: now,
      },
      update: { status: "ACCEPTED", respondedAt: now },
    });
    await transitionOrder(trx, {
      orderId,
      tenantId,
      from: order.status,
      to: "ASSIGNED",
      actor,
      data: { driverId, assignedAt: now },
      eventMeta: { ...baseEventMeta(order), driverId, manual: true },
    });
    // Manual assignment marks the session BUSY too (contract #2).
    await markDriverBusy(trx, tenantId, driverId);
    const row = await trx.deliveryOrder.findFirst({ where: { id: orderId, tenantId } });
    return { tx: trx, cancelledOffers: offers, updated: row };
  });

  flushOrderEvents(tx); // publishes order.assigned
  removeExpiryJobs(cancelledOffers);
  fireFoodicsWriteback(orderId, "ASSIGNED");

  try {
    await sendDispatchDriverPush({
      tenantId,
      issuedById: actor.id ?? "SYSTEM",
      driverIds: [driverId],
      title: "New delivery assigned",
      body: `Order ${order.orderNumber} has been assigned to you. Open the app to start.`,
      data: { type: "order_assigned", orderId, orderNumber: order.orderNumber },
    });
  } catch (err) {
    logger.warn({ err, orderId, driverId }, "manual-assign driver push failed");
  }

  return updated ?? { ...order, status: "ASSIGNED", driverId, assignedAt: now };
}

// ─── Redispatch ────────────────────────────────────────────────────────────

/**
 * Put an order back through the dispatch engine: cancel any open OFFERED
 * rows, ensure status DISPATCHING (NO_DRIVER → DISPATCHING when exhausted),
 * and enqueue dispatch-start.
 */
export async function redispatchOrder(args: {
  tenantId: string;
  orderId: string;
  actor: OrderActor;
}): Promise<void> {
  const { tenantId, orderId, actor } = args;

  const order = await getOrderOrThrow(tenantId, orderId);
  if (order.status !== "NO_DRIVER" && order.status !== "DISPATCHING") {
    throw new OrderStateConflictError(orderId, order.status, "DISPATCHING");
  }

  const { tx, cancelledOffers } = await prisma.$transaction(async (trx) => {
    const offers = await cancelOpenOffers(trx, tenantId, orderId);
    if (order.status === "NO_DRIVER") {
      await transitionOrder(trx, {
        orderId,
        tenantId,
        from: "NO_DRIVER",
        to: "DISPATCHING",
        actor,
        eventMeta: { ...baseEventMeta(order), redispatch: true },
      });
    } else {
      // Already DISPATCHING — record the manual kick in the timeline.
      await trx.orderEvent.create({
        data: {
          tenantId,
          orderId,
          action: "order.redispatch",
          description: `Dispatch restarted (by ${actor.name ?? actor.type})`,
          operator: actor.name ?? actor.type,
          operatorId: actor.id ?? null,
          timestamp: new Date(),
          metadata: { actorType: actor.type } as Prisma.InputJsonValue,
        },
      });
    }
    return { tx: trx, cancelledOffers: offers };
  });

  flushOrderEvents(tx);
  removeExpiryJobs(cancelledOffers);
  await enqueueDispatchStart(orderId, tenantId);
}
