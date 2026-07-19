/**
 * Darb 2.0 dispatch engine (plan §A3).
 *
 * Single-order, serialized offers: each round picks ONE candidate (nearest,
 * tiebreak longest-idle), writes a DispatchOffer with a 15s window, pushes an
 * Expo data-message nudge, and schedules the offer-expiry timer. Decline /
 * expiry advance to the next round (dispatch-next); acceptance runs the
 * status-guarded DISPATCHING→ASSIGNED transition. Round exhaustion (or an
 * empty candidate pool) transitions to NO_DRIVER + supervisor Notification +
 * SSE order.dispatch_exhausted.
 *
 * Concurrency model: every offer/order mutation is a status-guarded
 * updateMany — count===0 means the other side of the race (accept-vs-expire,
 * accept-vs-cancel, double decline) already won and the loser backs off
 * (OfferGoneError for accepts, silent no-op elsewhere). Plan §A1: offers are
 * DispatchOffer rows, never DeviceCommand — pushes here go straight to
 * exp.host with channelId "darb-offers" (sendDispatchDriverPush is NOT used
 * because it queues MDM DeviceCommand rows and pins channelId "darb-inbox").
 */
import { DeliveryOrder, Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { logger } from "../../config/logger";
import { haversineMeters } from "../../utils/geo";
import {
  OrderStateConflictError,
  SYSTEM_ACTOR,
  flushOrderEvents,
  publishOrderEvent,
  transitionOrder,
} from "../orderStateMachine";
import { isDriverOverCeiling } from "../wallet/walletService";
import { markDriverBusy } from "./driverPresence";
import {
  enqueueDispatchNext,
  removeOfferExpiryJob,
  scheduleOfferExpiry,
} from "../../queues/dispatchQueue";
import { enqueueFoodicsWriteback } from "../foodics/writebackHook";

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * The guarded accept lost the race (expired / declined / withdrawn / order no
 * longer DISPATCHING). Routes map this to HTTP 410 OFFER_EXPIRED.
 */
export class OfferGoneError extends Error {
  constructor(public readonly offerId: string) {
    super(`Offer ${offerId} is no longer available`);
    this.name = "OfferGoneError";
  }
}

// ─── Contracts ──────────────────────────────────────────────────────────────

export interface Candidate {
  driverId: string;
  name: string;
  phone: string | null;
  distanceKm: number;
  etaMin: number;
  activeOrders: number;
}

/** Average courier speed used for the ETA estimate (plan §A3). */
const AVG_SPEED_KMH = 30;

const SUPERVISOR_ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] as const;

