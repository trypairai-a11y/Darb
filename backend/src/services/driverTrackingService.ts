/**
 * Revision 20 — the Ops tab's Driver tracking subtab.
 *
 * Client note, 2026-09-15: "here the ops team should be able to track driver
 * performance and be able to activate/deactivate/freeze also should be able to
 * send the driver for further training".
 *
 * So this is one table with a row per driver, the numbers that say whether
 * they are carrying their weight, and four verbs. The numbers are the ones
 * already computed elsewhere for the fleet scorecard — on-time, acceptance,
 * rating — because a driver who reads 82% here and 71% on the delivery
 * company's own scorecard is a driver nobody can have a conversation about.
 */
import { prisma } from "../config";
import { createTrainingSession } from "./training/driverTrainingService";

export interface DriverTrackingRow {
  id: string;
  name: string;
  driverCode: string | null;
  phone: string | null;
  status: string;
  isFrozen: boolean;
  inTraining: boolean;
  complianceFreezeReason: string | null;
  vehicleType: string | null;
  fleetPartnerId: string | null;
  fleetPartnerName: string | null;
  assignedZoneId: string | null;
  assignedZoneName: string | null;
  availability: string;
  lastSeenAt: string | null;
  delivered: number;
  failed: number;
  onTimeRate: number | null;
  acceptanceRate: number | null;
  rating: number | null;
  /**
   * Revision 21 (#1) — "must add a column for violations and rejections".
   * Rejections are offers the driver declined or let expire in the window: a
   * driver who never presses Decline and simply waits 15 seconds has refused
   * the order just the same, and counting only the button would let them hide.
   * `declined` is kept beside it so the two can be told apart on the row.
   */
  rejections: number;
  declined: number;
  /**
   * Issues Darb's nightly sweep raised about this driver in the window (late
   * login, no orders, rating drop, low acceptance, expiring paper), plus how
   * many of them are still open. This is what a "violation" is on Darb 2.0:
   * the legacy Violation table belongs to the deleted aggregator modules.
   */
  violations: number;
  violationsOpen: number;
  /** Required documents currently valid, over the number required. */
  docsValid: number;
  docsRequired: number;
  /** An open training window, when there is one. */
  trainingSessionId: string | null;
  trainingEndsAt: string | null;
  /**
   * Revision 24 #16 — TERMINATED with the equipment clearance not yet ticked.
   * Always false for any other status.
   */
  terminationPending: boolean;
}

/**
 * The tracking table.
 *
 * Every figure is a grouped query over the window, never a per-driver read:
 * a fleet of 300 would otherwise be 1,200 round trips to draw one screen.
 */
