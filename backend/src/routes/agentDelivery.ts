/**
 * Darb 2.0 driver agent API (plan §A9) — the delivery loop surface of the
 * mobile app. Mounted at /api/agent alongside routes/agent.ts.
 *
 * Auth: device-token (Bearer <deviceId> / ?deviceId= / body.deviceId) via
 * routes/agent.ts::resolveDriverFromAgentRequest — no JWT middleware.
 *
 * Contract highlights (single source of truth for the mobile app):
 *   GET  /state                — hydration + 4s poll: driver, availability,
 *                                lockout, activeOffer, activeOrder, wallet,
 *                                supervisorPhone, serverTime.
 *   POST /availability         — ONLINE|BUSY|OFFLINE; 409 CASH_CEILING_LOCKOUT
 *                                / 409 ACTIVE_ORDER.
 *   POST /offers/:id/accept    — 200 {order} | 410 OFFER_EXPIRED | 404.
 *   POST /offers/:id/reject    — idempotent 200 {ok:true}.
 *   POST /orders/:id/status    — granular milestones (idempotencyKey replay,
 *                                monotonic guard); PICKED_UP runs the real FSM.
 *   POST /orders/:id/pod       — atomic PIN/PHOTO verify + DELIVERED + wallet.
 *   POST /orders/:id/failed    — ASSIGNED|PICKED_UP → FAILED.
 *   GET  /wallet               — wallet summary + lockout flag.
 *   POST /incidents            — multipart SOS (≤3 photos) → 201 + sos.raised.
 *   GET  /incidents/:id        — 10s status poll.
 */
import { Router, Request, Response } from "express";
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { upload } from "../utils/upload";
import { resolveDriverFromAgentRequest } from "./agent";
import { publishEvent } from "../services/eventBus";
import {
  OfferGoneError,
  acceptOffer,
  declineOffer,
} from "../services/dispatch/dispatchEngine";
import {
  OrderActor,
  OrderStateConflictError,
  flushOrderEvents,
  transitionOrder,
} from "../services/orderStateMachine";
import { enqueueFoodicsWriteback } from "../services/foodics/writebackHook";
import { fireCustomerMilestone } from "../services/customerMessagingService";
import { completeDelivery, failDelivery } from "../services/orderService";
import {
  getDriverWalletSummary,
  isDriverOverCeiling,
} from "../services/wallet/walletService";

const router = Router();

// ─── Constants ──────────────────────────────────────────────────────────────

const AVAILABILITY_VALUES = ["ONLINE", "BUSY", "OFFLINE"] as const;
type Availability = (typeof AVAILABILITY_VALUES)[number];

const GRANULAR_STATUSES = [
  "HEADING_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKED_UP",
  "HEADING_TO_DROPOFF",
  "ARRIVED_AT_DROPOFF",
] as const;
type GranularStatus = (typeof GRANULAR_STATUSES)[number];

/** Monotonic delivery progression — status pushes may never go backwards. */
const PHASE_RANK: Record<GranularStatus, number> = {
  HEADING_TO_PICKUP: 1,
  ARRIVED_AT_PICKUP: 2,
  PICKED_UP: 3,
  HEADING_TO_DROPOFF: 4,
  ARRIVED_AT_DROPOFF: 5,
};

const MAX_PIN_ATTEMPTS = 3;

/** Agent incident categories → IncidentType (unknown ⇒ SOS). */
const INCIDENT_CATEGORY_TO_TYPE: Record<string, string> = {
  SOS: "SOS",
  ACCIDENT: "ACCIDENT",
  BREAKDOWN: "VEHICLE_BREAKDOWN",
  CUSTOMER_AGGRESSION: "CUSTOMER_ISSUE",
  ROAD_BLOCKAGE: "OTHER",
};

const ACTIVE_ORDER_STATUSES = ["ASSIGNED", "PICKED_UP"] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function kwdNum(value: unknown): number {
  return Number(Number(value ?? 0).toFixed(3));
}

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function metaOf(order: { metadata?: unknown }): Record<string, unknown> {
  const meta = order.metadata;
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? { ...(meta as Record<string, unknown>) }
    : {};
}

