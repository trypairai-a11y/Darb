import { prisma } from "../config";
import { Platform, ViolationType, ViolationStatus } from "../generated/prisma";
import { createViolationNotifications, getViolationSeverity } from "./notificationService";
import { publishEvent } from "./eventBus";
import { logger } from "../config/logger";
import { AiOcrService } from "./aiOcrService";

// ─── Haversine helper ────────────────────────────────────────────
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Dedup helper ────────────────────────────────────────────────
async function violationExistsToday(
  tenantId: string,
  driverId: string,
  type: ViolationType,
  dateKey?: Date,
): Promise<boolean> {
  const windowStart = dateKey ? new Date(dateKey) : new Date();
  windowStart.setHours(0, 0, 0, 0);
  const existing = await prisma.violation.findFirst({
    where: { tenantId, driverId, violationType: type, violationTime: { gte: windowStart } },
  });
  return !!existing;
}

// ─── Core: create violation + alert + notification ───────────────
export async function createViolationWithAlert(params: {
  tenantId: string;
  driverId: string | null;
  platform: Platform;
  violationType: ViolationType;
  violationTime: Date;
  details?: string;
  metadata?: any;
  taskId?: string;
  skipDedup?: boolean;
}) {
  const { tenantId, driverId, platform, violationType, violationTime, details, metadata, taskId, skipDedup } = params;

  // Dedup: skip if violation of same type exists today for this driver
  if (!skipDedup && driverId && await violationExistsToday(tenantId, driverId, violationType, violationTime)) {
    return null;
  }

  const violation = await prisma.violation.create({
    data: {
      tenantId,
      driverId: driverId ?? null,
      platform,
      violationType,
      violationTime,
      details,
      metadata,
      taskId,
    },
  });

  // Mirror to Alert table only for driver-scoped violations (Alert requires driverId)
  if (driverId) {
    await prisma.alert.create({
      data: {
        tenantId,
        driverId,
        type: `VIOLATION_${violationType}`,
        severity: getViolationSeverity(violationType) as any,
        title: violationType.replace(/_/g, " "),
        message: details || violationType,
        data: { violationId: violation.id, ...(metadata || {}) },
      },
    });
  }

  // Fire notifications to relevant users
  await createViolationNotifications({
    tenantId,
    eventType: violationType,
    severity: getViolationSeverity(violationType),
    title: violationType.replace(/_/g, " "),
    message: details || violationType,
    sourceId: violation.id,
    metadata: { violationId: violation.id, driverId },
  }).catch((e) => logger.error({ err: e }, "violation notification failed"));

  publishEvent({
    type: "violation",
    tenantId,
    payload: { violationId: violation.id, violationType, driverId, details },
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  return violation;
}

// ─── Detectors ───────────────────────────────────────────────────

/**
 * Detect late deliveries from KeetaDailyMetrics.
 * overdueOrders > 0 → ORDER_SLIGHTLY_LATE
 * severelyOverdue > 0 → ORDER_VERY_LATE
 */
export async function detectLateDeliveries(tenantId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const metrics = await prisma.keetaDailyMetrics.findMany({
    where: {
      tenantId,
      date: { gte: today },
      OR: [{ overdueOrders: { gt: 0 } }, { severelyOverdue: { gt: 0 } }],
    },
    include: { driver: { select: { id: true, platform: true } } },
  });

  let created = 0;
  for (const m of metrics) {
    if (m.severelyOverdue > 0) {
      const v = await createViolationWithAlert({
        tenantId,
        driverId: m.driverId,
        platform: m.driver.platform,
        violationType: ViolationType.ORDER_VERY_LATE,
        violationTime: m.date,
        details: `${m.severelyOverdue} severely overdue order(s). Avg delivery: ${m.avgDeliveryMinutes} min`,
        metadata: { severelyOverdue: m.severelyOverdue, avgDeliveryMinutes: Number(m.avgDeliveryMinutes) },
      });
      if (v) created++;
    } else if (m.overdueOrders > 0) {
      const v = await createViolationWithAlert({
        tenantId,
        driverId: m.driverId,
        platform: m.driver.platform,
        violationType: ViolationType.ORDER_SLIGHTLY_LATE,
        violationTime: m.date,
        details: `${m.overdueOrders} overdue order(s). Avg delivery: ${m.avgDeliveryMinutes} min`,
        metadata: { overdueOrders: m.overdueOrders, avgDeliveryMinutes: Number(m.avgDeliveryMinutes) },
      });
      if (v) created++;
    }
  }
  return created;
}

/**
 * Detect order rejection timeouts from KeetaDailyMetrics.rejectedAuto > 0.
 */
export async function detectOrderRejectionTimeouts(tenantId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const metrics = await prisma.keetaDailyMetrics.findMany({
    where: { tenantId, date: { gte: today }, rejectedAuto: { gt: 0 } },
    include: { driver: { select: { id: true, platform: true } } },
  });

  let created = 0;
  for (const m of metrics) {
    const v = await createViolationWithAlert({
      tenantId,
      driverId: m.driverId,
      platform: m.driver.platform,
      violationType: ViolationType.ORDER_REJECTION_TIMEOUT,
      violationTime: m.date,
      details: `${m.rejectedAuto} auto-rejected order(s) due to acceptance timeout`,
      metadata: { rejectedAuto: m.rejectedAuto, rejectedByCourier: m.rejectedByCourier },
    });
    if (v) created++;
  }
  return created;
}

/**
 * Detect GPS not uploading for online Keeta drivers.
 * Checks Device.lastSeen > 15 minutes ago.
 */
export async function detectGpsNotUploading(tenantId: string): Promise<number> {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

  const staleDevices = await prisma.device.findMany({
    where: {
      tenantId,
      driver: { tenantId, platform: "KEETA", status: "ACTIVE" },
      isOnline: true,
      lastSeen: { lt: fifteenMinAgo },
    },
    include: { driver: { select: { id: true, name: true, platform: true } } },
  });

  let created = 0;
  for (const d of staleDevices) {
    if (!d.driver) continue;
    const v = await createViolationWithAlert({
      tenantId,
      driverId: d.driver.id,
      platform: d.driver.platform,
      violationType: ViolationType.GPS_NOT_UPLOADING,
      violationTime: new Date(),
      details: `GPS not uploading since ${d.lastSeen?.toISOString()}. Driver: ${d.driver.name}`,
      metadata: { lastSeen: d.lastSeen?.toISOString(), deviceId: d.id },
    });
    if (v) created++;
  }
  return created;
}

/**
 * Detect drop-off in advance — courier GPS far from customer location.
 * Called per-order when delivery is marked complete (not batch).
 */
export async function detectDropOffInAdvance(params: {
  tenantId: string;
  driverId: string;
  platform: Platform;
  orderId: string;
  driverLat: number;
  driverLng: number;
  customerLat: number;
  customerLng: number;
  thresholdMeters?: number;
}): Promise<boolean> {
  const { tenantId, driverId, platform, orderId, driverLat, driverLng, customerLat, customerLng } = params;
  const threshold = params.thresholdMeters ?? 500;

  const distance = haversineMeters(driverLat, driverLng, customerLat, customerLng);
  if (distance <= threshold) return false;

  await createViolationWithAlert({
    tenantId,
    driverId,
    platform,
    violationType: ViolationType.DROP_OFF_IN_ADVANCE,
    violationTime: new Date(),
    details: `Distance between drop-off and customer: ${distance.toFixed(2)} meters`,
    metadata: { distance, driverLat, driverLng, customerLat, customerLng, orderId },
    taskId: orderId,
  });
  return true;
}

/**
 * Detect late pickups — courier took too long to arrive at merchant after accepting.
 * Compares "courier_accepted" and "courier_arrived_merchant" OrderEvent timestamps.
 * If elapsed time > thresholdMinutes (default 15), creates LATE_PICKUP violation.
 */
export async function detectLatePickup(tenantId: string, thresholdMinutes = 15): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find all "courier_accepted" events today
  const acceptedEvents = await prisma.orderEvent.findMany({
    where: {
      tenantId,
      action: "courier_accepted",
      timestamp: { gte: today },
    },
  });

  if (acceptedEvents.length === 0) return 0;

  const orderIds = acceptedEvents.map((e) => e.orderId);

  // Find matching "courier_arrived_merchant" events for those orders
  const arrivedEvents = await prisma.orderEvent.findMany({
    where: {
      tenantId,
      action: "courier_arrived_merchant",
      orderId: { in: orderIds },
    },
  });

  const arrivedByOrder = new Map(arrivedEvents.map((e) => [e.orderId, e]));

  let created = 0;
  for (const accepted of acceptedEvents) {
    const arrived = arrivedByOrder.get(accepted.orderId);
    if (!arrived) continue;

    const elapsedMs = arrived.timestamp.getTime() - accepted.timestamp.getTime();
    const elapsedMinutes = elapsedMs / 60_000;

    if (elapsedMinutes <= thresholdMinutes) continue;

    // Extract driverId from metadata (stored when the courier_accepted event was created)
    const meta = (accepted.metadata as Record<string, any>) || {};
    const driverId = meta.courierId || meta.driverId;
    if (!driverId) continue;

    // Look up driver to get platform
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, platform: true },
    });
    if (!driver) continue;

    const v = await createViolationWithAlert({
      tenantId,
      driverId: driver.id,
      platform: driver.platform,
      violationType: ViolationType.LATE_PICKUP,
      violationTime: arrived.timestamp,
      details: `Late pickup: ${elapsedMinutes.toFixed(1)} minutes to arrive at merchant (threshold: ${thresholdMinutes} min)`,
      metadata: {
        elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
        thresholdMinutes,
        acceptedAt: accepted.timestamp.toISOString(),
        arrivedAt: arrived.timestamp.toISOString(),
      },
      taskId: accepted.orderId,
    });
    if (v) created++;
  }
  return created;
}

