/**
 * demoRefreshService — keeps the review environment showing a working day.
 *
 * Client revisions #5 and #6 ("all the tabs are empty", "please add data we
 * want to know what it looks like") were not missing features: the database
 * was fully seeded, but every surface is scoped to *today* and the seed was a
 * day old. Delivered-today, fees, on-time, the per-zone table and the whole
 * cash row all read zero; courier sessions had ended so the ops map had no
 * drivers at all; every incident was resolved so the SOS console was empty.
 *
 * Running the prisma/ demo seeds by hand fixes it until the next morning.
 * This is the same work, small enough to run inside a request, so the daily
 * cron can keep the demo current without anyone remembering to reseed.
 *
 * Lives in src/ (not prisma/) so it ships with the serverless bundle;
 * prisma/refresh-darb2-demo.ts is a thin CLI wrapper over it.
 *
 * GUARDED: only runs when DEMO_REFRESH_ENABLED=true. A real tenant must never
 * have synthetic orders written into it, so the default is off.
 */
import { prisma } from "../config";
import { logger } from "../config/logger";
import { createDeliveryOrder, assignDriverManually } from "./orderService";

/** Roughly how much of the roster is on shift at once. */
const ONLINE_SHARE = 0.45;
/** Of those online, roughly how many are mid-delivery. */
const BUSY_SHARE = 0.3;
/** Keep this many incidents open, and this many orders at risk. */
const TARGET_OPEN_INCIDENTS = 3;
const TARGET_JEOPARDY_ORDERS = 4;
/** Kuwait is UTC+3 with no DST. */
const KUWAIT_OFFSET_MS = 3 * 60 * 60_000;
/** routes/zones.ts caps gpsStaleAfterSec at 3600. */
const MAX_GPS_STALE_SEC = 3600;

const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const randf = (a: number, b: number) => Math.random() * (b - a) + a;
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

const INCIDENTS: Array<{ type: string; severity: string; description: string }> = [
  { type: "VEHICLE_BREAKDOWN", severity: "HIGH", description: "Bike will not start after the last drop. Waiting on the fleet workshop." },
  { type: "CUSTOMER_ISSUE", severity: "MEDIUM", description: "Customer refused the order at the door and is disputing the delivery fee." },
  { type: "ACCIDENT", severity: "CRITICAL", description: "Minor collision at the Fahaheel roundabout. Rider is unhurt, bike is not rideable." },
  { type: "SOS", severity: "CRITICAL", description: "Rider pressed SOS. No voice on the line, last position is on the Sixth Ring." },
];

const FIRST = ["Ahmed", "Sara", "Yousef", "Fatima", "Omar", "Layla", "Khalid", "Noura"];
const LAST = ["Al Ali", "Al Mutairi", "Al Rashid", "Al Sabah", "Al Otaibi"];
const STREETS = ["Block 4 Street 12", "Block 9 Street 3", "Block 1 Street 7", "Block 6 Street 22"];

export function isDemoRefreshEnabled(): boolean {
  return process.env.DEMO_REFRESH_ENABLED === "true";
}

/** Local Kuwait midnight, as a UTC instant. */
function kuwaitDayStart(now = new Date()): Date {
  const local = new Date(now.getTime() + KUWAIT_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - KUWAIT_OFFSET_MS,
  );
}

/**
 * Put a realistic slice of the roster on shift with a fresh position inside a
 * live zone. Sessions end OFFLINE at the close of a seeded day, so without
 * this the next morning shows an empty map and "drivers online 0".
 */