function driverActor(driver: { id: string; name: string }): OrderActor {
  return { type: "DRIVER", id: driver.id, name: driver.name };
}

function handleAgentError(res: Response, err: unknown): void {
  if (err instanceof OfferGoneError) {
    res.status(410).json({ error: "OFFER_EXPIRED" });
    return;
  }
  if (err instanceof OrderStateConflictError) {
    res.status(409).json({ error: "ORDER_STATE_CONFLICT" });
    return;
  }
  res.status(400).json({ error: (err as Error).message });
}

/** Supervisor phone: Tenant.settings.supervisorPhone → env fallback → null. */
async function getSupervisorPhone(tenantId: string): Promise<string | null> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = tenant?.settings as Record<string, unknown> | null | undefined;
    const phone = settings?.supervisorPhone;
    if (typeof phone === "string" && phone.trim()) return phone.trim();
  } catch (err) {
    logger.warn({ err, tenantId }, "supervisorPhone lookup failed");
  }
  return process.env.DARB_SUPERVISOR_PHONE || null;
}

type OrderRow = {
  id: string;
  status: string;
  orderNumber: string;
  vendorId: string;
  paymentMethod: string;
  orderTotalKwd: unknown;
  deliveryFeeKwd: unknown;
  customerPhone: string | null;
  dropoffAddress: string | null;
  dropoffLat: unknown;
  dropoffLng: unknown;
  slaDeadline: Date | null;
  podPin: string | null;
  metadata?: unknown;
  branch?: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    lat?: unknown;
    lng?: unknown;
  } | null;
  pickupZone?: { code?: string | null; name?: string | null } | null;
  dropoffZone?: { code?: string | null; name?: string | null } | null;
};

/**
 * Granular client status: coarse FSM status refined by the latest driver
 * milestone persisted in order.metadata.driverPhase (POST /orders/:id/status).
 */
function granularStatus(order: OrderRow): string {
  const phase = metaOf(order).driverPhase as GranularStatus | undefined;
  if (
    order.status === "ASSIGNED" &&
    (phase === "HEADING_TO_PICKUP" || phase === "ARRIVED_AT_PICKUP")
  ) {
    return phase;
  }
  if (
    order.status === "PICKED_UP" &&
    (phase === "HEADING_TO_DROPOFF" || phase === "ARRIVED_AT_DROPOFF")
  ) {
    return phase;
  }
  return order.status;
}

/** Current monotonic rank of an order (status floor + persisted phase). */
function currentPhaseRank(order: OrderRow): number {
  const statusRank = order.status === "PICKED_UP" ? PHASE_RANK.PICKED_UP : 0;
  const phase = metaOf(order).driverPhase as GranularStatus | undefined;
  const phaseRank = phase && PHASE_RANK[phase] ? PHASE_RANK[phase] : 0;
  return Math.max(statusRank, phaseRank);
}

/** §A9 activeOrder shape (also the POST accept / POST pod order shape). */
function shapeActiveOrder(order: OrderRow) {
  return {
    id: order.id,
    status: granularStatus(order),
    pickup: {
      name: order.branch?.name ?? null,
      address: order.branch?.address ?? null,
      lat: toNum(order.branch?.lat),
      lng: toNum(order.branch?.lng),
      phone: order.branch?.phone ?? null,
    },
    dropoff: {
      zone: order.dropoffZone?.code ?? order.dropoffZone?.name ?? null,
      address: order.dropoffAddress ?? null,
      lat: toNum(order.dropoffLat),
      lng: toNum(order.dropoffLng),
      customerPhone: order.customerPhone ?? null,
    },
    codAmountKwd: order.paymentMethod === "COD" ? kwdNum(order.orderTotalKwd) : 0,
    feeKwd: kwdNum(order.deliveryFeeKwd),
    slaDeadline: order.slaDeadline ? new Date(order.slaDeadline).toISOString() : null,
    podRequired: "PIN_OR_PHOTO" as const,
  };
}

const ORDER_INCLUDE = {
  branch: true,
  pickupZone: true,
  dropoffZone: true,
} as const;

