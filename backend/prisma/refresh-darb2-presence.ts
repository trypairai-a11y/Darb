/**
 * refresh-darb2-presence.ts — make the live map look live again.
 *
 * The demo has no real driver apps sending GPS, so every position the seed
 * wrote ages out: /api/dispatch/overview reports drivers whose lastGpsAt is
 * older than FulfillmentSettings.gpsStaleAfterSec as "GPS stale", and the
 * dispatch engine skips them as candidates. A few minutes after seeding, the
 * whole roster reads stale.
 *
 * It also brings the roster back online. Sessions end OFFLINE at the close of
 * a seeded day, so by the next morning every courier reads offline: the ops
 * map shows no drivers at all, the cockpit reports "drivers online 0" and
 * dispatch has no candidates. Bringing a realistic slice back online is what
 * makes the demo look like a working day rather than a dead one.
 *
 * This nudges every online courier a short distance, stamps lastGpsAt to now,
 * and appends a fresh LocationLog trail. Run it any time before showing the
 * demo — it is cheap and fully idempotent.
 *
 * It also raises gpsStaleAfterSec to the maximum the app's own validation
 * allows (routes/zones.ts caps it at 3600s), so the map stays clean for an
 * hour at a time rather than three minutes.
 *
 * Run: cd backend && npx tsx prisma/refresh-darb2-presence.ts
 */
