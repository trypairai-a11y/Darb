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
import { randomBytes, randomInt } from "crypto";
import { DeliveryOrder, DeliveryOrderStatus, Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { notifyOrderAssigned } from "./driverNotificationService";
import { quoteDelivery } from "./pricingService";
import {
  isVendorOverCreditCap,
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
import { fireCustomerMilestone } from "./customerMessagingService";
import { sendDispatchDriverPush } from "./driverAppPushService";

/**
 * v1 flat delivery promise: order placed → at the customer's door in 45
 * minutes. slaDeadline = createdAt + SLA_PROMISE_MINUTES; the ops jeopardy
 * rail and the driver app SLA banner both count down against it.
 */
export const SLA_PROMISE_MINUTES = 45;

/**
 * PRD §6 scheduled orders: dispatch starts this many minutes before
 * scheduledAt. Orders scheduled closer than the lead dispatch immediately.
 */
export const SCHEDULE_LEAD_MINUTES = 15;

/**
 * Who hears about an order intake refused. Same three roles the dispatch
 * exhaustion notice goes to — the people who can actually do something about
 * an order sitting outside the pipeline.
 */
const OPS_ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] as const;

/**
 * One line per rejection reason, phrased as the thing to go and do. A
 * notification that only restates the enum teaches the reader nothing they
 * could not see on the row itself.
 */
const REJECTION_ACTIONS: Record<string, { en: string; ar: string }> = {
  OUT_OF_ZONE_DROPOFF: {
    en: "The drop is outside every delivery zone. Draw a zone that covers it and price the pair, or handle this order manually.",
    ar: "موقع التسليم خارج جميع مناطق التوصيل. أضف منطقة تغطيه وحدد سعرها، أو تعامل مع الطلب يدويا.",
  },
  UNSERVICEABLE_PAIR: {
    en: "The delivery plan has no price for this zone pair. Fill the cell in the plan, then re-enter the order.",
    ar: "خطة التوصيل لا تحتوي على سعر لهذا الزوج من المناطق. أضف السعر في الخطة ثم أعد إدخال الطلب.",
  },
  NO_COORDINATES: {
    en: "The order arrived without a map pin. Add the dropoff location to release it.",
    ar: "وصل الطلب بدون موقع على الخريطة. أضف موقع التسليم لتحريره.",
  },
  BRANCH_UNZONED: {
    en: "The pickup branch sits in no zone. Zone the branch to release its orders.",
    ar: "فرع الاستلام غير مرتبط بأي منطقة. حدد منطقة الفرع لتحرير طلباته.",
  },
  VENDOR_PAUSED: {
    en: "The merchant is paused. Un-pause it to resume intake.",
    ar: "التاجر متوقف مؤقتا. أعد تفعيله لاستئناف استقبال الطلبات.",
  },
  BRANCH_PAUSED: {
    en: "This branch is paused. The shop can resume it from its own settings, or un-pause it here.",
    ar: "هذا الفرع متوقف مؤقتا. يمكن للمتجر إعادة تفعيله من إعداداته، أو أعد تفعيله من هنا.",
  },
  VENDOR_CREDIT_CAP: {
    en: "The merchant is at its credit cap. Settle the outstanding balance to resume intake.",
    ar: "التاجر وصل إلى حد الائتمان. سدد الرصيد المستحق لاستئناف استقبال الطلبات.",
  },
};

const FALLBACK_ACTION = {
  en: "Review the order and release it manually.",
  ar: "راجع الطلب وحرره يدويا.",
};

/**
 * Tell ops an order was refused at intake. Before this, a refused order landed
 * in the Needs review list and waited for somebody to happen to look — the
 * client's ask was "any order that comes in, we're in the picture".
 *
 * Best-effort by design: a notification that fails must never cost us the
 * REJECTED row itself, which is the actual record of what happened.
 */
async function notifyOpsOrderRejected(
  order: DeliveryOrder,
  reason: string,
  vendorName?: string | null,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: order.tenantId, role: { in: [...OPS_ROLES] }, isActive: true },
      select: { id: true },
    });
    if (users.length === 0) return;

    const action = REJECTION_ACTIONS[reason] ?? FALLBACK_ACTION;
    const from = vendorName ? ` from ${vendorName}` : "";
    const fromAr = vendorName ? ` من ${vendorName}` : "";
    await prisma.notification.createMany({
      data: users.map((user) => ({
        tenantId: order.tenantId,
        userId: user.id,
        title: "Order needs review",
        message: `Order ${order.orderNumber}${from} could not be priced. ${action.en}`,
        titleAr: "طلب يحتاج مراجعة",
        bodyAr: `تعذر تسعير الطلب ${order.orderNumber}${fromAr}. ${action.ar}`,
        type: "ORDER_NEEDS_REVIEW",
        severity: "HIGH",
        sourceId: order.id,
        category: "OPS_TODO",
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          vendorId: order.vendorId,
          reason,
          dropoffLat: order.dropoffLat == null ? null : Number(order.dropoffLat),
          dropoffLng: order.dropoffLng == null ? null : Number(order.dropoffLng),
        } as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    logger.warn({ err, orderId: order.id, reason }, "order-rejected ops notification failed");
  }
}

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
  source: "FOODICS" | "VENDOR_PORTAL" | "SUPERVISOR" | "PARTNER_API";
  vendorId: string;
  branchId: string;
  paymentMethod: "COD" | "PREPAID";
  orderTotalKwd: string | number;
  customerName?: string;
  customerPhone?: string;
  dropoffAddress?: string;
  dropoff: { lat?: number; lng?: number; zoneId?: string };
  foodicsOrderId?: string;
  /** PRD §2 partner intake: the merchant system's own order id (idempotency). */
  externalRef?: string;
  /** PRD §6 scheduling: future dispatch time. Omit for immediate orders. */
  scheduledAt?: Date;
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

  /**
   * The maximum is taken NUMERICALLY, in the database, and that is the fix.
   *
   * This function has now hit the same wall twice for the same reason: someone
   * reasoned about a text column as though it sorted like numbers. The first
   * time, "9999" sorted above "10000" at four digits, so the sequence stuck
   * forever. The second time, the widening to six digits carried a comment
   * claiming legacy 4-digit numbers "sort below every 6-digit one because they
   * are shorter strings". They do not. Comparison is character by character, so
   * "0169" beats "000170" at the second character, and every legacy row
   * outranked the first new-format one.
   *
   * The consequence was total rather than cosmetic: `ORDER BY ... DESC LIMIT 50`
   * returned only 4-digit rows, the highest read 169, the next number was
   * "000170", and that already existed. Every order for that merchant failed on
   * the unique constraint, permanently, including the retry. Al Dawaa Pharmacy
   * was dead in production the moment its first six-digit order existed.
   *
   * Casting the suffix to an integer and letting Postgres take the MAX removes
   * the class, not the instance: it is correct whatever the padding width is
   * today, whatever it was historically, and whatever it becomes next. The
   * regex guard keeps a malformed suffix from turning the cast into an error.
   */
  const WIDTH = 6;
  const rows = await tx.$queryRaw<Array<{ highest: number | null }>>`
    SELECT MAX(CAST(SUBSTRING("orderNumber" FROM ${prefix.length + 1}) AS INTEGER)) AS highest
    FROM "DeliveryOrder"
    WHERE "tenantId" = ${tenantId}
      AND "orderNumber" LIKE ${prefix + "%"}
      AND SUBSTRING("orderNumber" FROM ${prefix.length + 1}) ~ '^[0-9]+$'
  `;
  const highest = Number(rows[0]?.highest ?? 0) || 0;
  return `${prefix}${String(highest + 1).padStart(WIDTH, "0")}`;
}

/** 4 random digits (leading zeros allowed), crypto-sourced. */
function generatePodPin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

/**
 * PRD §12 tracking-link credential: 128-bit random, base64url. The only auth
 * for the public /api/track surface, so it must be unguessable.
 */
export function generateTrackingToken(): string {
  return randomBytes(16).toString("base64url");
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
    select: { id: true, code: true, name: true, isPaused: true, requiresCarOnly: true },
  });
  if (!vendor) throw new Error(`Vendor ${input.vendorId} not found`);

  const branch = await prisma.vendorBranch.findFirst({
    where: { id: input.branchId, tenantId, vendorId: input.vendorId },
    select: { id: true, isPaused: true },
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
    externalRef: input.externalRef ?? null,
    trackingToken: generateTrackingToken(),
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
    // Ops hears about it now rather than on the next glance at the queue.
    await notifyOpsOrderRejected(order, reason, vendor.name);
    return order;
  };

  if (vendor.isPaused) return persistRejected("VENDOR_PAUSED");

  // Revision 10 (#7): a shop can now stop one counter without stopping the
  // account. Its own reason, so the Needs review list says which branch closed
  // rather than blaming the whole merchant.
  if (branch.isPaused) return persistRejected("BRANCH_PAUSED");

  // PRD §11 credit line: outstanding debt at/over the cap pauses intake
  // until the merchant settles.
  if (await isVendorOverCreditCap(tenantId, vendor.id)) {
    return persistRejected("VENDOR_CREDIT_CAP");
  }

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
  // PRD §6 scheduling: a far-enough-future scheduledAt persists as CREATED
  // and is advanced to DISPATCHING by sweepScheduledOrders near the due time.
  const scheduledAt =
    input.scheduledAt &&
    input.scheduledAt.getTime() > Date.now() + SCHEDULE_LEAD_MINUTES * 60_000
      ? input.scheduledAt
      : null;

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
          scheduledAt,
          // The 45-minute promise counts from dispatch start: creation for
          // immediate orders, the scheduled time for scheduled ones.
          slaDeadline: new Date(
            (scheduledAt ? scheduledAt.getTime() : Date.now()) +
              SLA_PROMISE_MINUTES * 60_000,
          ),
        },
      });
      await tx.orderEvent.create({
        data: {
          tenantId,
          orderId: order.id,
          action: "order.created",
          description: scheduledAt
            ? `Order ${orderNumber} scheduled via ${input.source} for ${scheduledAt.toISOString()}`
            : `Order ${orderNumber} created via ${input.source}`,
          operator: actor.name ?? actor.type,
          operatorId: actor.id ?? null,
          timestamp: new Date(),
          metadata: {
            source: input.source,
            actorType: actor.type,
            feeKwd: quote.feeKwd.toFixed(3),
            pickupZoneId: quote.pickupZoneId,
            dropoffZoneId: quote.dropoffZoneId,
            ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
          } as Prisma.InputJsonValue,
        },
      });
      if (!scheduledAt) {
        await transitionOrder(tx, {
          orderId: order.id,
          tenantId,
          from: "CREATED",
          to: "DISPATCHING",
          actor: SYSTEM_ACTOR,
          eventMeta: baseEventMeta({ ...order, deliveryFeeKwd: quote.feeKwd }),
        });
      }
      const updated = await tx.deliveryOrder.findFirst({ where: { id: order.id, tenantId } });
      return {
        tx,
        order:
          updated ??
          { ...order, status: (scheduledAt ? "CREATED" : "DISPATCHING") as DeliveryOrderStatus },
      };
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
  fireCustomerMilestone(order.id, tenantId, "CREATED");

  if (!scheduledAt) {
    try {
      await enqueueDispatchStart(order.id, tenantId);
    } catch (err) {
      logger.error({ err, orderId: order.id }, "enqueueDispatchStart failed — order stuck in DISPATCHING until redispatch");
    }
  }

  return order;
}