async function findDriverOrder(
  tenantId: string,
  driverId: string,
  orderId: string,
): Promise<OrderRow | null> {
  return (await prisma.deliveryOrder.findFirst({
    where: { id: orderId, tenantId, driverId },
    include: ORDER_INCLUDE,
  })) as unknown as OrderRow | null;
}

/** OrderEvent replay lookup by metadata.idempotencyKey. */
async function findReplayEvent(
  tenantId: string,
  orderId: string,
  idempotencyKey: string,
): Promise<{ id: string } | null> {
  return prisma.orderEvent.findFirst({
    where: {
      tenantId,
      orderId,
      metadata: { path: ["idempotencyKey"], equals: idempotencyKey },
    },
    select: { id: true },
  });
}

// ─── GET /state ─────────────────────────────────────────────────────────────

router.get("/state", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const { driver } = identity;
    const tenantId = driver.tenantId;
    const now = new Date();

    const [session, wallet, offer, activeOrderRow, supervisorPhone] = await Promise.all([
      prisma.courierOnlineSession.findFirst({
        where: { tenantId, driverId: driver.id, isOnline: true },
        orderBy: { startTime: "desc" },
      }),
      getDriverWalletSummary(tenantId, driver.id),
      prisma.dispatchOffer.findFirst({
        where: { tenantId, driverId: driver.id, status: "OFFERED", expiresAt: { gt: now } },
        orderBy: { offeredAt: "desc" },
        include: { order: { include: ORDER_INCLUDE } },
      }),
      prisma.deliveryOrder.findFirst({
        where: { tenantId, driverId: driver.id, status: { in: [...ACTIVE_ORDER_STATUSES] } },
        orderBy: { assignedAt: "desc" },
        include: ORDER_INCLUDE,
      }),
      getSupervisorPhone(tenantId),
    ]);

    const offerOrder = (offer as { order?: OrderRow } | null)?.order ?? null;
    const activeOffer =
      offer && offerOrder
        ? {
            offerId: offer.id,
            orderId: offer.orderId,
            pickup: {
              name: offerOrder.branch?.name ?? null,
              lat: toNum(offerOrder.branch?.lat),
              lng: toNum(offerOrder.branch?.lng),
              area: offerOrder.pickupZone?.name ?? null,
            },
            dropoff: {
              zone: offerOrder.dropoffZone?.code ?? null,
              area: offerOrder.dropoffZone?.name ?? null,
            },
            distanceKm: offer.distanceKm ?? null,
            feeKwd: kwdNum(offerOrder.deliveryFeeKwd),
            codAmountKwd:
              offerOrder.paymentMethod === "COD" ? kwdNum(offerOrder.orderTotalKwd) : 0,
            expiresAt: new Date(offer.expiresAt).toISOString(),
            serverNow: now.toISOString(),
          }
        : null;

    res.json({
      driver: { id: driver.id, name: driver.name, phone: driver.phone ?? null },
      availability: (session?.availability as Availability | undefined) ?? "OFFLINE",
      lockout: wallet.blocked ? { reason: "CASH_CEILING" as const } : null,
      activeOffer,
      activeOrder: activeOrderRow
        ? shapeActiveOrder(activeOrderRow as unknown as OrderRow)
        : null,
      wallet: {
        cashOnHandKwd: Number(wallet.cashOnHandKwd),
        ceilingKwd: Number(wallet.ceilingKwd),
        todayCollectedKwd: Number(wallet.todayCollectedKwd),
      },
      supervisorPhone,
      serverTime: now.toISOString(),
    });
  } catch (err) {
    handleAgentError(res, err);
  }
});

// ─── POST /availability ─────────────────────────────────────────────────────