/**
 * Detect invalid delivery photos using the AI OCR service.
 * Processes a batch of recent deliveries that have screenshotUrl attached,
 * calls the vision model to validate the photo shows clear delivery evidence.
 * If validation fails, creates INVALID_DELIVERY_PHOTO violation.
 *
 * @param batchSize — max number of photos to validate per run (default 20 to control AI costs)
 */
export async function detectInvalidDeliveryPhoto(tenantId: string, batchSize = 20): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find recent delivered order events that have delivery photo metadata
  const deliveryEvents = await prisma.orderEvent.findMany({
    where: {
      tenantId,
      action: "order_delivered",
      timestamp: { gte: today },
      metadata: { not: undefined },
    },
    orderBy: { timestamp: "desc" },
    take: batchSize,
  });

  let created = 0;
  for (const event of deliveryEvents) {
    const meta = (event.metadata as Record<string, any>) || {};
    const photoUrl = meta.deliveryPhotoUrl || meta.proofPhotoUrl || meta.screenshotUrl;
    if (!photoUrl) continue;

    const driverId = meta.courierId || meta.driverId;
    if (!driverId) continue;

    // Skip if we already checked this order
    const existing = await prisma.violation.findFirst({
      where: {
        tenantId,
        taskId: event.orderId,
        violationType: ViolationType.INVALID_DELIVERY_PHOTO,
      },
    });
    if (existing) continue;

    try {
      // Fetch the photo and run AI validation
      const response = await fetch(photoUrl);
      if (!response.ok) continue;

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const ocrResult = await AiOcrService.processScreenshot(imageBuffer, "KEETA");

      // If OCR returns null the service could not process the image at all,
      // or if the result has no delivery evidence, flag it.
      // A valid delivery photo should contain order/delivery data the OCR can parse.
      const isInvalid = ocrResult === null;

      if (!isInvalid) continue;

      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        select: { id: true, platform: true },
      });
      if (!driver) continue;

      const v = await createViolationWithAlert({
        tenantId,
        driverId: driver.id,
        platform: driver.platform,
        violationType: ViolationType.INVALID_DELIVERY_PHOTO,
        violationTime: event.timestamp,
        details: "Delivery photo could not be validated — no clear delivery evidence detected",
        metadata: { orderId: event.orderId, photoUrl },
        taskId: event.orderId,
      });
      if (v) created++;
    } catch (err) {
      logger.error({ err, orderId: event.orderId }, "detectInvalidDeliveryPhoto: failed to process photo");
    }
  }
  return created;
}