interface DispatchSettings {
  offerWindowSec: number;
  maxOfferRounds: number;
  searchRadiusKm: number;
  gpsStaleAfterSec: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isP2002(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "P2002";
}

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function kwdNum(value: unknown): number {
  return Number(Number(value ?? 0).toFixed(3));
}

/**
 * FulfillmentSettings with schema defaults as fallback — a missing row must
 * not stall dispatch (mirrors isDriverOverCeiling's "unconfigured = permissive"
 * stance for reads while keeping the engine operational).
 */
async function getDispatchSettings(tenantId: string): Promise<DispatchSettings> {
  const row = await prisma.fulfillmentSettings.findUnique({ where: { tenantId } });
  return {
    offerWindowSec: row?.offerWindowSec ?? 15,
    maxOfferRounds: row?.maxOfferRounds ?? 8,
    searchRadiusKm: row?.searchRadiusKm ?? 8,
    gpsStaleAfterSec: row?.gpsStaleAfterSec ?? 180,
  };
}

type SessionWithDriver = {
  driverId: string;
  lastGpsAt: Date | null;
  lastGpsLat: unknown;
  lastGpsLng: unknown;
  startTime: Date;
  driver: {
    id: string;
    name: string;
    phone: string | null;
    status: string;
    vehicleType: string | null;
    expoPushToken: string | null;
  };
};

/** Latest session per driver (stale duplicate rows may exist). */
function latestSessionPerDriver(sessions: SessionWithDriver[]): SessionWithDriver[] {
  const byDriver = new Map<string, SessionWithDriver>();
  for (const s of sessions) {
    const current = byDriver.get(s.driverId);
    const sAt = s.lastGpsAt?.getTime() ?? s.startTime.getTime();
    const cAt = current
      ? (current.lastGpsAt?.getTime() ?? current.startTime.getTime())
      : -1;
    if (!current || sAt > cAt) byDriver.set(s.driverId, s);
  }
  return [...byDriver.values()];
}

// ─── Candidate selection (plan §A3, re-run every round) ────────────────────

/**
 * Ranked candidate list for an order. Filters, in order:
 *   1. CourierOnlineSession availability="ONLINE", GPS fresh (≤ gpsStaleAfterSec),
 *      coordinates present (also re-checked in JS — defense in depth).
 *   2. Driver ACTIVE. Pushless drivers are NOT excluded — they still poll
 *      GET /api/agent/state; the push is only a wake-up nudge.
 *   3. Vehicle constraint: order.requiresCarOnly ⇒ Driver.vehicleType === "CAR".
 *   4. No ASSIGNED/PICKED_UP DeliveryOrder (single order per trip).
 *   5. No open OFFERED DispatchOffer anywhere (serialized offers).
 *   6. Not previously offered THIS order (any round, any status).
 *   7. Cash ceiling: balance (+ order total when COD) must not exceed the
 *      tenant ceiling (isDriverOverCeiling).
 *   8. Haversine distance from the pickup branch ≤ searchRadiusKm.
 *
 * Sort: distance asc; tiebreak longest-idle (most time since the driver's
 * last DELIVERED order; drivers with none rank first among ties).
 */
export async function selectCandidates(
  tenantId: string,
  orderId: string,
  opts?: { limit?: number },
): Promise<Candidate[]> {
  const order = await prisma.deliveryOrder.findFirst({
    where: { id: orderId, tenantId },
    include: { branch: true },
  });
  if (!order) return [];

  const pickupLat = toNum((order as { branch?: { lat?: unknown } }).branch?.lat);
  const pickupLng = toNum((order as { branch?: { lng?: unknown } }).branch?.lng);
  if (pickupLat == null || pickupLng == null) {
    logger.warn({ orderId, tenantId }, "selectCandidates: pickup branch has no coordinates");
    return [];
  }

  const settings = await getDispatchSettings(tenantId);
  const staleCutoff = new Date(Date.now() - settings.gpsStaleAfterSec * 1000);

  const sessions = (await prisma.courierOnlineSession.findMany({
    where: {
      tenantId,
      availability: "ONLINE",
      lastGpsAt: { gt: staleCutoff },
      lastGpsLat: { not: null },
      lastGpsLng: { not: null },
    },
    include: {
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          vehicleType: true,
          expoPushToken: true,
        },
      },
    },
  })) as unknown as SessionWithDriver[];

  // JS-side re-check of freshness/coords (mocked stores and clock drift), then
  // driver status + vehicle constraint + radius.
  const prelim: Array<Candidate & { lastGpsAt: Date }> = [];
  for (const session of latestSessionPerDriver(sessions)) {
    const { driver } = session;
    if (!driver || driver.status !== "ACTIVE") continue;
    if (order.requiresCarOnly && driver.vehicleType !== "CAR") continue;
    const lat = toNum(session.lastGpsLat);
    const lng = toNum(session.lastGpsLng);
    if (lat == null || lng == null) continue;
    if (!session.lastGpsAt || session.lastGpsAt.getTime() <= staleCutoff.getTime()) continue;

    const distanceKm = haversineMeters(pickupLat, pickupLng, lat, lng) / 1000;
    if (distanceKm > settings.searchRadiusKm) continue;

    prelim.push({
      driverId: driver.id,
      name: driver.name,
      phone: driver.phone ?? null,
      distanceKm,
      etaMin: Math.ceil((distanceKm / AVG_SPEED_KMH) * 60),
      activeOrders: 0,
      lastGpsAt: session.lastGpsAt,
    });
  }
  if (prelim.length === 0) return [];

  const driverIds = prelim.map((c) => c.driverId);

  // Busy drivers + open/prior offers, one query each.
  const [busyOrders, offerRows] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where: {
        tenantId,
        driverId: { in: driverIds },
        status: { in: ["ASSIGNED", "PICKED_UP"] },
      },
      select: { driverId: true },
    }),
    prisma.dispatchOffer.findMany({
      where: {
        tenantId,
        driverId: { in: driverIds },
        OR: [{ status: "OFFERED" }, { orderId }],
      },
      select: { driverId: true, orderId: true, status: true },
    }),
  ]);

  const activeCountByDriver = new Map<string, number>();
  for (const row of busyOrders) {
    if (!row.driverId) continue;
    activeCountByDriver.set(row.driverId, (activeCountByDriver.get(row.driverId) ?? 0) + 1);
  }
  const excludedByOffer = new Set<string>();
  for (const row of offerRows) {
    // Open offer anywhere (serialized) OR any prior offer for THIS order.
    if (row.status === "OFFERED" || row.orderId === orderId) {
      excludedByOffer.add(row.driverId);
    }
  }

  let filtered = prelim.filter((c) => {
    c.activeOrders = activeCountByDriver.get(c.driverId) ?? 0;
    if (c.activeOrders > 0) return false;
    if (excludedByOffer.has(c.driverId)) return false;
    return true;
  });
  if (filtered.length === 0) return [];

  // Cash ceiling (projected +orderTotal for COD orders).
  const additionalKwd =
    order.paymentMethod === "COD"
      ? new Prisma.Decimal(order.orderTotalKwd as unknown as Prisma.Decimal.Value)
      : undefined;
  const overCeiling = await Promise.all(
    filtered.map((c) => isDriverOverCeiling(tenantId, c.driverId, additionalKwd)),
  );
  filtered = filtered.filter((_, i) => !overCeiling[i]);
  if (filtered.length === 0) return [];

  // Idle tiebreak: minutes since last DELIVERED order (none = rank first).
  const idleRows = (await prisma.deliveryOrder.groupBy({
    by: ["driverId"],
    where: {
      tenantId,
      driverId: { in: filtered.map((c) => c.driverId) },
      status: "DELIVERED",
    },
    _max: { deliveredAt: true },
    orderBy: { driverId: "asc" },
  })) as unknown as Array<{ driverId: string | null; _max: { deliveredAt: Date | null } }>;
  const lastDeliveredByDriver = new Map<string, number>();
  for (const row of idleRows) {
    if (row.driverId && row._max.deliveredAt) {
      lastDeliveredByDriver.set(row.driverId, row._max.deliveredAt.getTime());
    }
  }

  filtered.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    const aLast = lastDeliveredByDriver.get(a.driverId) ?? -Infinity;
    const bLast = lastDeliveredByDriver.get(b.driverId) ?? -Infinity;
    return aLast - bLast; // older last-delivery (longer idle) first
  });

  const limit = opts?.limit;
  const ranked = filtered.map(({ lastGpsAt: _drop, ...candidate }) => candidate);
  return typeof limit === "number" && limit > 0 ? ranked.slice(0, limit) : ranked;
}