router.post("/availability", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const { driver, device } = identity;
    const tenantId = driver.tenantId;

    const availability = String(req.body?.availability ?? "").toUpperCase() as Availability;
    if (!AVAILABILITY_VALUES.includes(availability)) {
      res
        .status(400)
        .json({ error: `availability must be one of ${AVAILABILITY_VALUES.join(", ")}` });
      return;
    }

    if (availability === "ONLINE") {
      const over = await isDriverOverCeiling(tenantId, driver.id);
      if (over) {
        res.status(409).json({ error: "CASH_CEILING_LOCKOUT" });
        return;
      }
    }

    if (availability === "OFFLINE") {
      const active = await prisma.deliveryOrder.findFirst({
        where: {
          tenantId,
          driverId: driver.id,
          status: { in: [...ACTIVE_ORDER_STATUSES] },
        },
        select: { id: true },
      });
      if (active) {
        res.status(409).json({ error: "ACTIVE_ORDER" });
        return;
      }
    }

    const now = new Date();
    const isOnline = availability !== "OFFLINE";
    // No @@unique on CourierOnlineSession — findFirst + update OR create
    // (same pattern as the /location ingest in routes/agent.ts).
    const existing = await prisma.courierOnlineSession.findFirst({
      where: { tenantId, driverId: driver.id, isOnline: true },
      orderBy: { startTime: "desc" },
    });
    if (existing) {
      await prisma.courierOnlineSession.update({
        where: { id: existing.id },
        data: {
          availability,
          isOnline,
          ...(isOnline ? {} : { endTime: now }),
        },
      });
    } else if (isOnline) {
      await prisma.courierOnlineSession.create({
        data: {
          tenantId,
          driverId: driver.id,
          isOnline: true,
          availability,
          startTime: now,
          // Seed last-known GPS from the device so dispatch can rank the
          // driver before the first /location batch lands.
          ...(device.lastLatitude != null && device.lastLongitude != null
            ? {
                lastGpsAt: device.lastSeen ?? now,
                lastGpsLat: device.lastLatitude,
                lastGpsLng: device.lastLongitude,
              }
            : {}),
        },
      });
    }

    void publishEvent({
      type: availability === "OFFLINE" ? "driver.offline" : "driver.online",
      tenantId,
      payload: { driverId: driver.id, availability, at: now.toISOString() },
      timestamp: now.toISOString(),
    }).catch(() => {});

    res.json({ ok: true, availability });
  } catch (err) {
    handleAgentError(res, err);
  }
});

// ─── POST /offers/:id/accept ────────────────────────────────────────────────

router.post("/offers/:id/accept", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const { driver } = identity;
    const tenantId = driver.tenantId;

    // Unknown offer / another driver's offer → 404 (410 is reserved for
    // "was yours, gone now").
    const offerRow = await prisma.dispatchOffer.findFirst({
      where: { id: req.params.id, tenantId, driverId: driver.id },
      select: { id: true },
    });
    if (!offerRow) {
      res.status(404).json({ error: "Offer not found" });
      return;
    }

    const { order } = await acceptOffer({
      tenantId,
      offerId: req.params.id,
      driverId: driver.id,
    });

    const shaped = await findDriverOrder(tenantId, driver.id, order.id);
    res.json({
      order: shaped ? shapeActiveOrder(shaped) : shapeActiveOrder(order as unknown as OrderRow),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    handleAgentError(res, err);
  }
});

// ─── POST /offers/:id/reject ────────────────────────────────────────────────

router.post("/offers/:id/reject", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const { driver } = identity;

    await declineOffer({
      tenantId: driver.tenantId,
      offerId: req.params.id,
      driverId: driver.id,
      reason:
        typeof req.body?.reason === "string" && req.body.reason.trim()
          ? req.body.reason.trim()
          : undefined,
    });
    res.json({ ok: true }); // idempotent — late/duplicate rejects still 200
  } catch (err) {
    handleAgentError(res, err);
  }
});

// ─── POST /orders/:id/status ────────────────────────────────────────────────