import { Prisma, PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const MAX_GPS_STALE_SEC = 3600; // routes/zones.ts: .max(3600)
const randf = (a: number, b: number) => Math.random() * (b - a) + a;
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;


/** Roughly how much of the roster should be on shift at once. */
const ONLINE_SHARE = 0.45;
/** Of those online, roughly how many are mid-delivery. */
const BUSY_SHARE = 0.3;

/**
 * Put a realistic slice of the roster on shift with a position inside a live
 * zone. No-op once enough couriers are already online, so repeat runs are
 * cheap and do not inflate the roster.
 */
async function ensureRosterOnline(tid: string): Promise<void> {
  const drivers = await prisma.driver.findMany({
    where: { tenantId: tid, status: "ACTIVE" },
    select: { id: true },
  });
  const wanted = Math.round(drivers.length * ONLINE_SHARE);

  const alreadyOnline = await prisma.courierOnlineSession.count({
    where: { tenantId: tid, endTime: null, availability: { in: ["ONLINE", "BUSY"] } },
  });
  if (alreadyOnline >= wanted) {
    console.log(`Roster already has ${alreadyOnline} couriers online (target ${wanted}).`);
    return;
  }

  // Spread them over the active zones' centroids so the map is not one pile.
  const zones = await prisma.deliveryZone.findMany({
    where: { tenantId: tid, isActive: true },
    select: { centroidLat: true, centroidLng: true },
  });
  const points = zones
    .filter((z) => z.centroidLat != null && z.centroidLng != null)
    .map((z) => ({ lat: Number(z.centroidLat), lng: Number(z.centroidLng) }));
  if (points.length === 0) {
    console.log("No zone centroids available — skipping roster wake-up.");
    return;
  }

  // Prefer drivers who are not already on an open session.
  const openSessions = await prisma.courierOnlineSession.findMany({
    where: { tenantId: tid, endTime: null },
    select: { id: true, driverId: true },
  });
  const openByDriver = new Map(openSessions.map((s) => [s.driverId, s.id]));

  const now = Date.now();
  let brought = 0;
  for (const driver of drivers) {
    if (alreadyOnline + brought >= wanted) break;
    const centre = points[Math.floor(Math.random() * points.length)];
    const lat = +(centre.lat + randf(-0.012, 0.012)).toFixed(7);
    const lng = +(centre.lng + randf(-0.012, 0.012)).toFixed(7);
    const availability = Math.random() < BUSY_SHARE ? "BUSY" : "ONLINE";
    const data = {
      availability,
      isOnline: true,
      lastGpsAt: new Date(now - rand(2, 120) * 1000),
      lastGpsLat: lat,
      lastGpsLng: lng,
    };

    const existing = openByDriver.get(driver.id);
    if (existing) {
      await prisma.courierOnlineSession.update({ where: { id: existing }, data });
    } else {
      await prisma.courierOnlineSession.create({
        data: {
          tenantId: tid,
          driverId: driver.id,
          // Started a few hours ago so the shift reads as in-progress.
          startTime: new Date(now - rand(60, 300) * 60_000),
          endTime: null,
          ...data,
        },
      });
    }
    brought++;
  }
  console.log(`Brought ${brought} couriers online (target ${wanted}).`);
}

async function main() {
  const tenant =
    (await prisma.tenant.findFirst({ where: { name: "Osama Fleet Management" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) throw new Error("No tenant found.");
  const tid = tenant.id;

  await prisma.fulfillmentSettings.updateMany({
    where: { tenantId: tid },
    data: { gpsStaleAfterSec: MAX_GPS_STALE_SEC },
  });
  console.log(`gpsStaleAfterSec set to ${MAX_GPS_STALE_SEC}s`);

  await ensureRosterOnline(tid);

  const sessions = await prisma.courierOnlineSession.findMany({
    where: { tenantId: tid, endTime: null, availability: { in: ["ONLINE", "BUSY"] } },
    select: { id: true, driverId: true, lastGpsLat: true, lastGpsLng: true },
  });
  console.log(`Refreshing ${sessions.length} online couriers...`);

  const now = Date.now();
  let moved = 0;
  for (const s of sessions) {
    if (s.lastGpsLat == null || s.lastGpsLng == null) continue;
    // Small drift so repeated runs look like the roster is actually moving.
    const lat = +(Number(s.lastGpsLat) + randf(-0.0018, 0.0018)).toFixed(7);
    const lng = +(Number(s.lastGpsLng) + randf(-0.0018, 0.0018)).toFixed(7);
    await prisma.courierOnlineSession.update({
      where: { id: s.id },
      data: { lastGpsAt: new Date(now - rand(2, 90) * 1000), lastGpsLat: lat, lastGpsLng: lng },
    });
    moved++;
  }
  console.log(`  positions updated: ${moved}`);

  // Fresh trail for the ops map (/api/dispatch/positions reads LocationLog).
  const driverIds = sessions.map((s) => s.driverId);
  const devices = (
    await prisma.device.findMany({
      where: { tenantId: tid, driverId: { in: driverIds } },
      select: { id: true, driverId: true },
    })
  ).filter((d): d is { id: string; driverId: string } => d.driverId !== null);

  const posByDriver = new Map(sessions.map((s) => [s.driverId, s]));
  const trail: Prisma.LocationLogCreateManyInput[] = [];
  for (const dev of devices) {
    const p = posByDriver.get(dev.driverId);
    if (!p || p.lastGpsLat == null || p.lastGpsLng == null) continue;
    let lat = Number(p.lastGpsLat);
    let lng = Number(p.lastGpsLng);
    for (let i = 8; i >= 0; i--) {
      trail.push({
        deviceId: dev.id, driverId: dev.driverId,
        latitude: +lat.toFixed(7), longitude: +lng.toFixed(7),
        accuracy: +randf(3, 16).toFixed(2),
        speed: +randf(0, 50).toFixed(2),
        capturedAt: new Date(now - i * 30_000),
      });
      lat += randf(-0.0009, 0.0009);
      lng += randf(-0.0009, 0.0009);
    }
  }
  if (trail.length) await prisma.locationLog.createMany({ data: trail });
  console.log(`  fresh GPS points: ${trail.length}`);

  const fresh = await prisma.courierOnlineSession.count({
    where: { tenantId: tid, endTime: null, lastGpsAt: { gte: new Date(now - MAX_GPS_STALE_SEC * 1000) } },
  });
  console.log(`Couriers now reporting fresh GPS: ${fresh}`);
}

/** Callable entrypoint — the daily cron reuses this via demoRefreshService. */
export const refreshPresence = main;

// Only self-execute (and exit the process) when run directly from the CLI.
if (require.main === module) {
  main()
    .then(async () => { await prisma.$disconnect(); process.exit(0); })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
