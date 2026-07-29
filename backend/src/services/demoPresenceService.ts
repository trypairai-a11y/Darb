/**
 * Demo courier presence upkeep.
 *
 * Dispatch needs couriers who are ONLINE with GPS newer than five minutes —
 * sweepStalePresence marks anyone quieter than that OFFLINE, and it uses its
 * own hardcoded window, so raising FulfillmentSettings.gpsStaleAfterSec does
 * not save them. In a real deployment that is exactly right: a courier whose
 * phone stopped reporting is not someone to hand an order to.
 *
 * On a demo or pilot tenant there is no driver app posting anything, so the
 * whole roster goes dark five minutes after it is seeded and every order that
 * follows exhausts with nobody to offer it to. That is not a dispatch fault
 * being surfaced, it is a fixture that stopped breathing, and it made the
 * platform look broken while it was working perfectly.
 *
 * This keeps the fixture breathing: it nudges each online courier a short way
 * and stamps their GPS to now, so they stay dispatchable between ticks. It
 * runs from the same minute-level ticker as the dispatch sweep.
 *
 * OFF UNLESS ASKED FOR. Only tenants named in DEMO_PRESENCE_TENANTS are
 * touched, so a real tenant on the same deployment can never have synthetic
 * GPS written against its couriers.
 */
import { prisma } from "../config";
import { logger } from "../config/logger";

/** How far a courier drifts between ticks, in degrees (~50-150 m). */
const DRIFT = 0.0012;

/** Bring the roster up to roughly this share of ACTIVE drivers. */
const ONLINE_SHARE = 0.45;

const jitter = (span: number) => (Math.random() * 2 - 1) * span;

export interface PresenceUpkeepResult {
  tenants: number;
  refreshed: number;
  woken: number;
}

/**
 * Tenants this is enabled for. Comma-separated ids in DEMO_PRESENCE_TENANTS.
 * Empty (the default) disables the whole thing, which is what production
 * tenants with real drivers get.
 *
 * Exported because demoCourierService gates on the same list: a tenant whose
 * couriers are fixtures breathing on synthetic GPS is exactly a tenant whose
 * couriers cannot answer an offer. One allow-list, one blast radius.
 */
export function demoTenantIds(): string[] {
  return (process.env.DEMO_PRESENCE_TENANTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Put couriers back on shift when the roster has thinned, positioning them on
 * active zone centroids so the map is not one pile of pins. Returns how many
 * were woken.
 */
async function wakeRoster(tenantId: string): Promise<number> {
  const [driverCount, online] = await Promise.all([
    prisma.driver.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.courierOnlineSession.count({
      where: { tenantId, endTime: null, availability: { in: ["ONLINE", "BUSY"] } },
    }),
  ]);
  const wanted = Math.round(driverCount * ONLINE_SHARE);
  if (online >= wanted) return 0;

  const zones = await prisma.deliveryZone.findMany({
    where: { tenantId, isActive: true, centroidLat: { not: null }, centroidLng: { not: null } },
    select: { centroidLat: true, centroidLng: true },
  });
  if (zones.length === 0) return 0;

  const drivers = await prisma.driver.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true },
    take: wanted,
  });
  const openSessions = await prisma.courierOnlineSession.findMany({
    where: { tenantId, endTime: null },
    select: { id: true, driverId: true },
  });
  const openByDriver = new Map(openSessions.map((s) => [s.driverId, s.id]));

  const now = Date.now();
  let woken = 0;
  for (const driver of drivers) {
    if (online + woken >= wanted) break;
    const z = zones[Math.floor(Math.random() * zones.length)];
    const data = {
      availability: "ONLINE" as const,
      isOnline: true,
      lastGpsAt: new Date(),
      lastGpsLat: +(Number(z.centroidLat) + jitter(0.012)).toFixed(7),
      lastGpsLng: +(Number(z.centroidLng) + jitter(0.012)).toFixed(7),
    };
    const existing = openByDriver.get(driver.id);
    if (existing) {
      await prisma.courierOnlineSession.update({ where: { id: existing }, data });
    } else {
      await prisma.courierOnlineSession.create({
        data: {
          tenantId,
          driverId: driver.id,
          startTime: new Date(now - 60 * 60_000),
          endTime: null,
          ...data,
        },
      });
    }
    woken++;
  }
  return woken;
}

/**
 * One upkeep pass over every enabled tenant. Safe to call every minute and a
 * no-op when DEMO_PRESENCE_TENANTS is unset, so the cron can call it
 * unconditionally.
 *
 * Never throws: presence upkeep failing must not take the dispatch sweep down
 * with it, because the sweep is the thing that actually moves orders.
 */
export async function refreshDemoPresence(): Promise<PresenceUpkeepResult> {
  const tenantIds = demoTenantIds();
  const result: PresenceUpkeepResult = { tenants: 0, refreshed: 0, woken: 0 };
  if (tenantIds.length === 0) return result;

  for (const tenantId of tenantIds) {
    try {
      result.tenants++;
      result.woken += await wakeRoster(tenantId);

      // Keep everyone already on shift dispatchable. BUSY couriers are
      // refreshed too: they are mid-delivery and their pin should still move.
      const sessions = await prisma.courierOnlineSession.findMany({
        where: {
          tenantId,
          endTime: null,
          availability: { in: ["ONLINE", "BUSY"] },
          lastGpsLat: { not: null },
          lastGpsLng: { not: null },
        },
        select: { id: true, lastGpsLat: true, lastGpsLng: true },
      });

      for (const s of sessions) {
        await prisma.courierOnlineSession.update({
          where: { id: s.id },
          data: {
            lastGpsAt: new Date(),
            lastGpsLat: +(Number(s.lastGpsLat) + jitter(DRIFT)).toFixed(7),
            lastGpsLng: +(Number(s.lastGpsLng) + jitter(DRIFT)).toFixed(7),
          },
        });
        result.refreshed++;
      }
    } catch (err) {
      logger.warn({ err, tenantId }, "demo presence upkeep failed for tenant");
    }
  }
  return result;
}