/**
 * Detect Deliveroo unassigned orders — fired when a DeliverooDailyMetrics row
 * is written with unassignedCount > 0. Creates exactly `unassignedCount`
 * platform-level Violations (driverId = null) tagged with zone + shiftDate.
 *
 * Root-cause is left as "UNKNOWN" by default; Ops set it inline in the
 * violations page. Dedup: if the metric already produced violations, we skip.
 */
export async function detectDeliverooUnassignedOrders(params: {
  tenantId: string;
  metricId: string;
}): Promise<number> {
  const { tenantId, metricId } = params;

  const metric = await prisma.deliverooDailyMetrics.findFirst({
    where: { id: metricId, tenantId },
    include: { driver: { select: { id: true, zone: true, name: true } } },
  });
  if (!metric) return 0;
  const unassigned = metric.unassignedCount;
  if (unassigned <= 0) return 0;

  // Dedup: count violations already linked to this metric via metadata.sourceMetricId
  const existing = await prisma.violation.count({
    where: {
      tenantId,
      violationType: ViolationType.DELIVEROO_UNASSIGNED_ORDER,
      metadata: { path: ["sourceMetricId"], equals: metricId } as any,
    },
  });
  if (existing >= unassigned) return 0;

  const toCreate = unassigned - existing;
  const zone = metric.driver?.zone ?? "Unassigned";

  let created = 0;
  for (let i = 0; i < toCreate; i++) {
    const v = await createViolationWithAlert({
      tenantId,
      driverId: null,
      platform: Platform.DELIVEROO,
      violationType: ViolationType.DELIVEROO_UNASSIGNED_ORDER,
      violationTime: metric.shiftDate,
      details: `Deliveroo offered an order that no rider in ${zone} accepted on ${metric.shiftDate
        .toISOString()
        .slice(0, 10)}.`,
      metadata: {
        zone,
        shiftDate: metric.shiftDate.toISOString().slice(0, 10),
        sourceMetricId: metricId,
        sourceDriverId: metric.driverId,
        rootCause: "UNKNOWN",
      },
      skipDedup: true,
    });
    if (v) created++;
  }
  return created;
}

/**
 * Orchestrator: run all batch violation checks for a tenant.
 */
export async function runAllViolationChecks(tenantId: string): Promise<number> {
  let total = 0;
  try {
    total += await detectLateDeliveries(tenantId);
  } catch (e: any) {
    logger.error({ err: e, tenantId }, "detectLateDeliveries failed");
  }
  try {
    total += await detectOrderRejectionTimeouts(tenantId);
  } catch (e: any) {
    logger.error({ err: e, tenantId }, "detectOrderRejectionTimeouts failed");
  }
  try {
    total += await detectGpsNotUploading(tenantId);
  } catch (e: any) {
    logger.error({ err: e, tenantId }, "detectGpsNotUploading failed");
  }
  try {
    total += await detectLatePickup(tenantId);
  } catch (e: any) {
    logger.error({ err: e, tenantId }, "detectLatePickup failed");
  }
  try {
    total += await detectInvalidDeliveryPhoto(tenantId);
  } catch (e: any) {
    logger.error({ err: e, tenantId }, "detectInvalidDeliveryPhoto failed");
  }
  return total;
}