// ─── Offer push (raw exp.host, channelId "darb-offers") ────────────────────

type OrderWithRelations = DeliveryOrder & {
  branch?: { name?: string | null } | null;
  dropoffZone?: { code?: string | null; name?: string | null } | null;
};

async function sendOfferPush(
  order: OrderWithRelations,
  offer: { id: string; expiresAt: Date },
  driverId: string,
): Promise<void> {
  const driver = await prisma.driver.findFirst({
    where: { id: driverId, tenantId: order.tenantId },
    select: { expoPushToken: true },
  });
  if (!driver?.expoPushToken) return; // pushless drivers poll GET /state

  const pickupName = order.branch?.name ?? null;
  const dropoffZone = order.dropoffZone?.code ?? order.dropoffZone?.name ?? null;
  const feeKwd = kwdNum(order.deliveryFeeKwd);
  const codAmountKwd = order.paymentMethod === "COD" ? kwdNum(order.orderTotalKwd) : 0;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        to: driver.expoPushToken,
        title: "New delivery offer",
        body: `${pickupName ?? "Pickup"} → ${dropoffZone ?? "drop-off"} · KD ${feeKwd.toFixed(3)}`,
        sound: "default",
        channelId: "darb-offers",
        priority: "high",
        data: {
          type: "dispatch_offer",
          offerId: offer.id,
          orderId: order.id,
          pickupName,
          dropoffZone,
          feeKwd,
          codAmountKwd,
          expiresAt: offer.expiresAt.toISOString(),
        },
      },
    ]),
  });
  if (!response.ok) {
    logger.warn(
      { offerId: offer.id, status: response.status },
      "dispatch offer push failed",
    );
  }
}

