import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { upload } from "../utils/upload";
import { nextTicketNumber } from "../utils/ticketNumber";
import { ticketSlaDeadline } from "../utils/ticketSla";
import { createTicketSubmittedNotification } from "../services/notificationService";
import { logger } from "../config/logger";
import { presignPutUrl } from "../services/r2Service";
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
function _gcIdempotency() {
  const now = Date.now();
  for (const [k, exp] of _locationIdempotencyMap) {
    if (exp <= now) _locationIdempotencyMap.delete(k);
  }
}

// Agent endpoints don't use standard auth - they use device-based auth
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { enrollmentCode, imei, model, osVersion } = req.body;
    // Find driver by enrollment code (using platformDriverId as enrollment code for now)
    const driver = await prisma.driver.findFirst({
      where: { platformDriverId: enrollmentCode },
      include: { company: true },
    });
    if (!driver) { res.status(404).json({ error: "Invalid enrollment code" }); return; }

    const device = await prisma.device.upsert({
      where: { imei },
      create: {
        imei,
        model,
        osVersion,
        driverId: driver.id,
        tenantId: driver.tenantId,
        status: "ACTIVE",
        isOnline: true,
        lastSeen: new Date(),
      },
      update: {
        model,
        osVersion,
        driverId: driver.id,
        status: "ACTIVE",
        isOnline: true,
        lastSeen: new Date(),
      },
    });

    res.status(201).json({
      deviceId: device.id,
      driver: { id: driver.id, name: driver.name, platform: driver.platform },
      company: { id: driver.company.id, name: driver.company.name },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

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
      const url = await presignPutUrl(key, contentType, 300);
      res.json({ url, key, expiresInSec: 300 });
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
    const { deviceId, orderId, key, capturedAt, latitude, longitude } =
      req.body as {
        deviceId?: string;
        orderId?: string;
        key?: string;
        capturedAt?: string;
        latitude?: number;
        longitude?: number;
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
        action: "DELIVERY_PHOTO",
        description: "Courier delivery photo captured",
        operator: device.driver.name ?? null,
        operatorId: device.driver.id,
        timestamp: new Date(capturedAt),
        metadata: {
          photoKey: key,
          latitude,
          longitude,
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
      const targetId = providedShiftId;
      if (!targetId) { res.status(400).json({ error: "shiftId required for clock-out" }); return; }

      const shift = await prisma.shift.findFirst({
        where: { id: targetId, tenantId, driverId: driver.id },
      });
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
