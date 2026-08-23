/**
 * Darb 2.0 dispatch engine (plan §A3).
 *
 * Single-order, serialized offers: each round picks ONE candidate (nearest,
 * tiebreak longest-idle), writes a DispatchOffer with a 15s window, pushes an
 * Expo data-message nudge, and schedules the offer-expiry timer. Decline /
 * expiry advance to the next round (dispatch-next); acceptance runs the
 * status-guarded DISPATCHING→ASSIGNED transition. Round exhaustion (or an
 * empty candidate pool) transitions to NO_DRIVER + supervisor Notification +
 * SSE order.dispatch_exhausted. Revision 4 (#1): that is a pause rather than a
 * terminus — the sweep returns the order to DISPATCHING on a backoff, and the
 * retry rounds search without a radius cap so the nearest driver anywhere gets
 * the offer. No human has to touch a NO_DRIVER order for it to be delivered.
 *
 * Concurrency model: every offer/order mutation is a status-guarded
 * updateMany — count===0 means the other side of the race (accept-vs-expire,
 * accept-vs-cancel, double decline) already won and the loser backs off
 * (OfferGoneError for accepts, silent no-op elsewhere). Plan §A1: offers are
 * DispatchOffer rows, never DeviceCommand — pushes here go straight to
 * exp.host with channelId "darb-offers" (sendDispatchDriverPush is NOT used
 * because it queues MDM DeviceCommand rows and pins channelId "darb-inbox").
 */
import { randomUUID } from "crypto";
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
import { fireCustomerMilestone } from "../customerMessagingService";
import {
  estimatedOrderCostKwd,
  isFlatRateFleet,
  loadFleetRates,
} from "./fleetCostPolicy";

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
  /**
   * Revision 5 (#1). Minutes this driver is still expected to spend on the
   * delivery he is already carrying before he can start this one. 0 for a free
   * driver, which is every candidate the engine used to produce. A positive
   * value is the delay the customer's ETA has to absorb, and acceptOffer
   * pushes slaDeadline out by exactly this much.
   */
  finishingInMin: number;
  /**
   * Revision 15 (#4). What this order would cost Darb if this driver took it:
   * their company's base fee plus its kilometre rate over the order's own
   * distance. 0 for a driver with no delivery company behind them. Only read
   * when the branch is at or over its target price.
   */
  costKwd?: number;
}

/** Average courier speed used for the ETA estimate (plan §A3). */
const AVG_SPEED_KMH = 30;

/**
 * Revision 5 (#1). Minutes allowed for the drop itself once a driver reaches
 * the customer — park, hand over, collect cash, POD. Added to the projected
 * travel time so "about to finish" means about to be free, not about to
 * arrive.
 */
const HANDOVER_MIN = 3;

const SUPERVISOR_ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] as const;

export interface DispatchSettings {
  offerWindowSec: number;
  maxOfferRounds: number;
  searchRadiusKm: number;
  gpsStaleAfterSec: number;
  radiusWidenAfterRounds: number;
  radiusWidenFactor: number;
  maxSearchRadiusKm: number;
  batchingEnabled: boolean;
  batchMaxDropKm: number;
  batchMaxOrders: number;
  finishingSoonMinutes: number;
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
    radiusWidenAfterRounds: row?.radiusWidenAfterRounds ?? 3,
    radiusWidenFactor: row?.radiusWidenFactor ?? 1.5,
    maxSearchRadiusKm: row?.maxSearchRadiusKm ?? 15,
    batchingEnabled: row?.batchingEnabled ?? true,
    batchMaxDropKm: row?.batchMaxDropKm ?? 1.5,
    batchMaxOrders: row?.batchMaxOrders ?? 2,
    finishingSoonMinutes: row?.finishingSoonMinutes ?? 10,
  };
}

/**
 * PRD §8 auto-widen: effective search radius for an offer round. Widens by
 * radiusWidenFactor every radiusWidenAfterRounds rounds, capped at
 * maxSearchRadiusKm. Defaults: rounds 0-2 at 8 km, 3-5 at 12 km, 6+ at 15 km.
 */
export function effectiveRadiusKm(
  settings: Pick<
    DispatchSettings,
    "searchRadiusKm" | "radiusWidenAfterRounds" | "radiusWidenFactor" | "maxSearchRadiusKm"
  >,
  round: number,
  opts?: { uncapped?: boolean },
): number {
  // Revision 4 (#1): once an order has already exhausted a full set of capped
  // rounds, the cap is the thing keeping it undelivered. Retry rounds search
  // without one, so the nearest online driver anywhere wins the offer rather
  // than the order sitting at NO_DRIVER because everyone is 16 km away.
  if (opts?.uncapped) return Number.POSITIVE_INFINITY;
  const widenings =
    settings.radiusWidenAfterRounds > 0
      ? Math.floor(Math.max(0, round) / settings.radiusWidenAfterRounds)
      : 0;
  return Math.min(
    settings.searchRadiusKm * Math.pow(settings.radiusWidenFactor, widenings),
    settings.maxSearchRadiusKm,
  );
}

// ─── Revision 4 (#1): redispatch backoff ────────────────────────────────────

/**
 * Delay before a NO_DRIVER order is offered again, by how many times it has
 * already been round-exhausted. Short at first because the usual cause is a
 * momentary gap in coverage, then settling at ten minutes forever — an order
 * is never abandoned, it just stops asking so often.
 */
const REDISPATCH_BACKOFF_SEC = [60, 120, 300, 600] as const;

export function redispatchDelaySec(attempts: number): number {
  const i = Math.min(Math.max(0, attempts - 1), REDISPATCH_BACKOFF_SEC.length - 1);
  return REDISPATCH_BACKOFF_SEC[i];
}