// ─── Exhaustion (NO_DRIVER + supervisor Notification) ──────────────────────

async function notifySupervisorsDispatchExhausted(order: DeliveryOrder): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: {
        tenantId: order.tenantId,
        role: { in: [...SUPERVISOR_ROLES] },
        isActive: true,
      },
      select: { id: true },
    });
    if (users.length === 0) return;
    await prisma.notification.createMany({
      data: users.map((user) => ({
        tenantId: order.tenantId,
        userId: user.id,
        title: "Dispatch exhausted — no driver",
        message: `Order ${order.orderNumber} found no driver after ${order.offerRound} offer round(s). Assign manually or redispatch.`,
        type: "DISPATCH_EXHAUSTED",
        severity: "HIGH",
        sourceId: order.id,
        category: "OPS_TODO",
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          vendorId: order.vendorId,
          offerRound: order.offerRound,
        } as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "dispatch-exhausted supervisor notification failed");
  }
}

async function exhaustDispatch(order: DeliveryOrder, reason: string): Promise<void> {
  try {
    const { tx } = await prisma.$transaction(async (trx) => {
      await transitionOrder(trx, {
        orderId: order.id,
        tenantId: order.tenantId,
        from: "DISPATCHING",
        to: "NO_DRIVER",
        actor: SYSTEM_ACTOR,
        eventMeta: {
          orderNumber: order.orderNumber,
          vendorId: order.vendorId,
          reason,
          offerRound: order.offerRound,
        },
      });
      return { tx: trx };
    });
    flushOrderEvents(tx); // publishes SSE order.dispatch_exhausted
  } catch (err) {
    if (err instanceof OrderStateConflictError) return; // cancelled/assigned concurrently
    throw err;
  }
  await notifySupervisorsDispatchExhausted(order);
}

// ─── Dispatch rounds ────────────────────────────────────────────────────────

async function runDispatchRound(tenantId: string, orderId: string): Promise<void> {
  const order = (await prisma.deliveryOrder.findFirst({
    where: { id: orderId, tenantId },
    include: { branch: true, dropoffZone: true },
  })) as OrderWithRelations | null;
  // Guard: only DISPATCHING orders take offers — skip silently otherwise
  // (cancelled / manually assigned while the job sat in the queue).
  if (!order || order.status !== "DISPATCHING") return;

  const settings = await getDispatchSettings(tenantId);
  const round = order.offerRound;

  if (round >= settings.maxOfferRounds) {
    await exhaustDispatch(order, "MAX_ROUNDS");
    return;
  }

  const candidates = await selectCandidates(tenantId, orderId);
  if (candidates.length === 0) {
    await exhaustDispatch(order, "NO_CANDIDATES");
    return;
  }

  const candidate = candidates[0];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + settings.offerWindowSec * 1000);

  let offer: { id: string; expiresAt: Date };
  try {
    offer = await prisma.$transaction(async (trx) => {
      const created = await trx.dispatchOffer.create({
        data: {
          tenantId,
          orderId,
          driverId: candidate.driverId,
          round,
          distanceKm: candidate.distanceKm,
          status: "OFFERED",
          offeredAt: now,
          expiresAt,
        },
      });
      // Guarded bump — count 0 means the order left DISPATCHING under us;
      // throwing rolls the offer row back.
      const bumped = await trx.deliveryOrder.updateMany({
        where: { id: orderId, tenantId, status: "DISPATCHING" },
        data: { offerRound: { increment: 1 } },
      });
      if (bumped.count === 0) {
        throw new OrderStateConflictError(orderId, "DISPATCHING", "DISPATCHING");
      }
      return created;
    });
  } catch (err) {
    if (err instanceof OrderStateConflictError) return; // order gone — drop round
    if (isP2002(err)) {
      // Same (orderId, driverId, round) already offered — duplicate job replay.
      logger.warn({ orderId, driverId: candidate.driverId, round }, "duplicate dispatch round skipped");
      return;
    }
    throw err;
  }

  void sendOfferPush(order, offer, candidate.driverId).catch((err) =>
    logger.warn({ err, offerId: offer.id }, "offer push failed"),
  );

  publishOrderEvent(tenantId, "offer.sent", {
    orderId,
    orderNumber: order.orderNumber,
    vendorId: order.vendorId,
    offerId: offer.id,
    driverId: candidate.driverId,
    round,
    distanceKm: candidate.distanceKm,
    expiresAt: expiresAt.toISOString(),
  });

  await scheduleOfferExpiry(offer.id, settings.offerWindowSec * 1000);
}