async function refreshPresence(tenantId: string): Promise<number> {
  await prisma.fulfillmentSettings.updateMany({
    where: { tenantId },
    data: { gpsStaleAfterSec: MAX_GPS_STALE_SEC },
  });

  const zones = await prisma.deliveryZone.findMany({
    where: { tenantId, isActive: true },
    select: { centroidLat: true, centroidLng: true },
  });
  const points = zones
    .filter((z) => z.centroidLat != null && z.centroidLng != null)
    .map((z) => ({ lat: Number(z.centroidLat), lng: Number(z.centroidLng) }));
  if (points.length === 0) return 0;

  const drivers = await prisma.driver.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  const wanted = Math.round(drivers.length * ONLINE_SHARE);

  const openSessions = await prisma.courierOnlineSession.findMany({
    where: { tenantId, endTime: null },
    select: { id: true, driverId: true },
  });
  const openByDriver = new Map(openSessions.map((s) => [s.driverId, s.id]));
  const now = Date.now();

  // Only the online slice needs a per-row position; everyone else is a single
  // updateMany. A sequential loop over the whole roster meant ~115 round trips
  // to Neon, far too slow for a cron running inside a 60s request.
  const goingOnline = drivers.slice(0, wanted);
  const goingOffline = drivers
    .slice(wanted)
    .map((d) => openByDriver.get(d.id))
    .filter((id): id is string => !!id);

  const writes: Array<Promise<unknown>> = goingOnline.map((driver) => {
    const centre = pick(points);
    const data = {
      availability: Math.random() < BUSY_SHARE ? "BUSY" : "ONLINE",
      isOnline: true,
      lastGpsAt: new Date(now - rand(2, 120) * 1000),
      lastGpsLat: +(centre.lat + randf(-0.012, 0.012)).toFixed(7),
      lastGpsLng: +(centre.lng + randf(-0.012, 0.012)).toFixed(7),
    };
    const existing = openByDriver.get(driver.id);
    return existing
      ? prisma.courierOnlineSession.update({ where: { id: existing }, data })
      : prisma.courierOnlineSession.create({
          data: {
            tenantId,
            driverId: driver.id,
            startTime: new Date(now - rand(60, 300) * 60_000),
            endTime: null,
            ...data,
          },
        });
  });

  if (goingOffline.length > 0) {
    writes.push(
      prisma.courierOnlineSession.updateMany({
        where: { id: { in: goingOffline } },
        data: { availability: "OFFLINE", isOnline: false },
      }),
    );
  }

  await Promise.all(writes);
  return goingOnline.length;
}

/** Keep a few incidents open so the SOS console is a worked example. */
async function topUpIncidents(tenantId: string): Promise<number> {
  const open = await prisma.incident.count({ where: { tenantId, status: "OPEN" } });
  if (open >= TARGET_OPEN_INCIDENTS) return 0;

  const sessions = await prisma.courierOnlineSession.findMany({
    where: { tenantId, endTime: null, availability: { in: ["ONLINE", "BUSY"] } },
    select: { driverId: true, lastGpsLat: true, lastGpsLng: true },
    take: 40,
  });
  if (sessions.length === 0) return 0;

  let created = 0;
  for (let i = open; i < TARGET_OPEN_INCIDENTS; i++) {
    const session = pick(sessions);
    const spec = INCIDENTS[i % INCIDENTS.length];
    await prisma.incident.create({
      data: {
        tenantId,
        type: spec.type as never,
        status: "OPEN",
        severity: spec.severity,
        driverId: session.driverId,
        lat: session.lastGpsLat,
        lng: session.lastGpsLng,
        description: spec.description,
        reportedVia: pick(["APP", "PHONE"]),
        createdAt: new Date(Date.now() - rand(3, 40) * 60_000),
        metadata: { seed: "darb2-demo", liveIssue: true },
      },
    });
    created++;
  }
  return created;
}

/**
 * Close out orders left in flight from a previous day. Their SLA deadlines are
 * hours or days in the past, so the jeopardy rail renders countdowns like
 * "-1443:22" and the ops map fills with work nobody is doing.
 */
