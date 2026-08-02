import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { upload } from "../utils/upload";
import { nextTicketNumber } from "../utils/ticketNumber";
import { ticketSlaDeadline } from "../utils/ticketSla";
import { createTicketSubmittedNotification } from "../services/notificationService";
import { publishEvent } from "../services/eventBus";
import { logger } from "../config/logger";
import { isR2Configured, presignPutUrl } from "../services/r2Service";
import {
  agentLocationRateLimit,
  agentUploadRateLimit,
} from "../middleware/agentRateLimit";

const router = Router();

// Idempotency dedup for /location: Map<`${deviceId}:${idempotencyKey}`, expiresAt>
// 5-min sliding window. In-process only — multi-instance deployments behind a
// load balancer accept the per-instance assumption (a Vercel function is
// single-instance per cold-start; a courier sticks to one function for the
// duration of a batch). Pitfall 1 server-side defense in depth: even if the
// mobile outbox replays a batch after a crash, the server collapses dupes.
const _locationIdempotencyMap = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

// driver.location SSE throttle (§A7): ≤1 publish / 10s / driver, in-process.
// The legacy `gps_point` event stays per-batch (floor tests assert one per
// non-empty batch); only the Darb 2.0 `driver.location` stream is throttled.
const _driverLocationLastPublish = new Map<string, number>();
const DRIVER_LOCATION_THROTTLE_MS = 10_000;
function _gcIdempotency() {
  const now = Date.now();
  for (const [k, exp] of _locationIdempotencyMap) {
    if (exp <= now) _locationIdempotencyMap.delete(k);
  }
}

// Agent endpoints don't use standard auth - they use device-based auth
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { enrollmentCode, phone, imei, model, osVersion } = req.body;
    const normalizedCode = String(enrollmentCode || "").trim();
    // The DEMO code resolves a real ACTIVE driver and hands back their device
    // token to an unauthenticated caller, so it is off unless somebody turns it
    // on. Same switch as the demo login (security review, 2026-08).
    const isDemoCodeRequested = normalizedCode.toUpperCase() === "DEMO";
    const isDemoCode = isDemoCodeRequested && process.env.DEMO_LOGIN_ENABLED === "true";

    const demoTenant = isDemoCode
      ? await prisma.tenant.findFirst({ where: { name: "Osama Fleet Management" } })
      : null;

    /**
     * The enrollment code is the driver's Darb ID.
     *
     * It used to be `platformDriverId` alone — the Keeta/Talabat identifier a
     * driver inherited from the aggregator era. That number appears on no Darb
     * screen, so nobody could tell a driver what to type, and the 20 drivers
     * onboarded through the fleet portal have none at all: they could never
     * enrol. `driverCode` ("DRB-0065") is the one every surface already shows,
     * including the roster column a fleet supervisor reads from.
     *
     * The phone number is a second factor, and it is not optional. This
     * endpoint is unauthenticated and answers with the driver's device token,
     * so accepting a sequential id on its own would let anyone walk DRB-0001
     * upwards and collect the fleet. The legacy platform ids stay accepted so
     * drivers already enrolled on them are not stranded.
     */
    /**
     * The phone may arrive in its own field, or inside the code box.
     *
     * A driver on an older build has one input, so "DRB-0065 55123456" and
     * "DRB-0065/55123456" have to work as well as two separate fields. Version
     * skew between this API and an app store build is permanent, not a
     * transitional state, so the parse belongs here rather than in a release
     * note nobody reads.
     */
    const combined = /[\s,/|]+/.test(normalizedCode) ? normalizedCode.split(/[\s,/|]+/) : null;
    const codePart = combined ? combined[0] : normalizedCode;
    const phoneFromCode = combined ? combined.slice(1).join("") : "";
    const normalizedPhone = String(phone || phoneFromCode).replace(/[\s-]/g, "").trim();
    const driver = await prisma.driver.findFirst({
      where: isDemoCode
        ? {
            tenantId: demoTenant?.id,
            status: "ACTIVE",
            name: { contains: "Qadir", mode: "insensitive" },
          }
        : normalizedPhone
          ? {
              phone: { endsWith: normalizedPhone.slice(-8) },
              OR: [
                { driverCode: { equals: codePart, mode: "insensitive" } },
                { platformDriverId: codePart },
              ],
            }
          : // No phone, no enrolment. Stated as its own case so the error below
            // can say which half is missing.
            { id: "__phone-required__" },
      include: { company: true },
    }) || (isDemoCode
      ? await prisma.driver.findFirst({
          where: { tenantId: demoTenant?.id, status: "ACTIVE" },
          include: { company: true },
          orderBy: { createdAt: "asc" },
        })
      : null);
    if (!driver) {
      if (isDemoCodeRequested && !isDemoCode) {
        res.status(404).json({
          error: "The demo driver is switched off on this environment.",
          code: "DEMO_DISABLED",
        });
        return;
      }
      res.status(404).json({
        error: normalizedPhone
          ? "That Darb ID and phone number do not match a driver. Ask your supervisor to check the roster."
          : "Enter your Darb ID and the phone number registered with Darb.",
        code: normalizedPhone ? "NO_MATCH" : "PHONE_REQUIRED",
      });
      return;
    }

    const deviceImei =
      String(imei || "").trim() ||
      `agent-${driver.id}`;

    const existingDriverDevice = await prisma.device.findUnique({
      where: { driverId: driver.id },
    });
    const existingImeiDevice = existingDriverDevice
      ? null
      : await prisma.device.findUnique({ where: { imei: deviceImei } });

    // A device already enrolled to a DIFFERENT driver is not ours to take over.
    // Re-pointing it used to be allowed, which let anyone who could reach this
    // endpoint detach a working driver's handset by replaying their IMEI.
    if (existingImeiDevice && existingImeiDevice.driverId !== driver.id) {
      res.status(409).json({ error: "That device is already enrolled to another driver" });
      return;
    }
    const existingDevice = existingDriverDevice || existingImeiDevice;

    const device = existingDevice
      ? await prisma.device.update({
          where: { id: existingDevice.id },
          data: {
            model: model || "Darb Agent",
            osVersion: osVersion || "unknown",
            ...(existingDevice.driverId === driver.id ? {} : { driverId: driver.id }),
            status: "ACTIVE",
            isOnline: true,
            lastSeen: new Date(),
          },
        })
      : await prisma.device.create({
          data: {
        imei: deviceImei,
        model: model || "Darb Agent",
        osVersion: osVersion || "unknown",
        driverId: driver.id,
        tenantId: driver.tenantId,
        status: "ACTIVE",
        isOnline: true,
        lastSeen: new Date(),
          },
        });

    res.status(201).json({
      token: device.id,
      deviceId: device.id,
      driverId: driver.id,
      driver: { id: driver.id, name: driver.name, platform: driver.platform },
      company: { id: driver.company.id, name: driver.company.name },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

function numeric(value: unknown): number {
  if (value == null) return 0;
  const maybeDecimal = value as { toNumber?: () => number };
  if (typeof maybeDecimal.toNumber === "function") return maybeDecimal.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function kuwaitDayBounds(date = new Date()) {
  const kuwaitOffsetMs = 3 * 60 * 60 * 1000;
  const kuwaitNow = new Date(date.getTime() + kuwaitOffsetMs);
  const startUtcMs =
    Date.UTC(
      kuwaitNow.getUTCFullYear(),
      kuwaitNow.getUTCMonth(),
      kuwaitNow.getUTCDate(),
    ) - kuwaitOffsetMs;
  return {
    start: new Date(startUtcMs),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000),
  };
}

// Exported: routes/agentDelivery.ts (Darb 2.0 driver agent API) reuses this
// device-token resolver as its auth primitive.
export async function resolveDriverFromAgentRequest(req: Request) {
  const auth = req.headers.authorization || "";
  const bearerDeviceId = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const deviceId =
    bearerDeviceId ||
    (req.query.deviceId as string | undefined)?.trim() ||
    (req.body?.deviceId as string | undefined)?.trim();

  if (!deviceId) return null;

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: {
      sims: true,
      driver: {
        include: {
          company: true,
          supervisor: true,
          assignedVehicle: true,
          sims: true,
          device: true,
        },
      },
    },
  });

  if (!device?.driver) return null;
  return { device, driver: device.driver };
}