/** dispatch-start job body: first offer round for a fresh DISPATCHING order. */
export async function startDispatch(tenantId: string, orderId: string): Promise<void> {
  await runDispatchRound(tenantId, orderId);
}

/** dispatch-next job body: advance a round after a decline/expiry. */
export async function dispatchNext(tenantId: string, orderId: string): Promise<void> {
  await runDispatchRound(tenantId, orderId);
}

// ─── Offer expiry (offer-expiry job body) ──────────────────────────────────

export async function expireOffer(offerId: string): Promise<void> {
  // offerId is a global uuid; the row carries the tenant for the guarded update.
  // eslint-disable-next-line no-prisma-without-tenant -- queue-internal entry point: offerId comes from our own delayed job (never a client), and every subsequent write re-filters on the row's own tenantId.
  const offer = await prisma.dispatchOffer.findUnique({ where: { id: offerId } });
  if (!offer) return;

  const won = await prisma.dispatchOffer.updateMany({
    where: { id: offerId, tenantId: offer.tenantId, status: "OFFERED" },
    data: { status: "EXPIRED", respondedAt: new Date() },
  });
  if (won.count === 0) return; // accepted/declined/cancelled first — lost the race

  publishOrderEvent(offer.tenantId, "offer.expired", {
    orderId: offer.orderId,
    offerId,
    driverId: offer.driverId,
    round: offer.round,
  });
  await enqueueDispatchNext(offer.orderId, offer.tenantId);
}

// ─── Accept / decline ───────────────────────────────────────────────────────

/**
 * Driver accepts an offer. Single winner via the guarded updateMany
 * (OFFERED + unexpired + this driver) — count 0 ⇒ OfferGoneError (410).
 * Then DISPATCHING→ASSIGNED (sets driverId/assignedAt) in the SAME
 * transaction; an OrderStateConflictError there (order cancelled or assigned
 * elsewhere) also surfaces as OfferGoneError after rollback.
 */
