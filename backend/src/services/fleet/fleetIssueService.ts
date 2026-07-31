/**
 * Revision 12 — delivery issues.
 *
 * Darb's system opens these; the delivery company closes them. That is the
 * opposite direction of travel from SupportTicket, and the reason Issues is its
 * own tab rather than a ticket type: a supervisor works an inbox of things Darb
 * has noticed, calls the driver, and records what they did about it.
 *
 * The whole point is to move work Darb currently does by phone onto the party
 * who actually employs the driver. So an issue is not an alert to be dismissed:
 * resolving requires a note saying what was done. An acknowledge button with no
 * account of the fix is a button that gets clicked to clear a badge.
 *
 * `dedupeKey` is what keeps the nightly sweep from raising the same issue every
 * night. Idempotent by construction: the sweep can run twice and change
 * nothing.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { kuwaitDateKey, kuwaitDayStart } from "./fleetActivityService";
import { deriveDocHealth } from "./fleetDocumentService";

export type FleetIssueType =
  | "LATE_LOGIN"
  | "NO_ORDERS"
  | "RATING_DROP"
  | "DOC_EXPIRING"
  | "ACCEPTANCE_LOW";

/** Kuwait local hour after which coming online counts as late. */
const LATE_LOGIN_HOUR = 11;
/** Consecutive zero-order days before an ACTIVE driver is flagged. */
const NO_ORDER_DAYS = 3;
const RATING_FLOOR = 4.0;
const RATING_MIN_SAMPLES = 5;
const ACCEPTANCE_FLOOR = 0.6;
const ACCEPTANCE_MIN_OFFERS = 10;
const DOC_WARNING_DAYS = 14;
/** An issue open this long stops being the fleet's problem alone. */
const ESCALATE_AFTER_HOURS = 48;

interface Candidate {
  fleetPartnerId: string;
  driverId: string;
  type: FleetIssueType;
  severity: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  detail: string;
  data?: Record<string, unknown>;
  dedupeKey: string;
}

/**
 * Open an issue unless one with the same dedupeKey already exists. Returns
 * whether it created anything, which is what the cron logs.
 */