/**
 * Offer round a retry restarts from. Non-zero so the radius is already at its
 * widest on the first retry offer; the uncapped flag then removes the ceiling
 * entirely, and this only decides how the round counts against maxOfferRounds.
 */
const RETRY_ROUND_BASE = 0;

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
    throttledUntil: Date | null;
    /** Revision 15 (#3/#4): which company Darb pays for this driver's work. */
    fleetPartnerId: string | null;
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
 *
 * Revision 5 (#1) — every order must be served. Filter 4 used to end the story
 * for a busy driver, which is how an order reaches NO_DRIVER while six couriers
 * are two minutes from finishing their drop. Busy drivers now form a RESERVE
 * tier instead of disappearing:
 *
 *   - one active order, already PICKED_UP (he is on the last leg — a driver who
 *     has not collected yet is not "about to finish"),
 *   - projected minutes to finish it ≤ FulfillmentSettings.finishingSoonMinutes,
 *   - measured from where he will actually be when free (his current drop-off),
 *     not from where he is now, because that is the distance that decides who
 *     is really nearest to the new pickup.
 *
 * The reserve tier ranks strictly below every free driver, so nobody waits on a
 * busy courier while an idle one is in range. Within the tier the soonest to
 * finish wins and distance breaks ties. `finishingInMin` rides on the candidate
 * so acceptOffer can push the customer's ETA out by the wait.
 *
 * Revision 15 (#3) — what the driver's delivery company costs Darb enters the
 * filter, and it does nothing until a tenant configures a rate (see
 * services/dispatch/fleetCostPolicy.ts):
 *
 *   - Filter 9: a company on a base fee with no kilometre rate cannot be paid
 *     for distance, so it is excluded from any order whose pickup and dropoff
 *     zones differ.
 *
 * Revision 17 (Edit #4) removed the target-price sort that used to sit beside
 * it: the column is gone, and the client's two pricing models say cost must
 * never steer who delivers.
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
          throttledUntil: true,
          fleetPartnerId: true,
        },
      },
    },
  })) as unknown as SessionWithDriver[];

  // JS-side re-check of freshness/coords (mocked stores and clock drift), then
  // driver status + vehicle constraint. The radius is applied further down,
  // once it is known whether a driver is free (measured from where he is) or
  // finishing a drop (measured from where he will be).
  type Prelim = Candidate & {
    lastGpsAt: Date;
    throttled: boolean;
    lat: number;
    lng: number;
    fleetPartnerId: string | null;
  };
  let prelim: Prelim[] = [];
  for (const session of latestSessionPerDriver(sessions)) {
    const { driver } = session;
    if (!driver || driver.status !== "ACTIVE") continue;
    if (order.requiresCarOnly && driver.vehicleType !== "CAR") continue;
    const lat = toNum(session.lastGpsLat);
    const lng = toNum(session.lastGpsLng);
    if (lat == null || lng == null) continue;
    if (!session.lastGpsAt || session.lastGpsAt.getTime() <= staleCutoff.getTime()) continue;

    const distanceKm = haversineMeters(pickupLat, pickupLng, lat, lng) / 1000;
    prelim.push({
      driverId: driver.id,
      name: driver.name,
      phone: driver.phone ?? null,
      distanceKm,
      etaMin: Math.ceil((distanceKm / AVG_SPEED_KMH) * 60),
      activeOrders: 0,
      finishingInMin: 0,
      lastGpsAt: session.lastGpsAt,
      lat,
      lng,
      fleetPartnerId: driver.fleetPartnerId ?? null,
      throttled:
        driver.throttledUntil != null && driver.throttledUntil.getTime() > Date.now(),
    });
  }
  if (prelim.length === 0) return [];

  // ── Revision 15 (#3/#4): what each candidate's company costs Darb ─────────
  //
  // Loaded once for the whole pool. Both client rules read the same rates, so
  // one query answers "may this company take a cross-zone order" and "which of
  // these drivers is the cheapest".
  const fleetRates = await loadFleetRates(
    tenantId,
    prelim.map((c) => c.fleetPartnerId).filter((id): id is string => !!id),
  );

  // Revision 15 (#3). A company paid a base fee with no kilometre rate has no
  // mechanism to be paid for the extra distance, so it only takes orders that
  // start and finish in one zone. A hard exclusion on purpose: ranking it last
  // would still hand it the order the moment nobody else answered, which is
  // exactly the cross-zone delivery the rule exists to keep away from it. An
  // order with either zone unresolved is not treated as cross-zone — that is a
  // missing pin, not a long trip, and refusing every flat-rate company over a
  // blank column would quietly shrink the pool for a data problem.
  if (
    order.pickupZoneId &&
    order.dropoffZoneId &&
    order.pickupZoneId !== order.dropoffZoneId
  ) {
    const before = prelim.length;
    const sameZoneOnly = prelim.filter((c) => {
      if (!c.fleetPartnerId) return true; // no company behind them, no rate to break
      const rate = fleetRates.get(c.fleetPartnerId);
      return !rate || !isFlatRateFleet(rate);
    });
    if (sameZoneOnly.length !== before) {
      logger.info(
        { orderId, excluded: before - sameZoneOnly.length },
        "flat-rate fleets excluded from a cross-zone order",
      );
    }
    prelim = sameZoneOnly;
    if (prelim.length === 0) return [];
  }

  const orderDistanceKm = (order as { distanceKm?: Prisma.Decimal | null }).distanceKm ?? null;
  for (const c of prelim) {
    const rate = c.fleetPartnerId ? (fleetRates.get(c.fleetPartnerId) ?? null) : null;
    c.costKwd = estimatedOrderCostKwd(rate, orderDistanceKm);
  }

  const driverIds = prelim.map((c) => c.driverId);

  // Busy drivers + open/prior offers, one query each. The busy query carries
  // the drop coordinates now: for a driver on his last leg they are both how
  // long he still needs and where he will be standing when he is free.
  const [busyOrders, offerRows] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where: {
        tenantId,
        driverId: { in: driverIds },
        status: { in: ["ASSIGNED", "PICKED_UP"] },
      },
      select: { driverId: true, status: true, dropoffLat: true, dropoffLng: true },
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

  type BusyLeg = { status: string; dropoffLat: number | null; dropoffLng: number | null };
  const activeCountByDriver = new Map<string, number>();
  const legByDriver = new Map<string, BusyLeg>();
  for (const row of busyOrders) {
    if (!row.driverId) continue;
    activeCountByDriver.set(row.driverId, (activeCountByDriver.get(row.driverId) ?? 0) + 1);
    legByDriver.set(row.driverId, {
      status: row.status,
      dropoffLat: toNum(row.dropoffLat),
      dropoffLng: toNum(row.dropoffLng),
    });
  }
  const excludedByOffer = new Set<string>();
  for (const row of offerRows) {
    // Open offer anywhere (serialized) OR any prior offer for THIS order.
    if (row.status === "OFFERED" || row.orderId === orderId) {
      excludedByOffer.add(row.driverId);
    }
  }

  // PRD §8 auto-widen: the radius grows with the order's offer round.
  // Revision 4 (#1): an order that has already been through a full set of
  // rounds searches without a ceiling, so distance only ranks candidates.
  const uncapped = ((order as { redispatchAttempts?: number }).redispatchAttempts ?? 0) > 0;
  const radiusKm = effectiveRadiusKm(settings, order.offerRound, { uncapped });

  let filtered = prelim.filter((c) => {
    if (excludedByOffer.has(c.driverId)) return false;
    c.activeOrders = activeCountByDriver.get(c.driverId) ?? 0;

    if (c.activeOrders === 0) return c.distanceKm <= radiusKm;

    // ── Revision 5 (#1): the reserve tier ──────────────────────────────────
    if (settings.finishingSoonMinutes <= 0) return false;
    // Two live orders is a batch mid-flight, not a driver about to be free.
    if (c.activeOrders > 1) return false;
    const leg = legByDriver.get(c.driverId);
    // Still to collect from the merchant: the whole delivery is ahead of him.
    if (!leg || leg.status !== "PICKED_UP") return false;
    if (leg.dropoffLat == null || leg.dropoffLng == null) return false;

    const toDropKm = haversineMeters(c.lat, c.lng, leg.dropoffLat, leg.dropoffLng) / 1000;
    const finishingInMin = Math.ceil((toDropKm / AVG_SPEED_KMH) * 60) + HANDOVER_MIN;
    if (finishingInMin > settings.finishingSoonMinutes) return false;

    // From his drop-off onward: that is where the next trip actually starts.
    const fromDropKm =
      haversineMeters(pickupLat, pickupLng, leg.dropoffLat, leg.dropoffLng) / 1000;
    if (fromDropKm > radiusKm) return false;

    c.finishingInMin = finishingInMin;
    c.distanceKm = fromDropKm;
    c.etaMin = finishingInMin + Math.ceil((fromDropKm / AVG_SPEED_KMH) * 60);
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
    // PRD §9 discipline: throttled drivers rank after every non-throttled
    // candidate regardless of distance.
    if (a.throttled !== b.throttled) return a.throttled ? 1 : -1;
    // Revision 5 (#1): a driver who is free beats one who is merely close to
    // being free, however near he is. The reserve tier is the answer to "there
    // is nobody", not a way to load a courier who is still working.
    const aBusy = a.finishingInMin > 0;
    const bBusy = b.finishingInMin > 0;
    if (aBusy !== bBusy) return aBusy ? 1 : -1;
    if (aBusy) {
      // Soonest free wins; distance to the new pickup breaks the tie.
      if (a.finishingInMin !== b.finishingInMin) return a.finishingInMin - b.finishingInMin;
      return a.distanceKm - b.distanceKm;
    }
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    const aLast = lastDeliveredByDriver.get(a.driverId) ?? -Infinity;
    const bLast = lastDeliveredByDriver.get(b.driverId) ?? -Infinity;
    return aLast - bLast; // older last-delivery (longer idle) first
  });

  const limit = opts?.limit;
  const ranked = filtered.map(
    ({
      lastGpsAt: _drop,
      throttled: _t,
      lat: _lat,
      lng: _lng,
      fleetPartnerId: _fleet,
      ...candidate
    }) => candidate,
  );
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