router.post("/orders/:id/status", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const { driver } = identity;
    const tenantId = driver.tenantId;

    const { status, occurredAt, idempotencyKey, lat, lng } = req.body as {
      status?: string;
      occurredAt?: string;
      idempotencyKey?: string;
      lat?: number;
      lng?: number;
    };

    if (!status || !GRANULAR_STATUSES.includes(status as GranularStatus)) {
      res
        .status(400)
        .json({ error: `status must be one of ${GRANULAR_STATUSES.join(", ")}` });
      return;
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      res.status(400).json({ error: "idempotencyKey required" });
      return;
    }
    const milestone = status as GranularStatus;

    const order = await findDriverOrder(tenantId, driver.id, req.params.id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Idempotent replay — the outbox may re-send after a crash/offline flush.
    const replayed = await findReplayEvent(tenantId, order.id, idempotencyKey);
    if (replayed) {
      res.json({ ok: true, status: granularStatus(order), replay: true });
      return;
    }

    // Monotonic guard + coarse-status compatibility (never backwards, never
    // a drop-off milestone before pickup).
    const newRank = PHASE_RANK[milestone];
    if (newRank <= currentPhaseRank(order)) {
      res.status(409).json({ error: "ORDER_STATE_CONFLICT" });
      return;
    }
    // Everything up to collection happens while the order is out with a driver,
    // which is ASSIGNED or, since revision 8, ARRIVED once they reach the shop.
    const allowedStatuses =
      newRank <= PHASE_RANK.PICKED_UP ? ["ASSIGNED", "ARRIVED"] : ["PICKED_UP"];
    if (!allowedStatuses.includes(order.status)) {
      res.status(409).json({ error: "ORDER_STATE_CONFLICT" });
      return;
    }

    const at =
      occurredAt && !Number.isNaN(Date.parse(occurredAt)) ? new Date(occurredAt) : new Date();
    const gpsMeta = {
      ...(typeof lat === "number" ? { lat } : {}),
      ...(typeof lng === "number" ? { lng } : {}),
    };
    const newMetadata = { ...metaOf(order), driverPhase: milestone };

    if (milestone === "PICKED_UP") {
      // Real FSM transition ASSIGNED → PICKED_UP (guarded updateMany +
      // OrderEvent + post-commit SSE order.picked_up).
      const { tx } = await prisma.$transaction(async (trx) => {
        await transitionOrder(trx, {
          orderId: order.id,
          tenantId,
          from: order.status as "ASSIGNED" | "ARRIVED",
          to: "PICKED_UP",
          actor: driverActor(driver),
          data: {
            pickedUpAt: at,
            metadata: newMetadata as Prisma.InputJsonValue,
          },
          eventMeta: {
            orderNumber: order.orderNumber,
            vendorId: order.vendorId,
            driverId: driver.id,
            idempotencyKey,
            ...gpsMeta,
          },
        });
        return { tx: trx };
      });
      flushOrderEvents(tx); // publishes SSE order.picked_up
      void enqueueFoodicsWriteback(order.id, "PICKED_UP").catch((e) =>
        logger.warn({ err: e, orderId: order.id }, "foodics writeback enqueue failed"),
      );
      fireCustomerMilestone(order.id, driver.tenantId, "PICKED_UP");
    } else if (milestone === "ARRIVED_AT_PICKUP" && order.status === "ASSIGNED") {
      // Revision 8 (#3). The driver app has always reported this milestone; it
      // just lived in metadata, so the shop could not see it. Promoting it to a
      // real status is what puts an Arrived column on the merchant board, and
      // it needs no change in the mobile app.
      const { tx } = await prisma.$transaction(async (trx) => {
        await transitionOrder(trx, {
          orderId: order.id,
          tenantId,
          from: "ASSIGNED",
          to: "ARRIVED",
          actor: driverActor(driver),
          data: {
            arrivedAt: at,
            metadata: newMetadata as Prisma.InputJsonValue,
          },
          eventMeta: {
            orderNumber: order.orderNumber,
            vendorId: order.vendorId,
            driverId: driver.id,
            idempotencyKey,
            ...gpsMeta,
          },
        });
        return { tx: trx };
      });
      flushOrderEvents(tx); // publishes SSE order.arrived
    } else {
      await prisma.orderEvent.create({
        data: {
          tenantId,
          orderId: order.id,
          action: `driver.${milestone.toLowerCase()}`,
          description: `Courier milestone: ${milestone.replace(/_/g, " ").toLowerCase()}`,
          operator: driver.name,
          operatorId: driver.id,
          timestamp: at,
          metadata: { idempotencyKey, phase: milestone, ...gpsMeta } as Prisma.InputJsonValue,
        },
      });
      await prisma.deliveryOrder.updateMany({
        where: { id: order.id, tenantId },
        data: { metadata: newMetadata as Prisma.InputJsonValue },
      });
    }

    res.json({ ok: true, status: milestone });
  } catch (err) {
    handleAgentError(res, err);
  }
});

