import { prisma } from "../config";
import { logger } from "../config/logger";
import { AmericanaDailyRow } from "../services/americanaDailyParser";

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function resolveDriver(tenantId: string, empId: string, name: string) {
  let driver = empId
    ? await prisma.driver.findFirst({ where: { tenantId, platformDriverId: empId } })
    : null;
  if (!driver && name) {
    driver = await prisma.driver.findFirst({
      where: { tenantId, name: { equals: name, mode: "insensitive" } },
    });
  }
  return driver;
}

async function resolveChain(tenantId: string, chainName: string) {
  if (!chainName) return null;
  const slug = chainName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  let chain = await prisma.americanaChain.findFirst({
    where: { tenantId, OR: [{ slug }, { name: { equals: chainName, mode: "insensitive" } }] },
  });
  if (!chain) {
    chain = await prisma.americanaChain.create({
      data: { tenantId, name: chainName, slug },
    });
  }
  return chain;
}

async function resolveStore(tenantId: string, chainId: string, storeName: string, area: string | null) {
  if (!storeName) return null;
  let store = await prisma.americanaStore.findFirst({
    where: { tenantId, name: { equals: storeName, mode: "insensitive" } },
  });
  if (!store) {
    store = await prisma.americanaStore.create({
      data: { tenantId, chainId, name: storeName, area: area || null },
    });
  }
  return store;
}

/**
 * Run on approve. Merges the staged rows into AmericanaDailyOrders (idempotent)
 * and creates the follow-up side-effects:
 *  - upsert chains + stores referenced by the feed
 *  - replace dailyOrders[day] and recompute totalOrders
 *  - emit an attendance record for LATE / NO_SHOW days (used by the violation
 *    engine to raise AMERICANA_LATE_ARRIVAL / AMERICANA_NO_SHOW)
 */
export async function processIngestionRows(ingestionId: string): Promise<{ merged: number; skipped: number; errors: string[] }> {
  const ingestion = await prisma.americanaDailyIngestion.findUnique({ where: { id: ingestionId } });
  if (!ingestion) throw new Error("Ingestion not found");
  const rows = (ingestion.parsedRows as unknown as AmericanaDailyRow[]) || [];
  const tenantId = ingestion.tenantId;

  let merged = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const driver = await resolveDriver(tenantId, row.empId, row.driverName);
      if (!driver) {
        skipped++;
        errors.push(`driver not found: ${row.empId || row.driverName}`);
        continue;
      }
      const chain = await resolveChain(tenantId, row.chain);
      const store = chain ? await resolveStore(tenantId, chain.id, row.storeName, null) : null;

      const monthDate = firstOfMonth(new Date(row.year, row.month, 1));
      const dayKey = String(row.day).padStart(2, "0");

      const existing = await prisma.americanaDailyOrders.findUnique({
        where: { tenantId_driverId_month: { tenantId, driverId: driver.id, month: monthDate } },
      });
      const dailyOrders = { ...(existing?.dailyOrders as Record<string, number> | null || {}) };
      dailyOrders[dayKey] = row.orders;
      const totalOrders = Object.values(dailyOrders).reduce((s, v) => s + (Number(v) || 0), 0);

      await prisma.americanaDailyOrders.upsert({
        where: { tenantId_driverId_month: { tenantId, driverId: driver.id, month: monthDate } },
        create: {
          tenantId, driverId: driver.id, month: monthDate,
          chain: row.chain || null,
          chainId: chain?.id || null,
          storeName: row.storeName || null,
          storeId: store?.id || null,
          empId: row.empId || null,
          company: row.company || null,
          position: row.position || null,
          dailyOrders,
          totalOrders,
          source: "DAILY_EMAIL",
        },
        update: {
          chain: row.chain || existing?.chain || null,
          chainId: chain?.id || existing?.chainId || null,
          storeName: row.storeName || existing?.storeName || null,
          storeId: store?.id || existing?.storeId || null,
          company: row.company || existing?.company || null,
          position: row.position || existing?.position || null,
          dailyOrders,
          totalOrders,
          source: "DAILY_EMAIL",
        },
      });

      // Attendance signal
      if (row.attendanceStatus === "LATE" || row.attendanceStatus === "NO_SHOW") {
        const shiftDate = new Date(row.year, row.month, row.day);
        await prisma.attendanceRecord.upsert({
          where: {
            tenantId_driverId_date: {
              tenantId, driverId: driver.id, date: shiftDate,
            },
          } as any,
          create: {
            tenantId, driverId: driver.id, date: shiftDate,
            status: row.attendanceStatus === "LATE" ? "LATE" : "ABSENT",
            minutesLate: row.attendanceStatus === "LATE" ? 15 : 0,
          } as any,
          update: {
            status: row.attendanceStatus === "LATE" ? "LATE" : "ABSENT",
          } as any,
        }).catch(() => {
          // AttendanceRecord may use a different compound unique — fall back to create-only
          return prisma.attendanceRecord.create({
            data: {
              tenantId, driverId: driver.id, date: shiftDate,
              status: row.attendanceStatus === "LATE" ? "LATE" : "ABSENT",
              minutesLate: row.attendanceStatus === "LATE" ? 15 : 0,
            } as any,
          }).catch(() => null);
        });
      }

      merged++;
    } catch (err: any) {
      errors.push(err.message);
    }
  }

  await prisma.americanaDailyIngestion.update({
    where: { id: ingestionId },
    data: {
      status: "APPROVED",
      errorLog: errors.length ? errors.join("\n").slice(0, 4000) : null,
    },
  });

  // Trigger violation engine (imported lazily to avoid cycles)
  try {
    const { scanIngestionForViolations } = await import("../services/americanaViolationEngine");
    await scanIngestionForViolations(ingestionId);
  } catch (err: any) {
    logger.error({ err, ingestionId }, "[americanaIngest] violation scan failed");
  }

  return { merged, skipped, errors };
}

/**
 * Simple scheduler that fires the missing-feed alarm for each tenant at 09:00
 * local. Invoked from an hourly check.
 */
export async function checkMissingFeed(now = new Date()) {
  if (now.getHours() !== 9) return;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const t of tenants) {
    const yesterday = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
    const count = await prisma.americanaDailyIngestion.count({
      where: { tenantId: t.id, ingestDate: { gte: yesterday, lt: dayStart } },
    });
    if (count > 0) continue;
    // Only raise if this tenant has an Americana module active
    const hasAmericana = await prisma.americanaDailyOrders.findFirst({
      where: { tenantId: t.id }, select: { id: true },
    });
    if (!hasAmericana) continue;
    try {
      await prisma.notification.create({
        data: {
          tenantId: t.id,
          title: "Americana daily feed missing",
          message: `No Americana feed arrived for ${yesterday.toISOString().slice(0, 10)}. Check the inbox.`,
          type: "AMERICANA_FEED_MISSING",
          severity: "HIGH",
          category: "IMPORTANT",
        },
      });
    } catch (err: any) {
      logger.warn({ err, tenantId: t.id }, "[americanaIngest] missing-feed notification failed");
    }
  }
}