/**
 * Couriers on shift right now with usable GPS — the same freshness rule
 * selectCandidates applies, so this answers "was there anybody to ask?"
 * rather than "does the roster have names in it". A roster of 115 drivers who
 * are all clocked off is zero here, which is the number ops needs to see.
 */
async function countOnlineCouriers(tenantId: string): Promise<number> {
  const settings = await getDispatchSettings(tenantId);
  const staleCutoff = new Date(Date.now() - settings.gpsStaleAfterSec * 1000);
  return prisma.courierOnlineSession.count({
    where: {
      tenantId,
      availability: "ONLINE",
      lastGpsAt: { gt: staleCutoff },
      lastGpsLat: { not: null },
      lastGpsLng: { not: null },
    },
  });
}

async function notifySupervisorsDispatchExhausted(
  order: DeliveryOrder,
  reason: string,
): Promise<void> {
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

    // Name the actual blocker. "No driver after 3 rounds" sent ops hunting a
    // dispatch fault when the roster was simply clocked off.
    const noneOnline = reason === "NO_COURIERS_ONLINE";
    const title = noneOnline ? "No couriers online" : "Dispatch exhausted — no driver";
    const message = noneOnline
      ? `Order ${order.orderNumber} has nobody to offer to: no courier is on shift with live GPS. Get a courier online, or assign this order manually.`
      : `Order ${order.orderNumber} found no driver after ${order.offerRound} offer round(s). Assign manually or redispatch.`;

    await prisma.notification.createMany({
      data: users.map((user) => ({
        tenantId: order.tenantId,
        userId: user.id,
        title,
        message,
        titleAr: noneOnline ? "لا يوجد مندوبون متصلون" : "تعذر إيجاد مندوب",
        bodyAr: noneOnline
          ? `الطلب ${order.orderNumber} لا يوجد من يُعرض عليه: لا يوجد مندوب على الدوام بموقع محدّث. أدخل مندوبا للخدمة أو عيّن الطلب يدويا.`
          : `الطلب ${order.orderNumber} لم يجد مندوبا بعد ${order.offerRound} جولة عرض. عيّنه يدويا أو أعد الإرسال.`,
        type: noneOnline ? "NO_COURIERS_ONLINE" : "DISPATCH_EXHAUSTED",
        severity: "HIGH",
        sourceId: order.id,
        category: "OPS_TODO",
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          vendorId: order.vendorId,
          offerRound: order.offerRound,
          reason,
        } as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "dispatch-exhausted supervisor notification failed");
  }
}

async function exhaustDispatch(order: DeliveryOrder, reason: string): Promise<void> {
  // Revision 4 (#1): NO_DRIVER is a pause, not a terminus. Stamp the retry
  // clock in the same transaction as the transition so the sweep can never see
  // an exhausted order without a due time and leave it parked forever.
  const attempts = ((order as { redispatchAttempts?: number }).redispatchAttempts ?? 0) + 1;
  const nextRedispatchAt = new Date(Date.now() + redispatchDelaySec(attempts) * 1000);

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
          redispatchAttempts: attempts,
          nextRedispatchAt: nextRedispatchAt.toISOString(),
        },
      });
      await trx.deliveryOrder.updateMany({
        where: { id: order.id, tenantId: order.tenantId, status: "NO_DRIVER" },
        data: { redispatchAttempts: attempts, nextRedispatchAt },
      });
      return { tx: trx };
    });
    flushOrderEvents(tx); // publishes SSE order.dispatch_exhausted
  } catch (err) {
    if (err instanceof OrderStateConflictError) return; // cancelled/assigned concurrently
    throw err;
  }
  // Only the first exhaustion is worth waking a supervisor for. After that the
  // retries are doing the work and a notification per attempt is just noise.
  if (attempts === 1) await notifySupervisorsDispatchExhausted(order, reason);
}