async function openIfNew(tenantId: string, c: Candidate): Promise<boolean> {
  const existing = await prisma.fleetIssue.findFirst({
    where: { tenantId, dedupeKey: c.dedupeKey },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.fleetIssue.create({
    data: {
      tenantId,
      fleetPartnerId: c.fleetPartnerId,
      driverId: c.driverId,
      type: c.type,
      severity: c.severity,
      title: c.title,
      detail: c.detail,
      data: (c.data ?? undefined) as Prisma.InputJsonValue | undefined,
      dedupeKey: c.dedupeKey,
    },
  });
  return true;
}

export interface SweepResult {
  scannedDrivers: number;
  opened: number;
  escalated: number;
  autoResolved: number;
}

/**
 * The nightly detection pass for one tenant. Every rule below is computable
 * from data that already exists; nothing here needed a new write path.
 */
export async function sweepFleetIssues(
  tenantId: string,
  now = new Date(),
): Promise<SweepResult> {
  const drivers = await prisma.driver.findMany({
    where: { tenantId, fleetPartnerId: { not: null }, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      fleetPartnerId: true,
      civilIdExpiry: true,
      drivingLicenseExpiry: true,
      vehicleRegExpiry: true,
      vehicleInsuranceExpiry: true,
      healthCertExpiry: true,
      workPermitExpiry: true,
      foodHandlingCertExpiry: true,
    },
  });
  if (drivers.length === 0) {
    return { scannedDrivers: 0, opened: 0, escalated: 0, autoResolved: 0 };
  }

  const driverIds = drivers.map((d) => d.id);
  const todayStart = kuwaitDayStart(now);
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);
  const noOrderWindow = new Date(todayStart.getTime() - NO_ORDER_DAYS * 86_400_000);
  const dayKey = kuwaitDateKey(yesterdayStart);

  const [sessions, recentOrders, ratings, offers] = await Promise.all([
    prisma.courierOnlineSession.findMany({
      where: {
        tenantId,
        driverId: { in: driverIds },
        startTime: { gte: yesterdayStart, lt: todayStart },
      },
      select: { driverId: true, startTime: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.deliveryOrder.findMany({
      where: {
        tenantId,
        driverId: { in: driverIds },
        status: "DELIVERED",
        deliveredAt: { gte: noOrderWindow },
      },
      select: { driverId: true },
    }),
    prisma.orderRating.groupBy({
      by: ["driverId"],
      where: { tenantId, driverId: { in: driverIds }, createdAt: { gte: weekStart } },
      _avg: { stars: true },
      _count: { _all: true },
    }),
    prisma.dispatchOffer.groupBy({
      by: ["driverId", "status"],
      where: { tenantId, driverId: { in: driverIds }, offeredAt: { gte: weekStart } },
      _count: { _all: true },
    }),
  ]);

  const firstOnline = new Map<string, Date>();
  for (const s of sessions) {
    if (!firstOnline.has(s.driverId)) firstOnline.set(s.driverId, s.startTime);
  }
  const workedRecently = new Set(recentOrders.map((o) => o.driverId).filter(Boolean) as string[]);
  const ratingByDriver = new Map(ratings.map((r) => [r.driverId, r]));

  const offerTotals = new Map<string, { total: number; accepted: number }>();
  for (const o of offers) {
    const e = offerTotals.get(o.driverId) ?? { total: 0, accepted: 0 };
    e.total += o._count._all;
    if (o.status === "ACCEPTED") e.accepted += o._count._all;
    offerTotals.set(o.driverId, e);
  }

  let opened = 0;

  for (const d of drivers) {
    const fleetPartnerId = d.fleetPartnerId!;
    const base = { fleetPartnerId, driverId: d.id };

    // 1. Did not come online, or came online late. The client's own example.
    const first = firstOnline.get(d.id);
    if (!first) {
      opened += (await openIfNew(tenantId, {
        ...base,
        type: "LATE_LOGIN",
        severity: "HIGH",
        title: `${d.name} did not come online`,
        detail: `${d.name} was ACTIVE on ${dayKey} but never came online. Call the driver, find out why, then resolve this with what you did.`,
        data: { date: dayKey },
        dedupeKey: `LATE_LOGIN:${d.id}:${dayKey}`,
      }))
        ? 1
        : 0;
    } else {
      const localHour = new Date(first.getTime() + 3 * 3_600_000).getUTCHours();
      if (localHour >= LATE_LOGIN_HOUR) {
        const hhmm = new Date(first.getTime() + 3 * 3_600_000).toISOString().slice(11, 16);
        opened += (await openIfNew(tenantId, {
          ...base,
          type: "LATE_LOGIN",
          severity: "MEDIUM",
          title: `${d.name} came online late`,
          detail: `${d.name} first came online at ${hhmm} on ${dayKey}, past ${LATE_LOGIN_HOUR}:00.`,
          data: { date: dayKey, firstOnlineLocal: hhmm },
          dedupeKey: `LATE_LOGIN:${d.id}:${dayKey}`,
        }))
          ? 1
          : 0;
      }
    }

    // 2. Active on paper, doing nothing in practice.
    if (!workedRecently.has(d.id)) {
      opened += (await openIfNew(tenantId, {
        ...base,
        type: "NO_ORDERS",
        severity: "MEDIUM",
        title: `${d.name} has not delivered in ${NO_ORDER_DAYS} days`,
        detail: `${d.name} is ACTIVE but has delivered no orders since ${kuwaitDateKey(noOrderWindow)}. Is the driver still working for you?`,
        data: { since: kuwaitDateKey(noOrderWindow) },
        dedupeKey: `NO_ORDERS:${d.id}:${dayKey}`,
      }))
        ? 1
        : 0;
    }

    // 3. Performance is down. The client's second example.
    const r = ratingByDriver.get(d.id);
    if (r && r._count._all >= RATING_MIN_SAMPLES && (r._avg.stars ?? 5) < RATING_FLOOR) {
      const avg = Number((r._avg.stars ?? 0).toFixed(2));
      opened += (await openIfNew(tenantId, {
        ...base,
        type: "RATING_DROP",
        severity: "HIGH",
        title: `${d.name} is rated ${avg} this week`,
        detail: `${d.name} averaged ${avg} across ${r._count._all} customer ratings in the last 7 days, below the ${RATING_FLOOR} floor.`,
        data: { avg, count: r._count._all },
        dedupeKey: `RATING_DROP:${d.id}:${dayKey}`,
      }))
        ? 1
        : 0;
    }

    // 4. Turning work down.
    const off = offerTotals.get(d.id);
    if (off && off.total >= ACCEPTANCE_MIN_OFFERS && off.accepted / off.total < ACCEPTANCE_FLOOR) {
      const pct = Math.round((off.accepted / off.total) * 100);
      opened += (await openIfNew(tenantId, {
        ...base,
        type: "ACCEPTANCE_LOW",
        severity: "MEDIUM",
        title: `${d.name} accepted ${pct}% of offers`,
        detail: `${d.name} accepted ${off.accepted} of ${off.total} offers in the last 7 days.`,
        data: { acceptedPct: pct, total: off.total },
        dedupeKey: `ACCEPTANCE_LOW:${d.id}:${dayKey}`,
      }))
        ? 1
        : 0;
    }

    // 5. Paperwork about to stop being valid. Cheapest issue to fix and the
    //    most expensive to discover at a police checkpoint.
    const docs: Array<[string, Date | null]> = [
      ["Civil ID", d.civilIdExpiry],
      ["Driving licence", d.drivingLicenseExpiry],
      ["Vehicle registration", d.vehicleRegExpiry],
      ["Vehicle insurance", d.vehicleInsuranceExpiry],
      ["Health certificate", d.healthCertExpiry],
      ["Work permit", d.workPermitExpiry],
      ["Food handling certificate", d.foodHandlingCertExpiry],
    ];
    for (const [label, expiry] of docs) {
      if (!expiry) continue;
      const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);
      if (daysLeft > DOC_WARNING_DAYS) continue;
      const expired = daysLeft < 0;
      opened += (await openIfNew(tenantId, {
        ...base,
        type: "DOC_EXPIRING",
        severity: expired ? "HIGH" : "MEDIUM",
        title: expired
          ? `${d.name}: ${label} has expired`
          : `${d.name}: ${label} expires in ${daysLeft} days`,
        detail: expired
          ? `${label} for ${d.name} expired on ${kuwaitDateKey(expiry)}. Upload a renewal from the driver's profile.`
          : `${label} for ${d.name} expires on ${kuwaitDateKey(expiry)}. Upload a renewal from the driver's profile.`,
        data: { document: label, expiry: kuwaitDateKey(expiry), daysLeft },
        dedupeKey: `DOC_EXPIRING:${d.id}:${label}:${kuwaitDateKey(expiry)}`,
      }))
        ? 1
        : 0;
    }
  }

  // Anything the fleet has left sitting stops being theirs alone.
  const escalated = await prisma.fleetIssue.updateMany({
    where: {
      tenantId,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
      openedAt: { lt: new Date(now.getTime() - ESCALATE_AFTER_HOURS * 3_600_000) },
    },
    data: { status: "ESCALATED" },
  });

  // A document issue whose document was renewed closes itself. Making a fleet
  // click resolve on a problem that no longer exists teaches them to click
  // resolve without reading.
  const autoResolved = await autoResolveFixedDocIssues(tenantId, now);

  return {
    scannedDrivers: drivers.length,
    opened,
    escalated: escalated.count,
    autoResolved,
  };
}

/** Close DOC_EXPIRING issues whose document is now valid again. */
async function autoResolveFixedDocIssues(tenantId: string, now: Date): Promise<number> {
  const open = await prisma.fleetIssue.findMany({
    where: { tenantId, type: "DOC_EXPIRING", status: { in: ["OPEN", "ACKNOWLEDGED", "ESCALATED"] } },
    select: { id: true, driverId: true, data: true },
  });
  if (open.length === 0) return 0;

  const ids: string[] = [];
  for (const issue of open) {
    const data = (issue.data ?? {}) as Record<string, unknown>;
    const label = typeof data.document === "string" ? data.document : null;
    if (!issue.driverId || !label) continue;
    const doc = await prisma.fleetDocument.findFirst({
      where: { tenantId, driverId: issue.driverId, status: "VALID" },
      orderBy: { reviewedAt: "desc" },
      select: { expiryDate: true },
    });
    if (doc && deriveDocHealth(doc.expiryDate, now) === "VALID") ids.push(issue.id);
  }
  if (ids.length === 0) return 0;

  const res = await prisma.fleetIssue.updateMany({
    where: { tenantId, id: { in: ids } },
    data: {
      status: "RESOLVED",
      resolvedAt: now,
      resolutionNote: "Closed automatically: a valid replacement document was approved.",
    },
  });
  return res.count;
}

/** Run the sweep for every tenant. Called by the nightly cron. */
export async function sweepAllTenantFleetIssues(now = new Date()) {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const results: Array<{ tenantId: string } & SweepResult> = [];
  for (const t of tenants) {
    try {
      results.push({ tenantId: t.id, ...(await sweepFleetIssues(t.id, now)) });
    } catch {
      // One tenant's bad data must not stop the rest of the sweep.
    }
  }
  return results;
}