// ─── POST /orders/:id/pod ───────────────────────────────────────────────────

router.post("/orders/:id/pod", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const { driver } = identity;
    const tenantId = driver.tenantId;

    const { method, pin, photoKey, codCollectedKwd, lat, lng, idempotencyKey } = req.body as {
      method?: string;
      pin?: string;
      photoKey?: string;
      codCollectedKwd?: string | number;
      lat?: number;
      lng?: number;
      idempotencyKey?: string;
    };

    if (method !== "PIN" && method !== "PHOTO") {
      res.status(400).json({ error: "method must be PIN or PHOTO" });
      return;
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      res.status(400).json({ error: "idempotencyKey required" });
      return;
    }

    const order = await findDriverOrder(tenantId, driver.id, req.params.id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const respondDelivered = async (row: OrderRow) => {
      const wallet = await getDriverWalletSummary(tenantId, driver.id);
      res.json({ order: shapeActiveOrder(row), wallet });
    };

    // Idempotent replay: already DELIVERED with the same key ⇒ same shape.
    if (order.status === "DELIVERED") {
      const replayed = await findReplayEvent(tenantId, order.id, idempotencyKey);
      if (replayed) {
        await respondDelivered(order);
        return;
      }
      res.status(409).json({ error: "ORDER_STATE_CONFLICT" });
      return;
    }

    if (method === "PIN") {
      const meta = metaOf(order);
      const attempts = Number(meta.pinAttempts ?? 0);
      if (attempts >= MAX_PIN_ATTEMPTS) {
        res.status(422).json({
          error: "PIN_MISMATCH",
          attemptsLeft: 0,
          message: "PIN attempts exhausted — capture a delivery photo instead",
        });
        return;
      }
      if (!pin || !order.podPin || pin !== order.podPin) {
        const newAttempts = attempts + 1;
        await prisma.deliveryOrder.updateMany({
          where: { id: order.id, tenantId },
          data: { metadata: { ...meta, pinAttempts: newAttempts } as Prisma.InputJsonValue },
        });
        const attemptsLeft = Math.max(0, MAX_PIN_ATTEMPTS - newAttempts);
        res.status(422).json({
          error: "PIN_MISMATCH",
          attemptsLeft,
          ...(attemptsLeft === 0
            ? { message: "PIN attempts exhausted — capture a delivery photo instead" }
            : {}),
        });
        return;
      }
    } else if (!photoKey || typeof photoKey !== "string") {
      res.status(400).json({ error: "photoKey required for PHOTO proof" });
      return;
    }

    // Atomic: PICKED_UP → DELIVERED + COD/prepaid wallet posting in ONE
    // interactive transaction (orderService.completeDelivery).
    const { order: delivered } = await completeDelivery({
      tenantId,
      orderId: order.id,
      actor: driverActor(driver),
      ...(codCollectedKwd != null ? { codCollectedKwd } : {}),
      ...(method === "PHOTO" && photoKey ? { proofPhotoUrl: photoKey } : {}),
      podMethod: method,
    });

    // POD marker OrderEvent — carries the idempotencyKey for replay detection.
    await prisma.orderEvent.create({
      data: {
        tenantId,
        orderId: order.id,
        action: "order.pod",
        description: `Proof of delivery recorded (${method})`,
        operator: driver.name,
        operatorId: driver.id,
        timestamp: new Date(),
        metadata: {
          idempotencyKey,
          method,
          ...(typeof lat === "number" ? { lat } : {}),
          ...(typeof lng === "number" ? { lng } : {}),
          ...(codCollectedKwd != null ? { codCollectedKwd: Number(codCollectedKwd) } : {}),
        } as Prisma.InputJsonValue,
      },
    });

    await respondDelivered({ ...order, ...(delivered as unknown as Partial<OrderRow>), branch: order.branch, pickupZone: order.pickupZone, dropoffZone: order.dropoffZone } as OrderRow);
  } catch (err) {
    handleAgentError(res, err);
  }
});