/**
 * Revision 4 (#1): return one round-exhausted order to DISPATCHING.
 *
 * Status-guarded like every other transition here, so an order cancelled or
 * manually assigned since the selector ran simply loses the race and is left
 * alone. Clearing nextRedispatchAt before the transition means a failure
 * partway through re-arms on the next tick rather than spinning.
 */
async function retryExhaustedOrder(order: { id: string; tenantId: string }): Promise<boolean> {
  const claimed = await prisma.deliveryOrder.updateMany({
    where: {
      id: order.id,
      tenantId: order.tenantId,
      status: "NO_DRIVER",
      nextRedispatchAt: { not: null },
    },
    data: { nextRedispatchAt: null, offerRound: RETRY_ROUND_BASE },
  });
  if (claimed.count === 0) return false; // another sweep or a human got there first

  try {
    const { tx } = await prisma.$transaction(async (trx) => {
      await transitionOrder(trx, {
        orderId: order.id,
        tenantId: order.tenantId,
        from: "NO_DRIVER",
        to: "DISPATCHING",
        actor: SYSTEM_ACTOR,
        eventMeta: { reason: "AUTO_REDISPATCH" },
      });
      return { tx: trx };
    });
    flushOrderEvents(tx);
  } catch (err) {
    if (err instanceof OrderStateConflictError) return false;
    throw err;
  }

  await dispatchNext(order.tenantId, order.id);
  return true;
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
    // Empty pool has two very different causes and one used to be invisible:
    // nobody is on shift at all, or people are on shift but every one of them
    // was filtered out (out of range, busy, cash ceiling, already offered).
    // The first is a rota problem and the second is a dispatch one, so the
    // timeline and the supervisor notice should not call them the same thing.
    const onlineNow = await countOnlineCouriers(tenantId);
    await exhaustDispatch(order, onlineNow === 0 ? "NO_COURIERS_ONLINE" : "NO_CANDIDATES");
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
      // Guarded bump — count 0 means the order left DISPATCHING under us OR
      // another round already advanced offerRound past the value we read at
      // line 444; throwing rolls the offer row back. The `offerRound: round`
      // compare-and-set is what serializes two concurrent rounds: without it
      // both readers pass the status guard, both increment, and the order ends
      // up with two live OFFERED offers whenever they pick different drivers
      // (the @@unique([orderId, driverId, round]) only catches same-driver).
      // That race is reachable now that the cron sweep can drive dispatchNext
      // concurrently with a BullMQ worker on another host.
      const bumped = await trx.deliveryOrder.updateMany({
        where: { id: orderId, tenantId, status: "DISPATCHING", offerRound: round },
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

  // PRD §8 auto-batching: try to attach ONE sibling (one pickup, multiple
  // drops) in its own tx — any race degrades to the single-order offer that
  // already committed above.
  let batch: { siblingOfferId: string; batchId: string } | null = null;
  if (settings.batchingEnabled) {
    try {
      const sibling = await findBatchSibling(tenantId, order, settings, now);
      if (sibling) {
        const combinedCod =
          order.paymentMethod === "COD" || sibling.paymentMethod === "COD"
            ? new Prisma.Decimal(
                order.paymentMethod === "COD" ? (order.orderTotalKwd as unknown as Prisma.Decimal.Value) : 0,
              ).plus(
                sibling.paymentMethod === "COD"
                  ? new Prisma.Decimal(sibling.orderTotalKwd as unknown as Prisma.Decimal.Value)
                  : 0,
              )
            : null;
        batch = await attachBatchSibling({
          tenantId,
          primaryOffer: offer,
          driverId: candidate.driverId,
          sibling,
          paymentGuardKwd: combinedCod,
        });
      }
    } catch (err) {
      logger.warn({ err, orderId }, "batching attempt failed — offer continues single");
    }
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
    ...(batch ? { batchId: batch.batchId, batchSize: 2 } : {}),
  });

  await scheduleOfferExpiry(offer.id, settings.offerWindowSec * 1000);
  if (batch) {
    await scheduleOfferExpiry(batch.siblingOfferId, settings.offerWindowSec * 1000);
  }
}

// ─── Auto-batching (PRD §8: one pickup, multiple drops only) ────────────────

/**
 * Find ONE batchable sibling for a primary order: another DISPATCHING order
 * from the SAME pickup branch whose drop is close to the primary's drop
 * (same dropoff zone, or within batchMaxDropKm by haversine), with no live
 * offer of its own. Vehicle constraint respected; combined COD cash checked
 * against the driver ceiling by the caller.
 */
export async function findBatchSibling(
  tenantId: string,
  order: {
    id: string;
    branchId: string;
    dropoffZoneId: string | null;
    dropoffLat: unknown;
    dropoffLng: unknown;
    requiresCarOnly: boolean;
  },
  settings: DispatchSettings,
  now = new Date(),
): Promise<DeliveryOrder | null> {
  const candidates = await prisma.deliveryOrder.findMany({
    where: {
      tenantId,
      branchId: order.branchId,
      id: { not: order.id },
      status: "DISPATCHING",
      offers: { none: { status: "OFFERED", expiresAt: { gt: now } } },
    },
    orderBy: { createdAt: "asc" }, // oldest waiting customer first
    take: 10,
  });

  const pLat = toNum(order.dropoffLat);
  const pLng = toNum(order.dropoffLng);

  for (const sibling of candidates) {
    // The chosen driver already satisfies the PRIMARY's vehicle constraint;
    // a sibling that is stricter than the primary could mismatch.
    if (sibling.requiresCarOnly && !order.requiresCarOnly) continue;

    const sameZone =
      order.dropoffZoneId != null && sibling.dropoffZoneId === order.dropoffZoneId;
    let nearDrop = false;
    const sLat = toNum(sibling.dropoffLat);
    const sLng = toNum(sibling.dropoffLng);
    if (pLat != null && pLng != null && sLat != null && sLng != null) {
      nearDrop = haversineMeters(pLat, pLng, sLat, sLng) / 1000 <= settings.batchMaxDropKm;
    }
    if (sameZone || nearDrop) return sibling;
  }
  return null;
}

/**
 * Attach a batch sibling to a just-created primary offer, in its OWN
 * transaction so any race simply degrades to a single-order offer without
 * disturbing the primary:
 *
 *   - sibling DispatchOffer created for the same driver/window
 *   - sibling order's offerRound CAS-bumped (count 0 ⇒ raced ⇒ rollback)
 *   - primary offer stamped with the shared batchId (guard: still OFFERED)
 *
 * Returns the sibling offer id, or null when batching was not possible.
 */
async function attachBatchSibling(args: {
  tenantId: string;
  primaryOffer: { id: string; expiresAt: Date };
  driverId: string;
  sibling: DeliveryOrder;
  paymentGuardKwd: Prisma.Decimal | null;
}): Promise<{ siblingOfferId: string; batchId: string } | null> {
  const { tenantId, primaryOffer, driverId, sibling } = args;

  // Combined COD ceiling: the driver will carry BOTH orders' cash.
  if (args.paymentGuardKwd) {
    const over = await isDriverOverCeiling(tenantId, driverId, args.paymentGuardKwd);
    if (over) return null;
  }

  const batchId = randomUUID();
  try {
    const created = await prisma.$transaction(async (trx) => {
      const offer = await trx.dispatchOffer.create({
        data: {
          tenantId,
          orderId: sibling.id,
          driverId,
          round: sibling.offerRound,
          batchId,
          status: "OFFERED",
          offeredAt: new Date(),
          expiresAt: primaryOffer.expiresAt,
        },
      });
      const bumped = await trx.deliveryOrder.updateMany({
        where: { id: sibling.id, tenantId, status: "DISPATCHING", offerRound: sibling.offerRound },
        data: { offerRound: { increment: 1 } },
      });
      if (bumped.count === 0) {
        throw new OrderStateConflictError(sibling.id, "DISPATCHING", "DISPATCHING");
      }
      const stamped = await trx.dispatchOffer.updateMany({
        where: { id: primaryOffer.id, tenantId, status: "OFFERED" },
        data: { batchId },
      });
      if (stamped.count === 0) {
        // Primary already accepted/expired in the window — no batch.
        throw new OrderStateConflictError(sibling.id, "DISPATCHING", "DISPATCHING");
      }
      return offer;
    });
    return { siblingOfferId: created.id, batchId };
  } catch (err) {
    if (err instanceof OrderStateConflictError || isP2002(err)) return null;
    logger.warn({ err, siblingId: sibling.id }, "batch attach failed — continuing single");
    return null;
  }
}

/**
 * Close every OTHER still-OFFERED offer of a batch (decline/expiry of one
 * closes the whole batch) and return the affected sibling order ids so the
 * caller can advance them. Guarded updateMany — safe against races.
 */
async function closeBatchSiblings(
  tenantId: string,
  batchId: string,
  exceptOfferId: string,
  toStatus: "DECLINED" | "EXPIRED",
): Promise<string[]> {
  const siblings = await prisma.dispatchOffer.findMany({
    where: { tenantId, batchId, id: { not: exceptOfferId }, status: "OFFERED" },
    select: { id: true, orderId: true },
  });
  if (siblings.length === 0) return [];
  await prisma.dispatchOffer.updateMany({
    where: { tenantId, batchId, id: { not: exceptOfferId }, status: "OFFERED" },
    data: { status: toStatus, respondedAt: new Date() },
  });
  for (const s of siblings) {
    void removeOfferExpiryJob(s.id).catch(() => {});
  }
  return siblings.map((s) => s.orderId);
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

/**
 * Mark one OFFERED offer EXPIRED and (by default) enqueue the next round.
 *
 * Returns true when THIS call won the guarded update — i.e. it is the caller
 * that actually expired the offer. Losers of the accept-vs-expire race and
 * unknown ids return false.
 *
 * `advance: false` skips the enqueueDispatchNext call so a caller that is
 * already awaiting dispatchNext itself does not advance the order twice. The
 * cron sweep uses this; the BullMQ worker keeps the default.
 */
export async function expireOffer(
  offerId: string,
  opts: { advance?: boolean } = {},
): Promise<boolean> {
  const { advance = true } = opts;
  // offerId is a global uuid; the row carries the tenant for the guarded update.
  // eslint-disable-next-line no-prisma-without-tenant -- queue-internal entry point: offerId comes from our own delayed job (never a client), and every subsequent write re-filters on the row's own tenantId.
  const offer = await prisma.dispatchOffer.findUnique({ where: { id: offerId } });
  if (!offer) return false;

  const won = await prisma.dispatchOffer.updateMany({
    where: { id: offerId, tenantId: offer.tenantId, status: "OFFERED" },
    data: { status: "EXPIRED", respondedAt: new Date() },
  });
  if (won.count === 0) return false; // accepted/declined/cancelled first — lost the race

  publishOrderEvent(offer.tenantId, "offer.expired", {
    orderId: offer.orderId,
    offerId,
    driverId: offer.driverId,
    round: offer.round,
  });

  // PRD §8 batching: expiring one offer of a batch closes the whole batch —
  // a live sibling offer would otherwise block its order from the leg-2
  // advance selector forever.
  let siblingOrderIds: string[] = [];
  if (offer.batchId) {
    siblingOrderIds = await closeBatchSiblings(offer.tenantId, offer.batchId, offerId, "EXPIRED");
  }

  if (advance) {
    await enqueueDispatchNext(offer.orderId, offer.tenantId);
    for (const orderId of siblingOrderIds) {
      await enqueueDispatchNext(orderId, offer.tenantId);
    }
  }
  return true;
}

// ─── Cron sweep (serverless-safe dispatch driver) ───────────────────────────

/**
 * Default wall-clock budget for one sweep. Kept well under the lambda ceiling
 * (vercel.json sets maxDuration: 60) so the sweep always returns rather than
 * being killed — see the re-derivability note below for why being killed is
 * survivable anyway, and why we still prefer not to be.
 */
const SWEEP_BUDGET_MS = 40_000;

/**
 * Drive dispatch forward from durable state. Two legs:
 *
 *   1. EXPIRE  — every OFFERED offer whose expiresAt has elapsed → EXPIRED.
 *   2. ADVANCE — every DISPATCHING order with no live offer → dispatchNext.
 *
 * Why this exists: on Vercel the listen block never runs, so startDispatchWorker
 * never registers the in-process handlers, and there is no Redis. That means
 * BOTH legs of the normal flow are dead — not just offer expiry. enqueueDispatchStart
 * (order create, redispatch) and enqueueDispatchNext (decline, expiry) are all
 * dropped with "job dropped" warnings, so on the deploy an order reaches
 * DISPATCHING and never receives a first offer at all. Expiring offers alone
 * would fix nothing, because no offer is ever created to expire.
 *
 * Leg 2 is therefore the load-bearing one, and it is deliberately derived from
 * ORDERS rather than from the offers leg 1 happened to expire. That makes the
 * whole sweep RE-DERIVABLE: the work set is a pure function of committed state,
 * so a sweep that dies halfway (killed lambda, thrown dispatchNext, deploy
 * mid-run) loses nothing — the next tick recomputes the same set and picks up
 * exactly where it left off. Deriving the advance set from an in-memory list of
 * "offers I just expired" would instead strand those orders permanently, since
 * an EXPIRED offer is invisible to leg 1 forever after.
 *
 * The same selector also covers every other way an order gets wedged:
 * never-offered (round 1 dropped), last offer DECLINED, last offer EXPIRED by a
 * previous run, or stranded by an earlier crash. One query, all four cases.
 *
 * Safe alongside a real BullMQ worker on a long-lived host: expireOffer's
 * guarded updateMany means only one caller wins each offer, and runDispatchRound's
 * compare-and-set on offerRound means only one caller wins each round.
 */
export async function sweepDispatch(
  opts: { limit?: number; budgetMs?: number; now?: Date } = {},
): Promise<{
  expired: number;
  advanced: number;
  wedged: number;
  retried: number;
  truncated: boolean;
}> {
  const { limit = 100, budgetMs = SWEEP_BUDGET_MS, now = new Date() } = opts;
  const startedAt = Date.now();
  const outOfBudget = () => Date.now() - startedAt > budgetMs;

  // ── Leg 1: expire elapsed offers ──────────────────────────────────────────
  // Cross-tenant by design — this is a system sweep, not a request path.
  // eslint-disable-next-line no-prisma-without-tenant -- cron-internal: selects only rows whose own expiresAt has elapsed; expireOffer re-filters every write on the row's own tenantId.
  const due = await prisma.dispatchOffer.findMany({
    where: { status: "OFFERED", expiresAt: { lte: now } },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });

  let expired = 0;
  for (const offer of due) {
    if (outOfBudget()) break;
    try {
      // advance:false — leg 2 owns advancement. Letting expireOffer enqueue
      // here would double-advance whenever Redis IS present.
      if (await expireOffer(offer.id, { advance: false })) expired += 1;
    } catch (err) {
      logger.warn({ err, offerId: offer.id }, "sweepDispatch: expire failed");
    }
  }

  // ── Leg 2: advance orders with no live offer ──────────────────────────────
  // `none` rather than a join on leg 1's results: this is what makes the sweep
  // re-derivable and what catches orders that never got an offer at all.
  // eslint-disable-next-line no-prisma-without-tenant -- cron-internal: cross-tenant by design; dispatchNext re-filters on each row's own tenantId.
  const wedgedOrders = await prisma.deliveryOrder.findMany({
    where: {
      status: "DISPATCHING",
      offers: { none: { status: "OFFERED", expiresAt: { gt: now } } },
    },
    select: { id: true, tenantId: true },
    orderBy: { createdAt: "asc" }, // oldest customer waiting first
    take: limit,
  });

  let advanced = 0;
  let truncated = due.length === limit || wedgedOrders.length === limit;
  for (const order of wedgedOrders) {
    if (outOfBudget()) {
      truncated = true;
      break;
    }
    try {
      await dispatchNext(order.tenantId, order.id);
      advanced += 1;
    } catch (err) {
      // Safe to swallow: this order still matches the leg-2 selector next tick.
      logger.warn({ err, orderId: order.id }, "sweepDispatch: advance failed");
    }
  }

  // ── Leg 3a: adopt NO_DRIVER orders that carry no retry clock ──────────────
  // Every order that exhausted BEFORE this feature shipped has a NULL stamp,
  // and the leg-3b selector below is a `lte` — NULL never matches one. Without
  // this pass the orders the client was actually complaining about, the ones
  // already sitting at No Driver, would be the only orders the fix never
  // reached. It is also a standing self-heal: any path that lands an order in
  // NO_DRIVER without stamping it gets adopted on the next tick rather than
  // stranding the order forever.
  //
  // The update IS the claim — a row only matches while its stamp is NULL — so
  // two concurrent sweeps cannot both adopt the same order.
  // eslint-disable-next-line no-prisma-without-tenant -- cron-internal: cross-tenant by design; sets only a scheduling stamp, no tenant-visible state.
  const adopted = await prisma.deliveryOrder.updateMany({
    where: { status: "NO_DRIVER", nextRedispatchAt: null },
    // Due immediately: these have been waiting long enough already.
    data: { nextRedispatchAt: now },
  });
  if (adopted.count > 0) {
    logger.info({ adopted: adopted.count }, "sweepDispatch: adopted unstamped NO_DRIVER orders");
  }

  // ── Leg 3b: retry orders that ran out of offer rounds ─────────────────────
  // Revision 4 (#1). Before this leg an order that exhausted its rounds sat at
  // NO_DRIVER until a supervisor noticed — which is how an order ends up with
  // an SLA measured in days. Now the sweep keeps offering it on a backoff,
  // and those retry rounds search without a radius cap.
  // eslint-disable-next-line no-prisma-without-tenant -- cron-internal: cross-tenant by design; retryExhaustedOrder re-filters every write on the row's own tenantId.
  const exhaustedOrders = await prisma.deliveryOrder.findMany({
    where: { status: "NO_DRIVER", nextRedispatchAt: { lte: now } },
    select: { id: true, tenantId: true },
    orderBy: { nextRedispatchAt: "asc" }, // longest-overdue customer first
    take: limit,
  });

  let retried = 0;
  for (const order of exhaustedOrders) {
    if (outOfBudget()) {
      truncated = true;
      break;
    }
    try {
      if (await retryExhaustedOrder(order)) retried += 1;
    } catch (err) {
      // The claim already cleared nextRedispatchAt, so a throw here would park
      // the order for good. Re-arm it on the shortest backoff instead.
      logger.warn({ err, orderId: order.id }, "sweepDispatch: redispatch failed");
      await prisma.deliveryOrder
        .updateMany({
          where: { id: order.id, tenantId: order.tenantId, status: "NO_DRIVER" },
          data: { nextRedispatchAt: new Date(Date.now() + REDISPATCH_BACKOFF_SEC[0] * 1000) },
        })
        .catch(() => {});
    }
  }
  if (exhaustedOrders.length === limit) truncated = true;

  if (truncated) {
    logger.warn(
      { limit, dueFound: due.length, wedgedFound: wedgedOrders.length, advanced, retried },
      "sweepDispatch: hit the per-run cap — backlog remains, next tick continues",
    );
  }
  logger.info(
    {
      expired,
      advanced,
      wedged: wedgedOrders.length,
      retried,
      durationMs: Date.now() - startedAt,
    },
    "dispatch sweep",
  );
  return { expired, advanced, wedged: wedgedOrders.length, retried, truncated };
}

// ─── Accept / decline ───────────────────────────────────────────────────────

/**
 * Revision 5 (#1): "adjust the ETA accordingly".
 *
 * When the winning driver is still carrying a delivery, the customer's promise
 * has to absorb the time he spends finishing it. Recomputed here rather than
 * carried over from the offer because the offer may have been sitting for a
 * few seconds and the driver may already be at the door — what matters is the
 * delay that is still ahead at the moment the order becomes his.
 *
 * Runs inside the accept transaction. Returns the minutes added, 0 when the
 * driver is free (the ordinary case) or when the order carries no deadline to
 * move. The deadline is only ever pushed out, never pulled in: an SLA that
 * shortens itself because a driver happened to be nearby is not a promise
 * anybody made.
 */
async function extendEtaForBusyDriver(
  trx: Prisma.TransactionClient,
  tenantId: string,
  order: { id: string; slaDeadline: Date | null },
  driverId: string,
): Promise<number> {
  if (!order.slaDeadline) return 0;

  const leg = await trx.deliveryOrder.findFirst({
    where: { tenantId, driverId, status: "PICKED_UP", id: { not: order.id } },
    select: { dropoffLat: true, dropoffLng: true },
  });
  if (!leg) return 0;

  const session = await trx.courierOnlineSession.findFirst({
    where: { tenantId, driverId, availability: { not: "OFFLINE" } },
    orderBy: { lastGpsAt: "desc" },
    select: { lastGpsLat: true, lastGpsLng: true },
  });

  const dropLat = toNum(leg.dropoffLat);
  const dropLng = toNum(leg.dropoffLng);
  const gpsLat = toNum(session?.lastGpsLat);
  const gpsLng = toNum(session?.lastGpsLng);

  // No way to measure the remaining leg: still push the deadline by the
  // hand-over allowance, because the delay is real even when unmeasurable.
  const addedMin =
    dropLat == null || dropLng == null || gpsLat == null || gpsLng == null
      ? HANDOVER_MIN
      : Math.ceil((haversineMeters(gpsLat, gpsLng, dropLat, dropLng) / 1000 / AVG_SPEED_KMH) * 60) +
        HANDOVER_MIN;

  await trx.deliveryOrder.updateMany({
    where: { id: order.id, tenantId },
    data: { slaDeadline: new Date(order.slaDeadline.getTime() + addedMin * 60_000) },
  });
  return addedMin;
}

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

  let committed: {
    tx: object;
    order: DeliveryOrder;
    siblingOrders: string[];
    etaExtendedMin: number;
  };
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
        data: { driverId, assignedAt: now, ...(offer.batchId ? { batchId: offer.batchId } : {}) },
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

      // PRD §8 batching: winning one offer of a batch wins the whole batch.
      // Partial wins are acceptable — a sibling cancelled mid-offer must never
      // roll back the primary accept, so each sibling is guarded separately.
      const siblingOrders: string[] = [];
      if (offer.batchId) {
        const siblings = await trx.dispatchOffer.findMany({
          where: {
            tenantId,
            batchId: offer.batchId,
            id: { not: offerId },
            driverId,
            status: "OFFERED",
          },
        });
        for (const sib of siblings) {
          const sibWon = await trx.dispatchOffer.updateMany({
            where: { id: sib.id, tenantId, status: "OFFERED" },
            data: { status: "ACCEPTED", respondedAt: now },
          });
          if (sibWon.count === 0) continue;
          try {
            await transitionOrder(trx, {
              orderId: sib.orderId,
              tenantId,
              from: "DISPATCHING",
              to: "ASSIGNED",
              actor: { type: "DRIVER", id: driverId },
              data: { driverId, assignedAt: now, batchId: offer.batchId },
              eventMeta: { driverId, offerId: sib.id, round: sib.round, batchId: offer.batchId },
            });
            siblingOrders.push(sib.orderId);
          } catch (err) {
            if (err instanceof OrderStateConflictError) {
              // Sibling order left DISPATCHING (cancelled) — close its offer
              // honestly and move on; the primary accept stands.
              await trx.dispatchOffer.updateMany({
                where: { id: sib.id, tenantId },
                data: { status: "CANCELLED" },
              });
              continue;
            }
            throw err;
          }
        }
      }

      // Contract #2: carrying an order ⇒ session availability BUSY (same tx
      // as the ASSIGNED transition so the flag can't disagree with the order).
      await markDriverBusy(trx, tenantId, driverId);

      // Revision 5 (#1): the winner may be a reserve-tier driver still finishing
      // a drop. Move the promise before anyone reads it — the tracking page is
      // live the moment this commits.
      const etaExtendedMin = await extendEtaForBusyDriver(trx, tenantId, order, driverId);

      const fresh = await trx.deliveryOrder.findFirst({ where: { id: order.id, tenantId } });
      return {
        tx: trx,
        order: fresh ?? ({ ...order, status: "ASSIGNED", driverId, assignedAt: now } as DeliveryOrder),
        siblingOrders,
        etaExtendedMin,
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
    // Non-zero means the order went to a driver still finishing another drop
    // and the promise moved with it — ops should see the reason, not just a
    // deadline that changed on its own.
    ...(committed.etaExtendedMin > 0 ? { etaExtendedMin: committed.etaExtendedMin } : {}),
  });
  void enqueueFoodicsWriteback(committed.order.id, "ASSIGNED").catch((err) =>
    logger.warn({ err, orderId: committed.order.id }, "foodics writeback enqueue failed"),
  );
  fireCustomerMilestone(committed.order.id, tenantId, "ASSIGNED");

  // Batched siblings: same post-commit fan-out per accepted order.
  for (const siblingOrderId of committed.siblingOrders) {
    publishOrderEvent(tenantId, "offer.accepted", {
      orderId: siblingOrderId,
      driverId,
      batchOf: committed.order.id,
    });
    void enqueueFoodicsWriteback(siblingOrderId, "ASSIGNED").catch(() => {});
    fireCustomerMilestone(siblingOrderId, tenantId, "ASSIGNED");
  }

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

  // PRD §8 batching: declining one offer of a batch declines the whole batch.
  let siblingOrderIds: string[] = [];
  if (offer.batchId) {
    siblingOrderIds = await closeBatchSiblings(tenantId, offer.batchId, offerId, "DECLINED");
  }

  await enqueueDispatchNext(offer.orderId, tenantId);
  for (const orderId of siblingOrderIds) {
    await enqueueDispatchNext(orderId, tenantId);
  }
}