// ─── Scheduled orders sweep ────────────────────────────────────────────────

/**
 * PRD §6: advance due scheduled orders (CREATED with scheduledAt within the
 * lead window) into DISPATCHING. Cross-tenant by design — driven by the
 * /api/cron tick, same trust model as sweepDispatch. The guarded
 * CREATED→DISPATCHING transition makes concurrent sweeps safe; a vendor
 * cancel that lands first simply wins the guard.
 */
export async function sweepScheduledOrders(now = new Date()): Promise<number> {
  const dueBefore = new Date(now.getTime() + SCHEDULE_LEAD_MINUTES * 60_000);
  // eslint-disable-next-line no-restricted-syntax -- cron sweep is cross-tenant by design
  const due = await prisma.deliveryOrder.findMany({
    where: {
      status: "CREATED",
      scheduledAt: { not: null, lte: dueBefore },
    },
    select: {
      id: true,
      tenantId: true,
      orderNumber: true,
      vendorId: true,
      deliveryFeeKwd: true,
    },
    take: 200,
  });

  let advanced = 0;
  for (const order of due) {
    try {
      const tx = await prisma.$transaction(async (trx) => {
        await transitionOrder(trx, {
          orderId: order.id,
          tenantId: order.tenantId,
          from: "CREATED",
          to: "DISPATCHING",
          actor: SYSTEM_ACTOR,
          eventMeta: baseEventMeta(order),
        });
        return trx;
      });
      flushOrderEvents(tx);
      await enqueueDispatchStart(order.id, order.tenantId);
      advanced += 1;
    } catch (err) {
      if (err instanceof OrderStateConflictError) continue; // cancelled meanwhile
      logger.error({ err, orderId: order.id }, "sweepScheduledOrders: advance failed");
    }
  }
  return advanced;
}