export async function acceptOffer(args: {
  tenantId: string;
  offerId: string;
  driverId: string;
}): Promise<{ order: DeliveryOrder }> {
  const { tenantId, offerId, driverId } = args;
  const now = new Date();

  let committed: { tx: object; order: DeliveryOrder };
  try {
    committed = await prisma.$transaction(async (trx) => {
      const won = await trx.dispatchOffer.updateMany({
        where: { id: offerId, tenantId, driverId, status: "OFFERED", expiresAt: { gt: now } },
        data: { status: "ACCEPTED", respondedAt: now },
      });
      if (won.count === 0) throw new OfferGoneError(offerId);

      const offer = await trx.dispatchOffer.findFirst({ where: { id: offerId, tenantId } });
      if (!offer) throw new OfferGoneError(offerId);
      const order = await trx.deliveryOrder.findFirst({
        where: { id: offer.orderId, tenantId },
      });
      if (!order) throw new OfferGoneError(offerId);

      await transitionOrder(trx, {
        orderId: order.id,
        tenantId,
        from: "DISPATCHING",
        to: "ASSIGNED",
        actor: { type: "DRIVER", id: driverId },
        data: { driverId, assignedAt: now },
        eventMeta: {
          orderNumber: order.orderNumber,
          vendorId: order.vendorId,
          driverId,
          offerId,
          round: offer.round,
          ...(order.deliveryFeeKwd != null
            ? { feeKwd: Number(order.deliveryFeeKwd).toFixed(3) }
            : {}),
        },
      });

      // Contract #2: carrying an order ⇒ session availability BUSY (same tx
      // as the ASSIGNED transition so the flag can't disagree with the order).
      await markDriverBusy(trx, tenantId, driverId);

      const fresh = await trx.deliveryOrder.findFirst({ where: { id: order.id, tenantId } });
      return {
        tx: trx,
        order: fresh ?? ({ ...order, status: "ASSIGNED", driverId, assignedAt: now } as DeliveryOrder),
      };
    });
  } catch (err) {
    if (err instanceof OrderStateConflictError) throw new OfferGoneError(offerId);
    throw err;
  }

  flushOrderEvents(committed.tx); // publishes SSE order.assigned
  void removeOfferExpiryJob(offerId).catch(() => {});
  publishOrderEvent(tenantId, "offer.accepted", {
    orderId: committed.order.id,
    orderNumber: committed.order.orderNumber,
    vendorId: committed.order.vendorId,
    offerId,
    driverId,
  });
  void enqueueFoodicsWriteback(committed.order.id, "ASSIGNED").catch((err) =>
    logger.warn({ err, orderId: committed.order.id }, "foodics writeback enqueue failed"),
  );

  return { order: committed.order };
}

/**
 * Driver declines an offer. Guarded OFFERED→DECLINED; a late/duplicate
 * decline (already expired/accepted/declined) is an idempotent no-op — the
 * route still answers 200.
 */
export async function declineOffer(args: {
  tenantId: string;
  offerId: string;
  driverId: string;
  reason?: string;
}): Promise<void> {
  const { tenantId, offerId, driverId, reason } = args;

  const updated = await prisma.dispatchOffer.updateMany({
    where: { id: offerId, tenantId, driverId, status: "OFFERED" },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  if (updated.count === 0) return; // late / duplicate / not this driver's offer

  const offer = await prisma.dispatchOffer.findFirst({ where: { id: offerId, tenantId } });
  if (!offer) return;

  void removeOfferExpiryJob(offerId).catch(() => {});
  publishOrderEvent(tenantId, "offer.declined", {
    orderId: offer.orderId,
    offerId,
    driverId,
    round: offer.round,
    ...(reason ? { reason } : {}),
  });
  await enqueueDispatchNext(offer.orderId, tenantId);
}