async function closeStaleOrders(tenantId: string): Promise<number> {
  const dayStart = kuwaitDayStart();
  const stale = await prisma.deliveryOrder.findMany({
    where: {
      tenantId,
      status: { in: ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED", "PICKED_UP"] },
      createdAt: { lt: dayStart },
    },
    select: { id: true },
    take: 200,
  });
  if (stale.length === 0) return 0;

  // Written directly rather than through the FSM: these are abandoned demo
  // rows being swept, not deliveries anyone is reporting on, and walking each
  // through its remaining transitions would cost far more than the cron has.
  const { count } = await prisma.deliveryOrder.updateMany({
    where: { id: { in: stale.map((o) => o.id) } },
    data: { status: "CANCELLED", cancelReason: "Demo data swept at end of day" },
  });
  return count;
}

/** Keep a few live orders genuinely at risk so Jeopardy has something to show. */
async function topUpJeopardy(
  tenantId: string,
  actor: { type: "USER"; id: string; name: string },
): Promise<number> {
  const soon = new Date(Date.now() + 15 * 60_000);
  const atRisk = await prisma.deliveryOrder.count({
    where: {
      tenantId,
      status: { in: ["DISPATCHING", "ASSIGNED", "PICKED_UP"] },
      slaDeadline: { lte: soon },
    },
  });
  if (atRisk >= TARGET_JEOPARDY_ORDERS) return 0;

  const vendors = await prisma.vendor.findMany({
    where: { tenantId, isActive: true, isPaused: false },
    select: {
      id: true,
      branches: {
        where: { isActive: true, zoneId: { not: null } },
        select: { id: true, lat: true, lng: true },
      },
    },
  });
  const usable = vendors.filter((v) => v.branches.length > 0);
  if (usable.length === 0) return 0;

  const drivers = await prisma.courierOnlineSession.findMany({
    where: { tenantId, endTime: null, availability: { in: ["ONLINE", "BUSY"] } },
    select: { driverId: true },
    take: 40,
  });

  let created = 0;
  for (let i = atRisk; i < TARGET_JEOPARDY_ORDERS; i++) {
    const vendor = pick(usable);
    const branch = pick(vendor.branches);
    if (branch.lat == null || branch.lng == null) continue;

    const order = await createDeliveryOrder({
      tenantId,
      source: "PARTNER_API",
      vendorId: vendor.id,
      branchId: branch.id,
      paymentMethod: Math.random() < 0.7 ? "COD" : "PREPAID",
      orderTotalKwd: (rand(3000, 24000) / 1000).toFixed(3),
      customerName: `${pick(FIRST)} ${pick(LAST)}`,
      customerPhone: `+9659${rand(1000000, 9999999)}`,
      dropoffAddress: pick(STREETS),
      dropoff: {
        lat: +(Number(branch.lat) + (Math.random() - 0.5) * 0.02).toFixed(7),
        lng: +(Number(branch.lng) + (Math.random() - 0.5) * 0.02).toFixed(7),
      },
      externalRef: `JEOPARDY-${Date.now()}-${i}`,
      metadata: { seed: "darb2-demo", liveIssue: true },
      actor,
    } as never);

    if (order.status === "REJECTED") continue;

    // Assign roughly half, so the rail shows both "no driver yet" and "en
    // route and running out of time".
    if (drivers.length > 0 && Math.random() < 0.6) {
      try {
        await assignDriverManually({
          tenantId,
          orderId: order.id,
          driverId: pick(drivers).driverId,
          actor,
        });
      } catch {
        // A driver over the cash ceiling or already batched is fine to skip.
      }
    }

    // Pull the deadline into (or just past) the danger window. Written
    // directly: the SLA is set at creation from zone config and there is no
    // service-level path to shorten it.
    await prisma.deliveryOrder.update({
      where: { id: order.id },
      data: { slaDeadline: new Date(Date.now() + rand(-8, 12) * 60_000) },
    });
    created++;
  }
  return created;
}

export interface DemoRefreshResult {
  skipped?: boolean;
  driversOnline?: number;
  incidentsOpened?: number;
  staleOrdersClosed?: number;
  jeopardyCreated?: number;
  errors?: string[];
}

export async function refreshDemoData(): Promise<DemoRefreshResult> {
  if (!isDemoRefreshEnabled()) return { skipped: true };

  const result: DemoRefreshResult = {};
  const errors: string[] = [];

  // eslint-disable-next-line no-restricted-syntax -- cross-tenant by design: this is an environment-level demo job, gated by DEMO_REFRESH_ENABLED
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    const admin = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: "ADMIN" },
      select: { id: true, name: true },
    });
    if (!admin) continue;
    const actor = { type: "USER" as const, id: admin.id, name: admin.name ?? "Ops" };

    // Order matters: sweep yesterday first, then bring the roster on shift,
    // then raise issues against couriers who are actually online.
    for (const [label, step] of [
      ["staleOrdersClosed", () => closeStaleOrders(tenant.id)],
      ["driversOnline", () => refreshPresence(tenant.id)],
      ["incidentsOpened", () => topUpIncidents(tenant.id)],
      ["jeopardyCreated", () => topUpJeopardy(tenant.id, actor)],
    ] as Array<[keyof DemoRefreshResult, () => Promise<number>]>) {
      try {
        const count = await step();
        (result[label] as number) = ((result[label] as number) ?? 0) + count;
      } catch (err) {
        logger.error({ err, tenantId: tenant.id, step: label }, "demo refresh step failed");
        errors.push(String(label));
      }
    }
  }

  if (errors.length > 0) result.errors = errors;
  return result;
}