// ─── Return to merchant ────────────────────────────────────────────────────

/**
 * PRD §6/§10: rider support authorises return-to-merchant after a FAILED
 * delivery (customer unreachable). FAILED→RETURNED.
 *
 * Wallet: deliberate no-op. COD/prepaid settlement only posts inside the
 * DELIVERED transition, which never ran for a FAILED order — no cash was
 * ledgered, so there is nothing to reverse. A future failed-delivery fee
 * would be a new ADJUSTMENT posting, not a change here.
 */
export async function returnToMerchant(args: {
  tenantId: string;
  orderId: string;
  actor: OrderActor;
  note?: string;
}): Promise<DeliveryOrder> {
  const { tenantId, orderId, actor, note } = args;
  const order = await getOrderOrThrow(tenantId, orderId);

  const tx = await prisma.$transaction(async (trx) => {
    await transitionOrder(trx, {
      orderId,
      tenantId,
      from: "FAILED",
      to: "RETURNED",
      actor,
      data: { returnedAt: new Date() },
      eventMeta: { ...baseEventMeta(order), ...(note ? { note } : {}) },
    });
    return trx;
  });
  flushOrderEvents(tx);

  const updated = await prisma.deliveryOrder.findFirst({ where: { id: orderId, tenantId } });
  return updated ?? { ...order, status: "RETURNED" as DeliveryOrderStatus };
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
  fireCustomerMilestone(orderId, tenantId, "CANCELLED");
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
  fireCustomerMilestone(orderId, tenantId, "DELIVERED");

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
  fireCustomerMilestone(orderId, tenantId, "ASSIGNED");

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

  // The push is a moment; the feed is the record of it. A driver who missed the
  // banner, or whose notifications are off, still has somewhere to look.
  notifyOrderAssigned({ tenantId, driverId, orderId, orderNumber: order.orderNumber });

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
      // Revision 4 (#1): a human kick resets the automatic retry clock, so the
      // sweep does not fire a second dispatch a minute later on top of this one.
      await trx.deliveryOrder.updateMany({
        where: { id: orderId, tenantId },
        data: { nextRedispatchAt: null },
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