export async function driverTracking(params: {
  tenantId: string;
  days?: number;
  fleetPartnerId?: string;
  zoneId?: string;
  status?: string;
  q?: string;
}): Promise<{ rows: DriverTrackingRow[]; windowDays: number }> {
  const { tenantId } = params;
  const days = params.days && params.days > 0 ? params.days : 30;
  const from = new Date(Date.now() - days * 86_400_000);

  const drivers = await prisma.driver.findMany({
    where: {
      tenantId,
      status: { not: "TERMINATED" },
      ...(params.fleetPartnerId ? { fleetPartnerId: params.fleetPartnerId } : {}),
      ...(params.zoneId ? { assignedZoneId: params.zoneId } : {}),
      ...(params.status ? { status: params.status as never } : {}),
      ...(params.q?.trim()
        ? {
            OR: [
              { name: { contains: params.q.trim(), mode: "insensitive" as const } },
              { driverCode: { contains: params.q.trim(), mode: "insensitive" as const } },
              { phone: { contains: params.q.trim() } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      driverCode: true,
      phone: true,
      status: true,
      isFrozen: true,
      inTraining: true,
      complianceFreezeReason: true,
      terminationClearedAt: true,
      vehicleType: true,
      fleetPartnerId: true,
      fleetPartner: { select: { id: true, name: true } },
      assignedZoneId: true,
      assignedZone: { select: { id: true, name: true } },
      // The document read model, which is what the roster's "3/4" already uses.
      civilIdStatus: true,
      drivingLicenseStatus: true,
      workPermitStatus: true,
      healthCertStatus: true,
      vehicleRegStatus: true,
      policeClearanceStatus: true,
      passportStatus: true,
      driverSelfieStatus: true,
    },
    orderBy: { name: "asc" },
    take: 1000,
  });
  if (!drivers.length) return { rows: [], windowDays: days };

  const ids = drivers.map((d) => d.id);

  const [delivered, failed, onTimeRows, offers, ratings, sessions, training, issues] = await Promise.all([
    prisma.deliveryOrder.groupBy({
      by: ["driverId"],
      where: {
        tenantId,
        driverId: { in: ids },
        status: "DELIVERED",
        deliveredAt: { gte: from },
        isTraining: false,
      },
      _count: { _all: true },
    }),
    prisma.deliveryOrder.groupBy({
      by: ["driverId"],
      where: {
        tenantId,
        driverId: { in: ids },
        status: { in: ["FAILED", "RETURNED"] },
        assignedAt: { gte: from },
        isTraining: false,
      },
      _count: { _all: true },
    }),
    // On time is a column-to-column comparison Prisma cannot express in a
    // filter, so the pair is fetched and compared here. Two columns over one
    // month is a cheap read; the alternative is raw SQL for one percentage.
    prisma.deliveryOrder.findMany({
      where: {
        tenantId,
        driverId: { in: ids },
        status: "DELIVERED",
        deliveredAt: { gte: from },
        slaDeadline: { not: null },
        isTraining: false,
      },
      select: { driverId: true, deliveredAt: true, slaDeadline: true },
    }),
    prisma.dispatchOffer.groupBy({
      by: ["driverId", "status"],
      where: {
        tenantId,
        driverId: { in: ids },
        offeredAt: { gte: from },
        status: { in: ["ACCEPTED", "DECLINED", "EXPIRED"] },
      },
      _count: { _all: true },
    }),
    prisma.orderRating.groupBy({
      by: ["driverId"],
      where: { tenantId, driverId: { in: ids }, createdAt: { gte: from } },
      _avg: { stars: true },
    }),
    prisma.courierOnlineSession.findMany({
      where: { tenantId, driverId: { in: ids } },
      select: { driverId: true, availability: true, lastGpsAt: true, startTime: true },
      orderBy: { startTime: "desc" },
    }),
    prisma.driverTrainingSession.findMany({
      where: { tenantId, driverId: { in: ids }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      select: { id: true, driverId: true, endsAt: true },
    }),
    prisma.fleetIssue.groupBy({
      by: ["driverId", "status"],
      where: { tenantId, driverId: { in: ids }, openedAt: { gte: from } },
      _count: { _all: true },
    }),
  ]);

  const deliveredBy = new Map(delivered.map((d) => [d.driverId as string, d._count._all]));
  const failedBy = new Map(failed.map((d) => [d.driverId as string, d._count._all]));

  const onTimeBy = new Map<string, { onTime: number; total: number }>();
  for (const r of onTimeRows) {
    if (!r.driverId || !r.deliveredAt || !r.slaDeadline) continue;
    const row = onTimeBy.get(r.driverId) ?? { onTime: 0, total: 0 };
    row.total += 1;
    if (r.deliveredAt <= r.slaDeadline) row.onTime += 1;
    onTimeBy.set(r.driverId, row);
  }

  const offerBy = new Map<string, { accepted: number; declined: number; expired: number; total: number }>();
  for (const o of offers) {
    if (!o.driverId) continue;
    const row = offerBy.get(o.driverId) ?? { accepted: 0, declined: 0, expired: 0, total: 0 };
    row.total += o._count._all;
    if (o.status === "ACCEPTED") row.accepted += o._count._all;
    else if (o.status === "DECLINED") row.declined += o._count._all;
    else row.expired += o._count._all;
    offerBy.set(o.driverId, row);
  }

  const issueBy = new Map<string, { total: number; open: number }>();
  for (const i of issues) {
    if (!i.driverId) continue;
    const row = issueBy.get(i.driverId) ?? { total: 0, open: 0 };
    row.total += i._count._all;
    if (i.status === "OPEN" || i.status === "ACKNOWLEDGED" || i.status === "ESCALATED") {
      row.open += i._count._all;
    }
    issueBy.set(i.driverId, row);
  }

  const ratingBy = new Map(ratings.map((r) => [r.driverId as string, r._avg.stars]));

  // One session per driver: the most recent, which is what "last seen" means.
  const sessionBy = new Map<string, { availability: string; lastGpsAt: Date | null }>();
  for (const s of sessions) {
    if (sessionBy.has(s.driverId)) continue;
    sessionBy.set(s.driverId, { availability: s.availability, lastGpsAt: s.lastGpsAt });
  }

  const trainingBy = new Map(training.map((t) => [t.driverId, t]));

  const DOC_COLUMNS = [
    "civilIdStatus",
    "drivingLicenseStatus",
    "workPermitStatus",
    "healthCertStatus",
    "vehicleRegStatus",
    "policeClearanceStatus",
    "passportStatus",
    "driverSelfieStatus",
  ] as const;

  const rows: DriverTrackingRow[] = drivers.map((d) => {
    const onTime = onTimeBy.get(d.id);
    const offer = offerBy.get(d.id);
    const issue = issueBy.get(d.id);
    const session = sessionBy.get(d.id);
    const t = trainingBy.get(d.id);
    const docsValid = DOC_COLUMNS.filter(
      (c) => (d as unknown as Record<string, string | null>)[c] === "VALID",
    ).length;

    return {
      id: d.id,
      name: d.name,
      driverCode: d.driverCode,
      phone: d.phone,
      status: d.status,
      isFrozen: d.isFrozen,
      inTraining: d.inTraining,
      complianceFreezeReason: d.complianceFreezeReason,
      vehicleType: d.vehicleType,
      fleetPartnerId: d.fleetPartnerId,
      fleetPartnerName: d.fleetPartner?.name ?? null,
      assignedZoneId: d.assignedZoneId,
      assignedZoneName: d.assignedZone?.name ?? null,
      availability: session?.availability ?? "OFFLINE",
      lastSeenAt: session?.lastGpsAt?.toISOString() ?? null,
      delivered: deliveredBy.get(d.id) ?? 0,
      failed: failedBy.get(d.id) ?? 0,
      onTimeRate: onTime && onTime.total > 0 ? onTime.onTime / onTime.total : null,
      acceptanceRate: offer && offer.total > 0 ? offer.accepted / offer.total : null,
      rating: ratingBy.get(d.id) ?? null,
      rejections: offer ? offer.declined + offer.expired : 0,
      declined: offer?.declined ?? 0,
      violations: issue?.total ?? 0,
      violationsOpen: issue?.open ?? 0,
      docsValid,
      docsRequired: DOC_COLUMNS.length,
      trainingSessionId: t?.id ?? null,
      trainingEndsAt: t?.endsAt?.toISOString() ?? null,
      terminationPending: d.status === "TERMINATED" && !d.terminationClearedAt,
    };
  });

  return { rows, windowDays: days };
}

/**
 * Activate, deactivate, suspend or freeze a driver from the tracking table.
 *
 * `freeze` is a separate verb from `status` and always has been: the status
 * says what Darb's relationship with the driver is, the freeze is a stop
 * button dispatch reads. Freezing does not change the status, so unfreezing
 * cannot silently promote a SUSPENDED driver back to ACTIVE.
 */
export type DriverStateAction = "ACTIVATE" | "DEACTIVATE" | "SUSPEND" | "FREEZE" | "UNFREEZE" | "TERMINATE";

export async function setDriverOperationalState(params: {
  tenantId: string;
  driverId: string;
  action: DriverStateAction;
  reason?: string | null;
  /** Who pressed the button, for the audit row a termination writes. */
  actorUserId?: string | null;
}) {
  const { tenantId, driverId } = params;
  const driver = await prisma.driver.findFirst({
    where: { id: driverId, tenantId },
    select: { id: true, inTraining: true, status: true },
  });
  if (!driver) throw Object.assign(new Error("Driver not found"), { statusCode: 404 });

  const data: Record<string, unknown> = {};
  if (params.action === "ACTIVATE" && driver.inTraining) {
    // Activating past an OPEN window would leave `inTraining` set on an ACTIVE
    // driver, which dispatch skips: the driver would read active on every
    // screen and never be offered an order. Close the window instead.
    //
    // Revision 21c (client note, 2026-09-21): "I deactivated the driver
    // account but I can't activate it again". A flag with no open window
    // behind it (the window lapsed, or was cancelled by a path that did not
    // clear it) is not a reason to refuse; it is cleared on the way through,
    // or the driver is stuck with nobody able to say which window to close.
    const open = await prisma.driverTrainingSession.findFirst({
      where: { tenantId, driverId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      select: { id: true },
    });
    if (open) {
      throw Object.assign(
        new Error("That driver is in training. Close the training window to activate them."),
        { statusCode: 409, code: "IN_TRAINING" },
      );
    }
    data.inTraining = false;
  }

  switch (params.action) {
    case "ACTIVATE":
      data.status = "ACTIVE";
      // Activating clears a freeze: a driver told they are active and still
      // receiving no offers is the support call this prevents.
      data.isFrozen = false;
      data.complianceFrozenAt = null;
      data.complianceFreezeReason = null;
      // Taking a terminated driver back on starts their record clean: a
      // later termination needs its own clearance.
      if (driver.status === "TERMINATED") {
        data.terminatedAt = null;
        data.terminationClearedAt = null;
        data.terminationClearedById = null;
        data.terminationClearanceNote = null;
      }
      break;
    case "DEACTIVATE":
      data.status = "INACTIVE";
      break;
    case "SUSPEND":
      data.status = "SUSPENDED";
      break;
    case "TERMINATE":
      // Revision 21c (client note, 2026-09-21): a trainee who did not pass
      // must be able to be let go from the training screen. TERMINATED is
      // the status every roster, plan and candidate pool already excludes,
      // and the training flag comes off with it so nothing keeps waiting for
      // a window that will never be run.
      data.status = "TERMINATED";
      data.inTraining = false;
      // Revision 24 #16: this is the first of two steps. The driver now reads
      // "Terminated (pending clearance)" until the equipment clearance on the
      // profile is ticked. Terminating somebody already terminated keeps the
      // original stamp and any clearance already recorded.
      if (driver.status !== "TERMINATED") {
        data.terminatedAt = new Date();
        data.terminationClearedAt = null;
        data.terminationClearedById = null;
        data.terminationClearanceNote = null;
      }
      break;
    case "FREEZE":
      if (!params.reason?.trim()) {
        throw Object.assign(new Error("A freeze needs a reason"), { statusCode: 400 });
      }
      data.isFrozen = true;
      data.complianceFrozenAt = new Date();
      data.complianceFreezeReason = params.reason.trim();
      break;
    case "UNFREEZE":
      data.isFrozen = false;
      data.complianceFrozenAt = null;
      data.complianceFreezeReason = null;
      break;
  }

  await prisma.driver.updateMany({ where: { id: driverId, tenantId }, data });
  if (params.action === "TERMINATE" && driver.status !== "TERMINATED") {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: params.actorUserId ?? null,
        action: "DRIVER_TERMINATED",
        entityType: "Driver",
        entityId: driverId,
        changes: { reason: params.reason ?? null, clearance: "PENDING" },
      },
    });
  }
  return prisma.driver.findFirst({
    where: { id: driverId, tenantId },
    select: {
      id: true,
      name: true,
      status: true,
      isFrozen: true,
      inTraining: true,
      complianceFreezeReason: true,
    },
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Revision 24 #6 — "I need a checkbox to select multiple drivers to take
// action". One verb applied to a selection.
// ══════════════════════════════════════════════════════════════════════════

/** The verbs the tracking table offers in bulk. TERMINATE is deliberately not
 *  one of them, same as the row: this screen pauses people, it does not end
 *  them, and ending a hundred at once is not a click anybody should make. */
export const BULK_DRIVER_ACTIONS = ["ACTIVATE", "DEACTIVATE", "SUSPEND", "FREEZE", "UNFREEZE", "TRAIN"] as const;
export type BulkDriverAction = (typeof BULK_DRIVER_ACTIONS)[number];
export const BULK_DRIVER_MAX = 200;

export interface BulkDriverResult {
  driverId: string;
  name: string | null;
  ok: boolean;
  error?: string;
  code?: string;
}

/**
 * Runs the single-driver logic once per driver, one after another, and
 * reports each outcome. A refusal for one driver (in training, already has a
 * window, not found) is that driver's row in the result, never the batch's:
 * the client selected thirty people, and one of them being in training must
 * not leave the other twenty-nine untouched.
 */
export async function bulkSetDriverOperationalState(params: {
  tenantId: string;
  driverIds: string[];
  action: BulkDriverAction;
  reason?: string | null;
  periodDays?: number;
  actorUserId?: string | null;
}): Promise<{ action: BulkDriverAction; succeeded: number; failed: number; results: BulkDriverResult[] }> {
  const { tenantId, action } = params;
  const ids = Array.from(new Set(params.driverIds.filter((id) => typeof id === "string" && id)));
  if (!ids.length) throw Object.assign(new Error("Select at least one driver"), { statusCode: 400 });
  if (ids.length > BULK_DRIVER_MAX) {
    throw Object.assign(new Error(`At most ${BULK_DRIVER_MAX} drivers at a time`), { statusCode: 400 });
  }
  // Checked once up front rather than failing every row with the same words.
  if (action === "FREEZE" && !params.reason?.trim()) {
    throw Object.assign(new Error("A freeze needs a reason"), { statusCode: 400 });
  }

  const named = await prisma.driver.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameBy = new Map(named.map((d) => [d.id, d.name]));

  const results: BulkDriverResult[] = [];
  for (const driverId of ids) {
    const name = nameBy.get(driverId) ?? null;
    if (!name) {
      results.push({ driverId, name, ok: false, error: "Driver not found", code: "NOT_FOUND" });
      continue;
    }
    try {
      if (action === "TRAIN") {
        await createTrainingSession({
          tenantId,
          driverId,
          periodDays: params.periodDays ?? 1,
          reason: params.reason ?? null,
          coachId: params.actorUserId ?? null,
        });
      } else {
        await setDriverOperationalState({
          tenantId,
          driverId,
          action,
          reason: params.reason ?? null,
          actorUserId: params.actorUserId ?? null,
        });
      }
      results.push({ driverId, name, ok: true });
    } catch (err) {
      const e = err as { message?: string; code?: string };
      results.push({
        driverId,
        name,
        ok: false,
        error: e?.message ?? "Failed",
        ...(typeof e?.code === "string" ? { code: e.code } : {}),
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  return { action, succeeded, failed: results.length - succeeded, results };
}

// ══════════════════════════════════════════════════════════════════════════
// Revision 24 #16 — "for terminated drivers, there should be a clearance
// checkbox confirming we received the equipment from them, after which they
// get finally terminated".
// ══════════════════════════════════════════════════════════════════════════

/**
 * Ticks the equipment clearance on a TERMINATED driver.
 *
 * Every item still issued to the driver is marked returned (returnedDate now,
 * issued off) and goes back into its stock pool on /assets, so the equipment
 * screen's "issued" count and the driver's file never disagree. The stamp is a
 * status-guarded `updateMany` on `terminationClearedAt: null`: count 0 means
 * somebody else cleared the driver a moment ago and the answer is 409, never a
 * second return of the same kit.
 */
export async function clearTerminatedDriver(params: {
  tenantId: string;
  driverId: string;
  actorUserId: string | null;
  note?: string | null;
}) {
  const { tenantId, driverId } = params;
  const driver = await prisma.driver.findFirst({
    where: { id: driverId, tenantId },
    select: { id: true, status: true, terminatedAt: true, terminationClearedAt: true },
  });
  if (!driver) throw Object.assign(new Error("Driver not found"), { statusCode: 404 });
  if (driver.status !== "TERMINATED") {
    throw Object.assign(new Error("Only a terminated driver needs an equipment clearance"), {
      statusCode: 409,
      code: "NOT_TERMINATED",
    });
  }
  if (driver.terminationClearedAt) {
    throw Object.assign(new Error("This driver has already been cleared"), {
      statusCode: 409,
      code: "ALREADY_CLEARED",
    });
  }

  const now = new Date();
  const note = params.note?.trim() ? params.note.trim().slice(0, 500) : null;

  const returned = await prisma.$transaction(async (tx) => {
    const claimed = await tx.driver.updateMany({
      where: { id: driverId, tenantId, status: "TERMINATED", terminationClearedAt: null },
      data: {
        terminationClearedAt: now,
        terminationClearedById: params.actorUserId,
        terminationClearanceNote: note,
        // A driver terminated before revision 24 has no stamp; give them one.
        ...(driver.terminatedAt ? {} : { terminatedAt: now }),
      },
    });
    if (claimed.count === 0) {
      throw Object.assign(new Error("This driver has already been cleared"), {
        statusCode: 409,
        code: "ALREADY_CLEARED",
      });
    }

    const open = await tx.driverInventory.findMany({
      where: { driverId, issued: true, returnedDate: null },
      select: { id: true, itemType: true, quantity: true },
    });
    const items: Array<{ itemType: string; quantity: number }> = [];
    for (const item of open) {
      await tx.driverInventory.update({
        where: { id: item.id },
        data: { issued: false, returnedDate: now },
      });
      const qty = Math.max(0, item.quantity);
      items.push({ itemType: item.itemType, quantity: qty });
      if (qty === 0) continue;
      // Back into the pool it came from. Pools are per platform; Darb is the
      // only platform in scope, so prefer DARB and fall back to any pool of
      // that item. Issued never goes below zero.
      const pool =
        (await tx.platformInventory.findFirst({
          where: { tenantId, itemType: item.itemType, platform: "DARB" as never },
          select: { id: true, issued: true },
        })) ??
        (await tx.platformInventory.findFirst({
          where: { tenantId, itemType: item.itemType },
          select: { id: true, issued: true },
        }));
      if (pool) {
        await tx.platformInventory.update({
          where: { id: pool.id },
          data: { issued: Math.max(0, pool.issued - qty), available: { increment: qty } },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        tenantId,
        userId: params.actorUserId,
        action: "DRIVER_TERMINATION_CLEARED",
        entityType: "Driver",
        entityId: driverId,
        changes: { returned: items, note },
      },
    });
    return items;
  });

  return { driverId, terminationClearedAt: now.toISOString(), returned };
}
