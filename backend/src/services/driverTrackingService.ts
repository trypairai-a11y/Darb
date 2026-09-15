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
  /** Required documents currently valid, over the number required. */
  docsValid: number;
  docsRequired: number;
  /** An open training window, when there is one. */
  trainingSessionId: string | null;
  trainingEndsAt: string | null;
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

  const [delivered, failed, onTimeRows, offers, ratings, sessions, training] = await Promise.all([
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

  const offerBy = new Map<string, { accepted: number; total: number }>();
  for (const o of offers) {
    if (!o.driverId) continue;
    const row = offerBy.get(o.driverId) ?? { accepted: 0, total: 0 };
    row.total += o._count._all;
    if (o.status === "ACCEPTED") row.accepted += o._count._all;
    offerBy.set(o.driverId, row);
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
      docsValid,
      docsRequired: DOC_COLUMNS.length,
      trainingSessionId: t?.id ?? null,
      trainingEndsAt: t?.endsAt?.toISOString() ?? null,
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
export async function setDriverOperationalState(params: {
  tenantId: string;
  driverId: string;
  action: "ACTIVATE" | "DEACTIVATE" | "SUSPEND" | "FREEZE" | "UNFREEZE";
  reason?: string | null;
}) {
  const { tenantId, driverId } = params;
  const driver = await prisma.driver.findFirst({
    where: { id: driverId, tenantId },
    select: { id: true, inTraining: true },
  });
  if (!driver) throw Object.assign(new Error("Driver not found"), { statusCode: 404 });

  if (params.action === "ACTIVATE" && driver.inTraining) {
    // Activating past an open window would leave `inTraining` set on an ACTIVE
    // driver, which dispatch skips: the driver would read active on every
    // screen and never be offered an order. Close the window instead.
    throw Object.assign(
      new Error("That driver is in training. Close the training window to activate them."),
      { statusCode: 409, code: "IN_TRAINING" },
    );
  }

  const data: Record<string, unknown> = {};
  switch (params.action) {
    case "ACTIVATE":
      data.status = "ACTIVE";
      // Activating clears a freeze: a driver told they are active and still
      // receiving no offers is the support call this prevents.
      data.isFrozen = false;
      data.complianceFrozenAt = null;
      data.complianceFreezeReason = null;
      break;
    case "DEACTIVATE":
      data.status = "INACTIVE";
      break;
    case "SUSPEND":
      data.status = "SUSPENDED";
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
