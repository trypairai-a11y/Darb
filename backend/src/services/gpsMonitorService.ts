import { prisma } from "../config";
import {
  createViolationNotifications,
  getViolationSeverity,
} from "./notificationService";
import { logger } from "../config/logger";
import { createViolationWithAlert } from "./violationEngine";

// R5 · GPS-stale escalation chain. Runs every 5 minutes against every tenant.
//
// Thresholds (tenant-overridable via PlatformSettings.notificationConfig.gpsStaleEscalation):
//   Tier 1 (10 min): alert pill visible on Monitor + IMPORTANT notification. Driver app push wake.
//   Tier 2 (30 min): auto-create Violation GPS_NOT_UPLOADING.
//   Tier 3 (45 min): notify assigned Supervisor with CALL action.
//
// Notifications are deduped per-driver-per-tier-per-day so the chain fires once per escalation.

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TIER1_MS_DEFAULT = 10 * 60 * 1000;
const TIER2_MS_DEFAULT = 30 * 60 * 1000;
const TIER3_MS_DEFAULT = 45 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

type TierConfig = { tier1Ms: number; tier2Ms: number; tier3Ms: number };

async function loadTierConfig(tenantId: string): Promise<TierConfig> {
  const ps = await prisma.platformSettings.findFirst({ where: { tenantId } });
  const cfg = (ps?.notificationConfig as any)?.gpsStaleEscalation ?? {};
  return {
    tier1Ms: cfg.tier1Min ? cfg.tier1Min * 60_000 : TIER1_MS_DEFAULT,
    tier2Ms: cfg.tier2Min ? cfg.tier2Min * 60_000 : TIER2_MS_DEFAULT,
    tier3Ms: cfg.tier3Min ? cfg.tier3Min * 60_000 : TIER3_MS_DEFAULT,
  };
}

async function alreadyFiredToday(
  tenantId: string,
  driverId: string,
  tier: 1 | 2 | 3
): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const type = tier === 1 ? "GPS_STALE_ALERT" : tier === 2 ? "GPS_NOT_UPLOADING" : "GPS_STALE_SUPERVISOR";
  const existing = await prisma.notification.findFirst({
    where: {
      tenantId,
      type,
      sourceId: driverId,
      createdAt: { gte: today },
    },
  });
  return !!existing;
}

async function tierOne(tenantId: string, device: any, driver: any) {
  if (await alreadyFiredToday(tenantId, driver.id, 1)) return false;
  const platformId = driver.platformDriverId ?? driver.id;
  await createViolationNotifications({
    tenantId,
    eventType: "GPS_STALE_ALERT",
    severity: "HIGH",
    title: "GPS stale · check driver",
    message: `Rider ${platformId} ${driver.name} has not uploaded GPS for ≥10 min.`,
    sourceId: driver.id,
    metadata: {
      category: "IMPORTANT",
      titleAr: "تنبيه GPS · تحقق من السائق",
      bodyAr: `السائق ${platformId} ${driver.name} لم يرفع موقع GPS لمدة ≥10 دقائق.`,
      deviceId: device.id,
      lastSeen: device.lastSeen?.toISOString(),
      tier: 1,
    },
  }).catch((e) => logger.error({ err: e }, "gpsMonitor tier1 notify failed"));

  // Wake push (stub: no mobile push endpoint yet — logged and swallowed)
  logger.info({ driverId: driver.id }, "[gpsMonitor] tier1 wake-push stub");
  return true;
}

async function tierTwo(tenantId: string, driver: any, platform: string) {
  if (await alreadyFiredToday(tenantId, driver.id, 2)) return false;
  await createViolationWithAlert({
    tenantId,
    driverId: driver.id,
    platform: platform as any,
    violationType: "GPS_NOT_UPLOADING" as any,
    violationTime: new Date(),
    details: `Auto-violation: GPS not uploaded for ≥30 min`,
    metadata: { source: "gpsMonitor-tier2" },
  }).catch((e) => logger.error({ err: e }, "gpsMonitor tier2 violation failed"));
  return true;
}

async function tierThree(tenantId: string, driver: any) {
  if (await alreadyFiredToday(tenantId, driver.id, 3)) return false;
  const platformId = driver.platformDriverId ?? driver.id;
  await createViolationNotifications({
    tenantId,
    eventType: "GPS_STALE_SUPERVISOR",
    severity: "CRITICAL",
    title: "GPS stale ≥45 min · supervisor action needed",
    message: `${platformId} ${driver.name} has been GPS-silent ≥45 min. Call the driver.`,
    sourceId: driver.id,
    metadata: {
      category: "IMPORTANT",
      titleAr: "GPS صامت ≥45 دقيقة · يلزم تدخل المشرف",
      bodyAr: `${platformId} ${driver.name} بدون GPS لمدة ≥45 دقيقة. يرجى الاتصال بالسائق.`,
      supervisorId: driver.supervisorId ?? null,
      action: { type: "CALL", payload: { driverId: driver.id, phone: driver.phone } },
      tier: 3,
    },
  }).catch((e) => logger.error({ err: e }, "gpsMonitor tier3 notify failed"));
  return true;
}

async function runPassForTenant(tenantId: string): Promise<void> {
  const { tier1Ms, tier2Ms, tier3Ms } = await loadTierConfig(tenantId);
  const now = Date.now();

  const staleDevices = await prisma.device.findMany({
    where: {
      tenantId,
      driver: { tenantId, status: "ACTIVE" },
      isOnline: true,
      lastSeen: { lt: new Date(now - tier1Ms) },
    },
    select: {
      id: true,
      lastSeen: true,
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
          platformDriverId: true,
          platform: true,
          supervisorId: true,
        },
      },
    },
  });

  for (const device of staleDevices) {
    if (!device.driver || !device.lastSeen) continue;
    const staleMs = now - device.lastSeen.getTime();

    if (staleMs >= tier3Ms) {
      await tierThree(tenantId, device.driver);
    }
    if (staleMs >= tier2Ms) {
      await tierTwo(tenantId, device.driver, device.driver.platform);
    }
    if (staleMs >= tier1Ms) {
      await tierOne(tenantId, device, device.driver);
    }
  }
}

async function runGpsPass() {
  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    for (const t of tenants) {
      try {
        await runPassForTenant(t.id);
      } catch (err: any) {
        console.error(`[gpsMonitor] tenant=${t.id} failed: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.error(`[gpsMonitor] outer failure: ${err.message}`);
  }
}

/**
 * Start the GPS-stale escalation scheduler (every 5 minutes).
 * First run delayed 90s after boot so migrations/seed finish first.
 */
export function startGpsMonitorScheduler() {
  if (timer) return;
  if (process.env.DISABLE_GPS_MONITOR === "1") return;

  setTimeout(runGpsPass, 90_000);
  timer = setInterval(runGpsPass, FIVE_MINUTES_MS);
  console.log("[gpsMonitor] R5 escalation scheduler started (5m interval)");
}

export function stopGpsMonitorScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