router.post("/heartbeat", async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      batteryLevel,
      latitude,
      longitude,
      agentVersion,
    } = req.body as {
      deviceId?: string;
      batteryLevel?: number;
      isCharging?: boolean;
      latitude?: number;
      longitude?: number;
      agentVersion?: string;
      isLowPowerMode?: boolean;
      platformGuess?: string | null;
    };

    if (!deviceId) {
      res.status(400).json({ error: "deviceId required" });
      return;
    }

    // batteryLevel arrives as a fraction 0..1 from expo-battery; Device.batteryLevel
    // is an Int (percentage). Clamp to [0..1] then round to a percentage so a
    // misbehaving client can't smuggle out-of-range or negative values.
    const batteryPct =
      typeof batteryLevel === "number"
        ? Math.round(Math.max(0, Math.min(1, batteryLevel)) * 100)
        : null;

    await prisma.device.update({
      where: { id: deviceId },
      data: {
        batteryLevel: batteryPct ?? undefined,
        isOnline: true,
        lastSeen: new Date(),
        agentVersion: agentVersion ?? undefined,
        lastLatitude: latitude ?? undefined,
        lastLongitude: longitude ?? undefined,
      },
    });

    // `isLowPowerMode` and `platformGuess` are accepted but NOT persisted on the
    // Device row in Phase 5. `platformGuess` is read fresh at attribution time
    // (resolveActivePlatform reads OrderEvent/Shift directly); `isLowPowerMode`
    // is purely a client-side throttling signal. Future phases can add Device
    // columns if persistent storage becomes necessary.
    res.json({ status: "ok" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/push-token", async (req: Request, res: Response) => {
  try {
    const { deviceId, expoPushToken } = req.body as { deviceId?: string; expoPushToken?: string };
    if (!deviceId) {
      res.status(400).json({ error: "deviceId required" });
      return;
    }
    if (!expoPushToken || !expoPushToken.startsWith("ExponentPushToken[")) {
      res.status(400).json({ error: "Valid expoPushToken required" });
      return;
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: { driverId: true },
    });
    if (!device?.driverId) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }

    await prisma.driver.update({
      where: { id: device.driverId },
      data: { expoPushToken },
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/profile", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) { res.status(404).json({ error: "Device or driver not found" }); return; }

    const { driver, device } = identity;
    const vehicle = driver.assignedVehicle;
    const sim = driver.sims[0] || device.sims[0] || null;
    const latestScore = await prisma.aiScore.findFirst({
      where: { tenantId: driver.tenantId, driverId: driver.id },
      orderBy: { date: "desc" },
    });
    const pendingCash = await prisma.cashRecord.aggregate({
      where: { tenantId: driver.tenantId, driverId: driver.id, status: { in: ["PENDING", "PARTIALLY_PAID"] } },
      _sum: { pendingDues: true },
    });

    res.json({
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      platform: driver.platform,
      vehicleType: driver.vehicleType,
      vehiclePlate: vehicle?.plateNumber ?? null,
      vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model}` : null,
      status: driver.status,
      company: driver.company?.name ?? null,
      supervisor: driver.supervisor?.name ?? null,
      zone: driver.zone ?? null,
      batchNumber: driver.batchNumber ?? null,
      hireDate: driver.hireDate,
      civilIdStatus: driver.civilIdStatus ?? null,
      drivingLicenseStatus: driver.drivingLicenseStatus ?? null,
      healthCertStatus: driver.healthCertStatus ?? null,
      simNumber: sim?.phoneNumber ?? null,
      device: {
        id: device.id,
        model: device.model,
        osVersion: device.osVersion,
        batteryLevel: device.batteryLevel,
        isOnline: device.isOnline,
        lastSeen: device.lastSeen,
      },
      score: latestScore?.compositeScore ?? null,
      cashDue: numeric(pendingCash._sum.pendingDues),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) { res.status(404).json({ error: "Device or driver not found" }); return; }

    const { driver } = identity;
    const now = new Date();
    const today = kuwaitDayBounds(now);
    const weekStart = new Date(today.start.getTime() - 6 * 24 * 60 * 60 * 1000);

    const [todayOrders, weekOrders, latestScore, pendingCash, activeShift, nextShift, openTickets] =
      await Promise.all([
        prisma.orderLog.aggregate({
          where: { tenantId: driver.tenantId, driverId: driver.id, date: { gte: today.start, lt: today.end } },
          _sum: { orderCount: true, cashCollected: true, totalAmount: true },
        }),
        prisma.orderLog.aggregate({
          where: { tenantId: driver.tenantId, driverId: driver.id, date: { gte: weekStart, lt: today.end } },
          _sum: { orderCount: true, cashCollected: true, totalAmount: true },
        }),
        prisma.performanceSnapshot.findFirst({
          where: { tenantId: driver.tenantId, driverId: driver.id },
          orderBy: { snapshotDate: "desc" },
        }),
        prisma.cashRecord.aggregate({
          where: { tenantId: driver.tenantId, driverId: driver.id, status: { in: ["PENDING", "PARTIALLY_PAID"] } },
          _sum: { pendingDues: true },
        }),
        prisma.shift.findFirst({
          where: {
            tenantId: driver.tenantId,
            driverId: driver.id,
            status: "IN_PROGRESS",
          },
          orderBy: { scheduledStart: "desc" },
        }),
        prisma.shift.findFirst({
          where: {
            tenantId: driver.tenantId,
            driverId: driver.id,
            scheduledEnd: { gte: now },
            status: { in: ["BOOKED", "IN_PROGRESS"] },
          },
          orderBy: { scheduledStart: "asc" },
        }),
        prisma.ticket.count({
          where: {
            tenantId: driver.tenantId,
            submitterDriverId: driver.id,
            status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] },
          },
        }),
      ]);

    const shiftForMinutes = activeShift || (
      nextShift && nextShift.scheduledStart <= now && nextShift.scheduledEnd >= now
        ? nextShift
        : null
    );
    const onlineMinutes = shiftForMinutes
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(shiftForMinutes.actualStart ?? shiftForMinutes.scheduledStart).getTime()) /
              60000,
          ),
        )
      : 0;

    res.json({
      driverName: driver.name,
      platform: driver.platform,
      zone: driver.zone,
      ordersToday: todayOrders._sum.orderCount ?? 0,
      weekOrders: weekOrders._sum.orderCount ?? 0,
      todayCash: numeric(todayOrders._sum.cashCollected) || numeric(todayOrders._sum.totalAmount),
      weekCash: numeric(weekOrders._sum.cashCollected) || numeric(weekOrders._sum.totalAmount),
      cashDue: numeric(pendingCash._sum.pendingDues),
      onlineMinutes,
      completionRate: latestScore?.deliveryScore ?? 0,
      rating: latestScore ? Number((latestScore.compositeScore / 20).toFixed(1)) : 0,
      score: latestScore?.compositeScore ?? null,
      trend: latestScore?.trend ?? null,
      openTickets,
      onShift: Boolean(shiftForMinutes),
      activeShift: shiftForMinutes
        ? {
            id: shiftForMinutes.id,
            area: shiftForMinutes.deliveryArea ?? shiftForMinutes.zone,
            startTime: shiftForMinutes.scheduledStart,
            endTime: shiftForMinutes.scheduledEnd,
            status: shiftForMinutes.status,
          }
        : null,
      nextShift: nextShift
        ? {
            id: nextShift.id,
            area: nextShift.deliveryArea ?? nextShift.zone,
            startTime: nextShift.scheduledStart,
            endTime: nextShift.scheduledEnd,
            status: nextShift.status,
          }
        : null,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/orders", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) { res.status(404).json({ error: "Device or driver not found" }); return; }

    const { driver } = identity;
    const today = kuwaitDayBounds();
    const since = new Date(today.start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rows = await prisma.orderLog.findMany({
      where: { tenantId: driver.tenantId, driverId: driver.id, date: { gte: since } },
      orderBy: [{ date: "desc" }, { arrivalTime: "desc" }],
      take: 30,
    });

    res.json({
      data: rows.map((order) => ({
        id: order.id,
        platform: order.platform,
        status: "completed",
        merchantName: order.restaurantName || "Restaurant",
        deliveryAddress: driver.zone || order.paymentSource || "Delivery area",
        amount: numeric(order.cashCollected) || numeric(order.totalAmount),
        cashCollected: numeric(order.cashCollected),
        orderCount: order.orderCount,
        orderNumber: order.orderNumber,
        createdAt: order.arrivalTime || order.date,
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/shifts", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) { res.status(404).json({ error: "Device or driver not found" }); return; }

    const { driver } = identity;
    const today = kuwaitDayBounds();
    const since = new Date(today.start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const until = new Date(today.start.getTime() + 14 * 24 * 60 * 60 * 1000);

    const shifts = await prisma.shift.findMany({
      where: {
        tenantId: driver.tenantId,
        driverId: driver.id,
        scheduledStart: { gte: since, lt: until },
      },
      orderBy: { scheduledStart: "asc" },
      take: 40,
    });

    res.json({
      data: shifts.map((shift) => ({
        id: shift.id,
        date: shift.date,
        startTime: shift.scheduledStart,
        endTime: shift.scheduledEnd,
        area: shift.deliveryArea || shift.zone,
        status: shift.status,
        actualStart: shift.actualStart,
        actualEnd: shift.actualEnd,
        platform: shift.platform,
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Equipment ──────────────────────────────────────────────────────────────
// The kit a driver is issued (helmet, bag, phone, etc.). Drivers can flag an
// item as damaged / changed / request-change from the mobile app.
const DEFAULT_EQUIPMENT_KIT = [
  "HELMET",
  "BIG_BAG",
  "TSHIRT",
  "MOBILE_PHONE",
] as const;

const REPORTABLE_CONDITIONS = ["DAMAGED", "CHANGED", "CHANGE_REQUESTED"] as const;
type ReportableCondition = (typeof REPORTABLE_CONDITIONS)[number];

const EQUIPMENT_LABELS: Record<string, string> = {
  HELMET: "Helmet",
  TSHIRT: "T-shirt",
  PANTS: "Pants",
  COOLING_VEST: "Cooling vest",
  SAFETY_VEST: "Safety vest",
  WATER_BOTTLE: "Water bottle",
  GLOVES: "Gloves",
  SAFETY_KIT: "Safety kit",
  BIG_BAG: "Big delivery bag",
  SMALL_BAG: "Small delivery bag",
  CAP: "Cap",
  MOBILE_PHONE: "Mobile phone",
  SIM_CARD: "SIM card",
  PETROL_CARD: "Petrol card",
};

function mapEquipment(item: {
  id: string;
  itemType: string;
  quantity: number;
  issued: boolean;
  issuedDate: Date | null;
  condition: string;
  conditionNote: string | null;
  conditionReportedAt: Date | null;
}) {
  return {
    id: item.id,
    itemType: item.itemType,
    label: EQUIPMENT_LABELS[item.itemType] ?? item.itemType,
    quantity: item.quantity,
    issued: item.issued,
    issuedDate: item.issuedDate,
    condition: item.condition,
    conditionNote: item.conditionNote,
    conditionReportedAt: item.conditionReportedAt,
  };
}

// GET /api/agent/equipment — list the driver's issued kit. If the driver has no
// inventory rows yet, lazily provision the default kit so the screen is usable
// immediately (assignment from an ops console is a separate, future flow).
router.get("/equipment", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) { res.status(404).json({ error: "Device or driver not found" }); return; }

    const { driver } = identity;
    let items = await prisma.driverInventory.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: "asc" },
    });

    if (items.length === 0) {
      await prisma.driverInventory.createMany({
        data: DEFAULT_EQUIPMENT_KIT.map((itemType) => ({
          driverId: driver.id,
          itemType,
          issued: true,
          quantity: 1,
          issuedDate: new Date(),
        })),
      });
      items = await prisma.driverInventory.findMany({
        where: { driverId: driver.id },
        orderBy: { createdAt: "asc" },
      });
    }

    res.json({ data: items.map(mapEquipment) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/agent/equipment/:id/condition — driver reports an item as
// DAMAGED | CHANGED | CHANGE_REQUESTED with an optional note.
router.post("/equipment/:id/condition", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) { res.status(404).json({ error: "Device or driver not found" }); return; }

    const { driver } = identity;
    const { condition, note } = req.body as { condition?: string; note?: string };

    if (!condition || !REPORTABLE_CONDITIONS.includes(condition as ReportableCondition)) {
      res.status(400).json({
        error: `condition must be one of ${REPORTABLE_CONDITIONS.join(", ")}`,
      });
      return;
    }

    // Ensure the item belongs to this driver before mutating it.
    const existing = await prisma.driverInventory.findFirst({
      where: { id: req.params.id, driverId: driver.id },
    });
    if (!existing) { res.status(404).json({ error: "Equipment item not found" }); return; }

    const updated = await prisma.driverInventory.update({
      where: { id: existing.id },
      data: {
        condition: condition as ReportableCondition,
        conditionNote: typeof note === "string" && note.trim() ? note.trim() : null,
        conditionReportedAt: new Date(),
      },
    });

    res.json(mapEquipment(updated));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Notifications (client request, 2026-08-01) ─────────────────────────────
//
// The driver's own feed. Scoped to their Driver row and NEVER to the tenant at
// large: a driver opening this must not be handed the staff notices that share
// the table, which is why the filter is driverId and not "driverId or null".

/**
 * @swagger
 * /api/agent/photo-inline:
 *   post:
 *     tags: [Driver App]
 *     summary: Store a proof photo in the database when R2 is not configured
 */
router.post("/photo-inline", agentUploadRateLimit, async (req: Request, res: Response) => {
  try {
    const { deviceId, key, orderId, dataBase64, contentType } = req.body as {
      deviceId?: string;
      key?: string;
      orderId?: string;
      dataBase64?: string;
      contentType?: string;
    };
    if (!deviceId || !key || !orderId || !dataBase64) {
      res.status(400).json({ error: "deviceId, key, orderId, dataBase64 required" });
      return;
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { driver: true },
    });
    if (!device || !device.driver) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const tenantId = device.driver.tenantId;

    // Same guard the metadata route uses: the key is issued by us and scoped to
    // the caller's tenant, so a key that is not is a forged one.
    if (!String(key).startsWith(tenantId + "/")) {
      res.status(403).json({ error: "key tenant mismatch" });
      return;
    }

    // The payload arrives as a data URL or bare base64 depending on platform.
    const base64 = String(dataBase64).includes(",")
      ? String(dataBase64).slice(String(dataBase64).indexOf(",") + 1)
      : String(dataBase64);
    const data = Buffer.from(base64, "base64");
    // The client compresses to roughly 200 KB. 3 MB is the same ceiling the
    // stamped invoice uses and leaves room under Vercel's 4.5 MB body limit
    // once base64 has added its third.
    if (data.length === 0 || data.length > 3 * 1024 * 1024) {
      res.status(400).json({ error: "Photo must be between 1 byte and 3MB" });
      return;
    }

    // Upsert: the outbox retries, and a retry must not fail on the key it
    // already wrote.
    await prisma.deliveryPhoto.upsert({
      where: { key },
      create: {
        tenantId,
        key,
        orderId,
        driverId: device.driver.id,
        mimeType: contentType === "image/png" ? "image/png" : "image/jpeg",
        sizeBytes: data.length,
        data,
      },
      update: {},
    });

    res.status(201).json({ ok: true, key });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/agent/zones:
 *   get:
 *     tags: [Driver App]
 *     summary: The zones a driver may ask to work, for the shift request
 */
router.get("/zones", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) { res.status(404).json({ error: "Device or driver not found" }); return; }

    // Name and code only. A driver picking a zone for a shift has no use for a
    // polygon, and shipping the geometry to a phone on a Kuwaiti data plan for
    // a dropdown is the kind of payload nobody notices until the bill.
    const zones = await prisma.deliveryZone.findMany({
      where: { tenantId: identity.driver.tenantId, isActive: true },
      select: { id: true, code: true, name: true, nameAr: true },
      orderBy: { name: "asc" },
    });
    res.json({ data: zones });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/agent/notifications:
 *   get:
 *     tags: [Driver App]
 *     summary: The driver's own notifications, newest first
 */
router.get("/notifications", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) { res.status(404).json({ error: "Device or driver not found" }); return; }
    const { driver } = identity;

    const rows = await prisma.notification.findMany({
      where: { tenantId: driver.tenantId, driverId: driver.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, title: true, message: true, type: true, severity: true,
        read: true, createdAt: true, titleAr: true, bodyAr: true,
      },
    });

    res.json({
      data: rows,
      unread: rows.filter((r) => !r.read).length,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/agent/notifications/read:
 *   post:
 *     tags: [Driver App]
 *     summary: Mark notifications read (all, or the ids given)
 */
router.post("/notifications/read", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) { res.status(404).json({ error: "Device or driver not found" }); return; }
    const { driver } = identity;
    const { ids } = req.body as { ids?: string[] };

    // The driverId in the filter is what stops an id from another driver's feed
    // being marked read by guessing it.
    const result = await prisma.notification.updateMany({
      where: {
        tenantId: driver.tenantId,
        driverId: driver.id,
        read: false,
        ...(Array.isArray(ids) && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { read: true, readAt: new Date() },
    });
    res.json({ ok: true, updated: result.count });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/points", async (req: Request, res: Response) => {
  try {
    const identity = await resolveDriverFromAgentRequest(req);
    if (!identity) { res.status(404).json({ error: "Device or driver not found" }); return; }

    const { driver } = identity;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    const [latest, snapshots, monthlyShifts, monthlyViolations] = await Promise.all([
      prisma.performanceSnapshot.findFirst({
        where: { tenantId: driver.tenantId, driverId: driver.id },
        orderBy: { snapshotDate: "desc" },
      }),
      prisma.performanceSnapshot.findMany({
        where: { tenantId: driver.tenantId, driverId: driver.id, snapshotDate: { gte: since } },
        orderBy: { snapshotDate: "asc" },
      }),
      prisma.shift.findMany({
        where: {
          tenantId: driver.tenantId,
          driverId: driver.id,
          scheduledStart: { gte: monthStart, lt: nextMonth },
        },
        select: { actualHoursMinutes: true, plannedHoursMinutes: true },
      }),
      prisma.violation.count({
        where: { tenantId: driver.tenantId, driverId: driver.id, violationTime: { gte: monthStart, lt: nextMonth } },
      }),
    ]);

    const monthlyBuckets = new Map<string, { year: number; month: number; total: number; count: number }>();
    for (const snap of snapshots) {
      const d = new Date(snap.snapshotDate);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
      const bucket = monthlyBuckets.get(key) || {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        total: 0,
        count: 0,
      };
      bucket.total += snap.compositeScore;
      bucket.count += 1;
      monthlyBuckets.set(key, bucket);
    }

    const hoursWorked = monthlyShifts.reduce(
      (sum, shift) => sum + ((shift.actualHoursMinutes ?? shift.plannedHoursMinutes ?? 0) / 60),
      0,
    );

    res.json({
      driver: { id: driver.id, name: driver.name, platform: driver.platform, phone: driver.phone },
      period: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 },
      current: latest ? {
        totalScore: latest.compositeScore,
        attendanceScore: latest.attendanceScore,
        ordersScore: latest.deliveryScore,
        hoursScore: Math.min(20, Math.round(hoursWorked / 8)),
        violationsScore: latest.platformScore,
        onTimePct: latest.attendanceScore,
        ordersCount: latest.ordersCount,
        hoursWorked,
        violationsCount: monthlyViolations,
        perPlatform: null,
        computedAt: latest.computedAt,
      } : null,
      trend: Array.from(monthlyBuckets.values()).map((bucket) => ({
        year: bucket.year,
        month: bucket.month,
        totalScore: Math.round(bucket.total / Math.max(1, bucket.count)),
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/captured-orders", async (req: Request, res: Response) => {
  try {
    const { deviceId, driverId, orders } = req.body;
    if (orders?.length > 0) {
      await prisma.capturedOrder.createMany({
        data: orders.map((o: any) => ({
          deviceId,
          driverId,
          platform: o.platform,
          notificationText: o.notificationText,
          parsedData: o.parsedData,
          capturedAt: new Date(o.capturedAt),
        })),
      });
    }
    res.json({ synced: orders?.length || 0 });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/agent/location — batched GPS ingest from the mobile outbox.
 *
 * Pipeline:
 *   1. agentLocationRateLimit  (200 / 5min per deviceId)
 *   2. resolve device → driver → tenantId
 *   3. dedup idempotencyKey within a 5-min in-process window
 *   4. validate lat/lng ranges
 *   5. locationLog.createMany
 *   6. device.update(lastLatitude/Longitude/lastSeen)
 *   7. CourierOnlineSession upsert (findFirst + update OR create — no @@unique)
 *
 * The mobile outbox sends an `idempotencyKey` per row so server replays from
 * a crash-resume don't multiply rows.
 */
router.post(
  "/location",
  agentLocationRateLimit,
  async (req: Request, res: Response) => {
    try {
      const { deviceId, driverId, locations } = req.body as {
        deviceId?: string;
        driverId?: string;
        locations?: Array<{
          latitude: number;
          longitude: number;
          accuracy: number;
          speed?: number | null;
          capturedAt: string;
          idempotencyKey?: string;
        }>;
        platformGuess?: string | null;
      };

      if (!deviceId) {
        res.status(400).json({ error: "deviceId required" });
        return;
      }
      if (!driverId) {
        res.status(400).json({ error: "driverId required" });
        return;
      }
      if (!Array.isArray(locations)) {
        res.status(400).json({ error: "locations array required" });
        return;
      }

      const device = await prisma.device.findUnique({
        where: { id: deviceId },
        include: { driver: true },
      });
      if (!device || !device.driver) {
        res.status(404).json({ error: "Device or driver not found" });
        return;
      }
      const tenantId = device.driver.tenantId;

      // Dedup idempotencyKey within 5-min window. Rows without an idempotency
      // key are always passed through (e.g. legacy clients that haven't been
      // upgraded yet — these will get filtered at the OutboxItem layer in
      // Wave 1 mobile, but we accept them server-side too).
      _gcIdempotency();
      const fresh = locations.filter((l) => {
        if (!l.idempotencyKey) return true;
        const k = `${deviceId}:${l.idempotencyKey}`;
        if (_locationIdempotencyMap.has(k)) return false;
        _locationIdempotencyMap.set(k, Date.now() + IDEMPOTENCY_TTL_MS);
        return true;
      });

      if (fresh.length > 0) {
        // Validate lat/lng ranges before any DB write. Out-of-range values are
        // a malformed payload (likely a sensor glitch or a forgery attempt).
        for (const l of fresh) {
          if (
            l.latitude < -90 ||
            l.latitude > 90 ||
            l.longitude < -180 ||
            l.longitude > 180
          ) {
            res.status(400).json({ error: "lat/lng out of range" });
            return;
          }
        }

        await prisma.locationLog.createMany({
          data: fresh.map((l) => ({
            deviceId,
            driverId,
            latitude: l.latitude,
            longitude: l.longitude,
            accuracy: l.accuracy,
            speed: l.speed ?? null,
            capturedAt: new Date(l.capturedAt),
          })),
        });

        const last = fresh[fresh.length - 1];
        await prisma.device.update({
          where: { id: deviceId },
          data: {
            lastLatitude: last.latitude,
            lastLongitude: last.longitude,
            lastSeen: new Date(),
          },
        });

        // Upsert CourierOnlineSession — there is no @@unique on the model
        // (only @@index([tenantId, isOnline])), so we cannot use prisma.upsert.
        // Pattern: findFirst the active session, then update OR create.
        const lastCapturedAt = new Date(last.capturedAt);
        const existing = await prisma.courierOnlineSession.findFirst({
          where: { tenantId, driverId, isOnline: true },
        });
        if (existing) {
          await prisma.courierOnlineSession.update({
            where: { id: existing.id },
            data: {
              lastGpsAt: lastCapturedAt,
              lastGpsLat: last.latitude,
              lastGpsLng: last.longitude,
            },
          });
        } else {
          await prisma.courierOnlineSession.create({
            data: {
              tenantId,
              driverId,
              isOnline: true,
              startTime: lastCapturedAt,
              lastGpsAt: lastCapturedAt,
              lastGpsLat: last.latitude,
              lastGpsLng: last.longitude,
            },
          });
        }

        // Live-floor + Darb 2.0 SSE fan-out. Best-effort: tenantId comes from
        // the Device→Driver join (NEVER the request body), and a bus failure
        // must not fail the already-persisted GPS write.
        const nowIso = new Date().toISOString();
        void publishEvent({
          type: "gps_point",
          tenantId,
          payload: { driverId, lat: last.latitude, lng: last.longitude, capturedAt: last.capturedAt },
          timestamp: nowIso,
        }).catch(() => {});
        if (!existing) {
          // offline → online transition
          void publishEvent({
            type: "online_session_update",
            tenantId,
            payload: { driverId, isOnline: true },
            timestamp: nowIso,
          }).catch(() => {});
        }
        const lastPublishedAt = _driverLocationLastPublish.get(driverId) ?? 0;
        if (Date.now() - lastPublishedAt >= DRIVER_LOCATION_THROTTLE_MS) {
          _driverLocationLastPublish.set(driverId, Date.now());
          void publishEvent({
            type: "driver.location",
            tenantId,
            payload: { driverId, lat: last.latitude, lng: last.longitude, at: last.capturedAt },
            timestamp: nowIso,
          }).catch(() => {});
        }
      }

      res.json({
        synced: fresh.length,
        deduped: locations.length - fresh.length,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
);

/**
 * POST /api/agent/upload-url — issue a presigned R2 PUT URL the mobile client
 * uses to upload a delivery photo directly to private storage.
 *
 * Key format: `{tenantId}/{orderId}/{deviceId}/{epoch_ms}.jpg`. The tenant
 * prefix is the primary cross-tenant isolation boundary — even if a presigned
 * URL leaks, only paths within the issuing tenant can be written.
 *
 * The mobile flow:
 *   1. POST /upload-url  → { url, key }
 *   2. PUT  <url>        (the photo bytes, directly to R2)
 *   3. POST /delivery-photo { ..., key }  → backend records the OrderEvent
 */
router.post(
  "/upload-url",
  agentUploadRateLimit,
  async (req: Request, res: Response) => {
    try {
      const { deviceId, orderId, contentType = "image/jpeg" } = req.body as {
        deviceId?: string;
        orderId?: string;
        contentType?: string;
      };
      if (!deviceId) {
        res.status(400).json({ error: "deviceId required" });
        return;
      }
      if (!orderId) {
        res.status(400).json({ error: "orderId required" });
        return;
      }
      if (contentType !== "image/jpeg" && contentType !== "image/png") {
        res
          .status(400)
          .json({ error: "contentType must be image/jpeg or image/png" });
        return;
      }

      const device = await prisma.device.findUnique({
        where: { id: deviceId },
        include: { driver: true },
      });
      if (!device || !device.driver) {
        res.status(404).json({ error: "Device or driver not found" });
        return;
      }
      const tenantId = device.driver.tenantId;

      const key = `${tenantId}/${orderId}/${deviceId}/${Date.now()}.jpg`;

      /**
       * No object storage is not a dead end any more (2026-08-01).
       *
       * This used to presign unconditionally, so an environment without R2
       * credentials threw here. That was survivable while the PIN existed; once
       * a photo became the only way to complete a delivery it meant no driver
       * could finish a job at all. Answering with mode INLINE tells the app to
       * send the bytes to /photo-inline instead, and the key it will be stored
       * under is the same key R2 would have used.
       */
      if (!isR2Configured()) {
        res.json({ mode: "INLINE", key, url: null });
        return;
      }

      const url = await presignPutUrl(key, contentType, 300);
      res.json({ mode: "R2", url, key, expiresInSec: 300 });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
);

/**
 * POST /api/agent/delivery-photo — record metadata after the mobile client has
 * finished a PUT to R2 via the presigned URL issued by /upload-url.
 *
 * Writes an OrderEvent (action="DELIVERY_PHOTO", metadata={photoKey, lat, lng})
 * so the operations console can render proof-of-delivery on the order flow
 * timeline (Phase 4 — Keeta Parity).
 *
 * Defense-in-depth: even though the presigned URL was issued for the caller's
 * tenant prefix, we re-validate that the `key` the mobile reports back starts
 * with `${tenantId}/` — closes the cross-tenant key-forgery hole (T-05-02-05).
 */
router.post("/delivery-photo", async (req: Request, res: Response) => {
  try {
    const { deviceId, orderId, key, capturedAt, latitude, longitude, phase } =
      req.body as {
        deviceId?: string;
        orderId?: string;
        key?: string;
        capturedAt?: string;
        latitude?: number;
        longitude?: number;
        /**
         * Which moment the photo proves (client request, 2026-08-01). Drivers
         * now photograph their arrival at the restaurant as well as the
         * handover, and an event log that cannot tell the two apart is a log
         * nobody can answer a dispute from. Absent reads as the handover, which
         * is what every photo before this was.
         */
        phase?: string;
      };
    if (!deviceId || !orderId || !key || !capturedAt) {
      res
        .status(400)
        .json({ error: "deviceId, orderId, key, capturedAt required" });
      return;
    }
    if (typeof latitude !== "number" || latitude < -90 || latitude > 90) {
      res.status(400).json({ error: "latitude out of range" });
      return;
    }
    if (typeof longitude !== "number" || longitude < -180 || longitude > 180) {
      res.status(400).json({ error: "longitude out of range" });
      return;
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { driver: true },
    });
    if (!device || !device.driver) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const tenantId = device.driver.tenantId;

    // Cross-tenant key forgery guard (T-05-02-05). The presigned PUT URL was
    // already tenant-scoped at issue time, but a malicious client could fake
    // the key it reports back. Reject any key that doesn't start with the
    // caller's tenantId prefix.
    if (!String(key).startsWith(tenantId + "/")) {
      res.status(403).json({ error: "key tenant mismatch" });
      return;
    }

    await prisma.orderEvent.create({
      data: {
        tenantId,
        orderId,
        action: phase === "ARRIVED_AT_PICKUP" ? "ARRIVAL_PHOTO" : "DELIVERY_PHOTO",
        description:
          phase === "ARRIVED_AT_PICKUP"
            ? "Courier arrival photo captured at the merchant"
            : "Courier delivery photo captured",
        operator: device.driver.name ?? null,
        operatorId: device.driver.id,
        timestamp: new Date(capturedAt),
        metadata: {
          photoKey: key,
          latitude,
          longitude,
          ...(phase ? { phase } : {}),
        },
      },
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/app-usage", async (req: Request, res: Response) => {
  try {
    const { deviceId, driverId, logs } = req.body;
    if (logs?.length > 0) {
      await prisma.appUsageLog.createMany({
        data: logs.map((l: any) => ({
          deviceId,
          driverId,
          appPackage: l.appPackage,
          eventType: l.eventType,
          durationSeconds: l.durationSeconds,
          capturedAt: new Date(l.capturedAt),
        })),
      });
    }
    res.json({ synced: logs?.length || 0 });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/agent/selfie — unified selfie-gated shift transition for the
 * Android agent. Identifies the driver by deviceId and either:
 *   - ACTION_CLOCK_IN  → locates today's BOOKED shift (or creates one at now),
 *                        sets selfieUrl/actualStart, returns shiftId
 *   - ACTION_CLOCK_OUT → finalizes the current shift, returns shiftId
 *
 * Multipart form fields:
 *   selfie (file, required), deviceId, action, shiftId?, latitude?, longitude?
 */
router.post("/selfie", upload.single("selfie"), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No selfie file uploaded" }); return; }

    const { deviceId, action, shiftId: providedShiftId } = req.body as {
      deviceId?: string;
      action?: string;
      shiftId?: string;
    };
    const latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
    const longitude = req.body.longitude ? parseFloat(req.body.longitude) : null;

    if (!deviceId || !action) {
      res.status(400).json({ error: "deviceId and action are required" });
      return;
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { driver: true },
    });
    if (!device?.driver) {
      res.status(404).json({ error: "Device or driver not found" });
      return;
    }
    const driver = device.driver;
    const tenantId = driver.tenantId;
    const selfieUrl = `/uploads/${req.file.filename}`;
    const now = new Date();

    if (action === "ACTION_CLOCK_IN") {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      // Locate a scheduled shift for today, else create one on the fly.
      let shift = await prisma.shift.findFirst({
        where: {
          tenantId,
          driverId: driver.id,
          date: { gte: todayStart, lt: tomorrow },
          status: { in: ["BOOKED", "IN_PROGRESS"] },
        },
        orderBy: { scheduledStart: "asc" },
      });

      if (!shift) {
        shift = await prisma.shift.create({
          data: {
            tenantId,
            driverId: driver.id,
            platform: driver.platform,
            date: todayStart,
            scheduledStart: now,
            scheduledEnd: new Date(now.getTime() + 8 * 60 * 60 * 1000),
            status: "BOOKED",
            zone: driver.zone,
          },
        });
      }

      await prisma.shift.update({
        where: { id: shift.id },
        data: {
          actualStart: now,
          status: "IN_PROGRESS",
          selfieUrl,
          selfieLocation: latitude != null && longitude != null ? { latitude, longitude } : undefined,
          clockInMethod: "selfie",
        },
      });

      // Attendance row + late detection
      const lateMs = now.getTime() - new Date(shift.scheduledStart).getTime();
      const lateMinutes = Math.max(0, Math.floor(lateMs / 60000));
      const isLate = lateMinutes >= 1;

      const existing = await prisma.attendanceRecord.findUnique({
        where: { tenantId_driverId_date: { tenantId, driverId: driver.id, date: todayStart } },
      });
      const variance =
        existing?.platformClockIn
          ? Math.abs(Math.floor((now.getTime() - new Date(existing.platformClockIn).getTime()) / 60000))
          : null;

      await prisma.attendanceRecord.upsert({
        where: {
          tenantId_driverId_date: { tenantId, driverId: driver.id, date: todayStart },
        },
        create: {
          tenantId,
          driverId: driver.id,
          shiftId: shift.id,
          date: todayStart,
          status: isLate ? "LATE" : "PRESENT",
          lateMinutes: isLate ? lateMinutes : 0,
          source: "DARB_APP",
          darbClockIn: now,
        },
        update: {
          shiftId: shift.id,
          darbClockIn: now,
          varianceMinutes: variance,
          // Late status is driven by platform when available; fall back to Darb time otherwise
          ...(existing?.platformClockIn
            ? {}
            : { status: isLate ? "LATE" : "PRESENT", lateMinutes: isLate ? lateMinutes : 0 }),
        },
      });

      res.json({ shiftId: shift.id, selfieUrl, isLate, lateMinutes });
      return;
    }

    if (action === "ACTION_CLOCK_OUT") {
      let shift = providedShiftId
        ? await prisma.shift.findFirst({
            where: { id: providedShiftId, tenantId, driverId: driver.id },
          })
        : null;

      if (!shift) {
        shift = await prisma.shift.findFirst({
          where: { tenantId, driverId: driver.id, status: "IN_PROGRESS" },
          orderBy: { actualStart: "desc" },
        });
      }
      if (!shift) { res.status(404).json({ error: "Shift not found" }); return; }

      const actualStart = shift.actualStart ?? shift.scheduledStart;
      const actualMinutes = Math.max(0, Math.floor((now.getTime() - new Date(actualStart).getTime()) / 60000));

      await prisma.shift.update({
        where: { id: shift.id },
        data: {
          actualEnd: now,
          status: "COMPLETED",
          clockOutMethod: "selfie",
          actualHoursMinutes: actualMinutes,
        },
      });

      // Mirror Darb clock-out to AttendanceRecord
      const dayStart = new Date(shift.date.getFullYear(), shift.date.getMonth(), shift.date.getDate());
      await prisma.attendanceRecord.updateMany({
        where: { tenantId, driverId: driver.id, date: dayStart },
        data: { darbClockOut: now },
      });

      res.json({ shiftId: shift.id, selfieUrl, actualMinutes });
      return;
    }

    res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/commands", async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.query;
    const commands = await prisma.deviceCommand.findMany({
      where: { deviceId: deviceId as string, status: "PENDING" },
      orderBy: { issuedAt: "asc" },
    });
    res.json(commands);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/commands/:id/ack", async (req: Request, res: Response) => {
  try {
    await prisma.deviceCommand.update({
      where: { id: req.params.id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
    });
    res.json({ message: "Command acknowledged" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Driver-submitted tickets ─────────────────────────────────────────────
// Identity is resolved via deviceId (mirrors the selfie route). No bearer
// auth — the agent_token in SecureStore is a stub the server doesn't validate.

const VALID_TICKET_CATEGORIES = new Set([
  "VEHICLE_REPAIR",
  "EQUIPMENT_REQUEST",
  "LEAVE_REQUEST",
  "SALARY_ISSUE",
  "TRANSFER_REQUEST",
  "COMPLAINT",
  "ACCIDENT_REPORT",
  // Client request, 2026-08-01: the driver app asks for a shift here rather
  // than through a second inbox. There is no pool of open shifts to claim (a
  // Shift row always belongs to a driver), so the ask is a request ops approve
  // by creating the shift, and this desk is already the one they watch.
  "SHIFT_REQUEST",
  "OTHER",
]);
const VALID_TICKET_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

const driverTicketSelect = {
  id: true,
  ticketNumber: true,
  category: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  photos: true,
  resolution: true,
  resolvedAt: true,
  createdAt: true,
  slaDeadline: true,
} as const;

async function resolveDriverFromDeviceId(deviceId: string | undefined) {
  if (!deviceId) return null;
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { driver: true },
  });
  if (!device?.driver) return null;
  return device.driver;
}

router.post("/tickets", upload.array("photos", 5), async (req: Request, res: Response) => {
  try {
    const deviceId = (req.body?.deviceId as string | undefined)?.trim();
    const driver = await resolveDriverFromDeviceId(deviceId);
    if (!driver) { res.status(404).json({ error: "Device or driver not found" }); return; }

    const { category, title, description } = req.body as {
      category?: string;
      title?: string;
      description?: string;
    };
    let priority = (req.body?.priority as string | undefined) || "MEDIUM";

    if (!category || !VALID_TICKET_CATEGORIES.has(category)) {
      res.status(400).json({ error: "Invalid or missing category" }); return;
    }
    if (!title || !title.trim()) {
      res.status(400).json({ error: "Title is required" }); return;
    }
    if (!description || !description.trim()) {
      res.status(400).json({ error: "Description is required" }); return;
    }
    if (!VALID_TICKET_PRIORITIES.has(priority)) priority = "MEDIUM";
    if (category === "ACCIDENT_REPORT") priority = "HIGH";

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const photos = files.map((f) => `/uploads/${f.filename}`);

    const ticketNumber = await nextTicketNumber(driver.tenantId);
    const slaDeadline = ticketSlaDeadline(priority);

    const ticket = await prisma.ticket.create({
      data: {
        tenantId: driver.tenantId,
        ticketNumber,
        category: category as any,
        priority: priority as any,
        title: title.trim(),
        description: description.trim(),
        submitterType: "DRIVER",
        submitterDriverId: driver.id,
        driverId: driver.id,
        platform: driver.platform,
        status: "OPEN",
        photos: photos.length ? photos : undefined,
        slaDeadline,
      },
      select: driverTicketSelect,
    });

    createTicketSubmittedNotification({
      tenantId: driver.tenantId,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        category: ticket.category,
      },
      driverName: driver.name,
    }).catch((e) => logger.error({ err: e, ticketId: ticket.id }, "ticket notification failed"));

    res.status(201).json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/tickets", async (req: Request, res: Response) => {
  try {
    const deviceId = (req.query.deviceId as string | undefined)?.trim();
    const driver = await resolveDriverFromDeviceId(deviceId);
    if (!driver) { res.status(404).json({ error: "Device or driver not found" }); return; }

    const tickets = await prisma.ticket.findMany({
      where: { tenantId: driver.tenantId, submitterDriverId: driver.id },
      orderBy: { createdAt: "desc" },
      select: driverTicketSelect,
    });
    res.json(tickets);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const deviceId = (req.query.deviceId as string | undefined)?.trim();
    const driver = await resolveDriverFromDeviceId(deviceId);
    if (!driver) { res.status(404).json({ error: "Device or driver not found" }); return; }

    const ticket = await prisma.ticket.findFirst({
      where: {
        id: req.params.id,
        tenantId: driver.tenantId,
        submitterDriverId: driver.id,
      },
      select: driverTicketSelect,
    });
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