// ─── POST /orders/:id/failed ────────────────────────────────────────────────

router.post("/orders/:id/failed", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const { driver } = identity;
    const tenantId = driver.tenantId;

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) {
      res.status(400).json({ error: "reason required" });
      return;
    }

    const order = await findDriverOrder(tenantId, driver.id, req.params.id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const failed = await failDelivery({
      tenantId,
      orderId: order.id,
      reason,
      actor: driverActor(driver),
    });
    res.json({ ok: true, order: { id: failed.id, status: failed.status } });
  } catch (err) {
    handleAgentError(res, err);
  }
});

// ─── GET /wallet ────────────────────────────────────────────────────────────

router.get("/wallet", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const { driver } = identity;

    const summary = await getDriverWalletSummary(driver.tenantId, driver.id);
    res.json({
      ...summary,
      lockout: summary.blocked ? { reason: "CASH_CEILING" as const } : null,
    });
  } catch (err) {
    handleAgentError(res, err);
  }
});

// ─── POST /incidents (multipart, ≤3 photos — mirrors the tickets upload) ────

router.post("/incidents", upload.array("photos", 3), async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const { driver } = identity;
    const tenantId = driver.tenantId;

    const category = String(req.body?.category ?? "SOS").trim().toUpperCase();
    const type = INCIDENT_CATEGORY_TO_TYPE[category] ?? "SOS";
    const severity = type === "SOS" ? "CRITICAL" : "HIGH";
    const note = typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : null;
    const description =
      category === "ROAD_BLOCKAGE" ? `Road blockage${note ? `: ${note}` : ""}` : note;

    const latitude = req.body?.latitude != null ? parseFloat(req.body.latitude) : NaN;
    const longitude = req.body?.longitude != null ? parseFloat(req.body.longitude) : NaN;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      res.status(400).json({ error: "latitude out of range" });
      return;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      res.status(400).json({ error: "longitude out of range" });
      return;
    }
    const accuracy = req.body?.accuracy != null ? parseFloat(req.body.accuracy) : null;

    // Never block an SOS on a stale/foreign orderId — validate and drop.
    let orderId: string | null = null;
    if (typeof req.body?.orderId === "string" && req.body.orderId.trim()) {
      const order = await prisma.deliveryOrder.findFirst({
        where: { id: req.body.orderId.trim(), tenantId },
        select: { id: true },
      });
      orderId = order?.id ?? null;
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const photos = files.map((f) => `/uploads/${f.filename}`);

    const incident = await prisma.incident.create({
      data: {
        tenantId,
        type: type as never,
        severity,
        driverId: driver.id,
        orderId,
        lat: latitude,
        lng: longitude,
        description,
        reportedVia: "AGENT_APP",
        metadata: {
          category,
          photos,
          ...(accuracy != null && Number.isFinite(accuracy) ? { accuracy } : {}),
        } as Prisma.InputJsonValue,
      },
    });

    void publishEvent({
      type: "sos.raised",
      tenantId,
      payload: {
        incidentId: incident.id,
        type,
        severity,
        driverId: driver.id,
        driverName: driver.name,
        lat: latitude,
        lng: longitude,
        ...(orderId ? { orderId } : {}),
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    const supervisorPhone = await getSupervisorPhone(tenantId);
    res.status(201).json({ id: incident.id, status: incident.status, supervisorPhone });
  } catch (err) {
    handleAgentError(res, err);
  }
});

// ─── GET /incidents/:id ─────────────────────────────────────────────────────

router.get("/incidents/:id", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const { driver } = identity;

    const incident = await prisma.incident.findFirst({
      where: { id: req.params.id, tenantId: driver.tenantId, driverId: driver.id },
      select: { id: true, status: true },
    });
    if (!incident) {
      res.status(404).json({ error: "Incident not found" });
      return;
    }
    res.json(incident);
  } catch (err) {
    handleAgentError(res, err);
  }
});

export default router;
