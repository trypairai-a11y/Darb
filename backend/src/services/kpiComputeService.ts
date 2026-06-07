import { prisma } from "../config";

export interface ComputeResult {
  computed: number;
  drivers: number;
  definitions: number;
}

export async function computeKpisForDate(
  tenantId: string,
  date: Date,
  platformFilter?: string | null,
): Promise<ComputeResult> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  const defWhere: any = { tenantId, isActive: true };
  if (platformFilter) {
    defWhere.OR = [{ platform: platformFilter }, { platform: null }];
  }
  const definitions = await prisma.kpiDefinition.findMany({ where: defWhere });

  const driverWhere: any = { tenantId, status: "ACTIVE" };
  if (platformFilter) driverWhere.platform = platformFilter;
  const drivers = await prisma.driver.findMany({
    where: driverWhere,
    select: { id: true, platform: true },
  });

  const driverIds = drivers.map((d) => d.id);
  const [attendanceRecords, orderLogs, shifts, talabatSessions, keetaMetrics, cashRecords] =
    await Promise.all([
      prisma.attendanceRecord.findMany({ where: { tenantId, driverId: { in: driverIds }, date: { gte: dayStart, lte: dayEnd } } }),
      prisma.orderLog.findMany({ where: { tenantId, driverId: { in: driverIds }, date: { gte: dayStart, lte: dayEnd } } }),
      prisma.shift.findMany({ where: { tenantId, driverId: { in: driverIds }, date: { gte: dayStart, lte: dayEnd } } }),
      prisma.talabatSession.findMany({ where: { tenantId, driverId: { in: driverIds }, date: { gte: dayStart, lte: dayEnd } } }),
      prisma.keetaDailyMetrics.findMany({ where: { tenantId, driverId: { in: driverIds }, date: { gte: dayStart, lte: dayEnd } } }),
      prisma.cashRecord.findMany({ where: { tenantId, driverId: { in: driverIds }, date: { gte: dayStart, lte: dayEnd } } }),
    ]);

  let computed = 0;

  for (const driver of drivers) {
    for (const def of definitions) {
      if (def.platform && def.platform !== driver.platform) continue;

      let value: number | null = null;
      const target = def.target ? Number(def.target) : null;

      switch (def.name) {
        case "On-Time Attendance": {
          const att = attendanceRecords.filter((a) => a.driverId === driver.id);
          if (att.length > 0) {
            const onTime = att.filter((a) => a.status === "PRESENT").length;
            value = Math.round((onTime / att.length) * 100 * 100) / 100;
          }
          break;
        }
        case "Daily Orders": {
          const orders = orderLogs.filter((o) => o.driverId === driver.id);
          value = orders.reduce((sum, o) => sum + o.orderCount, 0);
          break;
        }
        case "Delivery Efficiency": {
          const driverShifts = shifts.filter((s) => s.driverId === driver.id && s.actualStart && s.actualEnd);
          const driverOrders = orderLogs.filter((o) => o.driverId === driver.id);
          const totalOrders = driverOrders.reduce((sum, o) => sum + o.orderCount, 0);
          if (driverShifts.length > 0 && totalOrders > 0) {
            const totalMinutes = driverShifts.reduce((sum, s) => {
              return sum + (new Date(s.actualEnd!).getTime() - new Date(s.actualStart!).getTime()) / 60000;
            }, 0);
            value = Math.round((totalMinutes / totalOrders) * 100) / 100;
          }
          break;
        }
        case "UTR (Orders/Hour)":
        case "UTR": {
          const driverShifts = shifts.filter((s) => s.driverId === driver.id && s.actualStart && s.actualEnd);
          const totalMinutes = driverShifts.reduce((sum, s) => {
            return sum + (new Date(s.actualEnd!).getTime() - new Date(s.actualStart!).getTime()) / 60000;
          }, 0);
          const totalOrders = orderLogs
            .filter((o) => o.driverId === driver.id)
            .reduce((sum, o) => sum + o.orderCount, 0);
          if (totalMinutes > 0) {
            value = Math.round((totalOrders / (totalMinutes / 60)) * 100) / 100;
          }
          break;
        }
        case "Cash Settlement %":
        case "Cash Settlement": {
          const recs = cashRecords.filter((c) => c.driverId === driver.id);
          const sales = recs.reduce((sum, c) => sum + Number(c.salesAmount ?? 0), 0);
          const collected = recs.reduce((sum, c) => sum + Number(c.collectionAmount ?? 0), 0);
          if (sales > 0) {
            value = Math.round((collected / sales) * 100 * 100) / 100;
          }
          break;
        }
        case "GPS Violation": {
          const sessions = talabatSessions.filter((s) => s.driverId === driver.id && s.gpsViolation != null);
          if (sessions.length > 0) {
            value = Math.round((sessions.reduce((sum, s) => sum + (s.gpsViolation || 0), 0) / sessions.length) * 100) / 100;
          }
          break;
        }
        case "Face Verification Rate": {
          const sessions = talabatSessions.filter((s) => s.driverId === driver.id);
          if (sessions.length > 0) {
            const verified = sessions.filter((s) => s.faceVerified).length;
            value = Math.round((verified / sessions.length) * 100 * 100) / 100;
          }
          break;
        }
        case "Completion Rate": {
          const km = keetaMetrics.find((m) => m.driverId === driver.id);
          if (km && km.completionRate != null) {
            value = Math.round(Number(km.completionRate) * 100 * 100) / 100;
          }
          break;
        }
        case "On-Time Delivery Rate": {
          const km = keetaMetrics.find((m) => m.driverId === driver.id);
          if (km && km.onTimeRate != null) {
            value = Math.round(Number(km.onTimeRate) * 100 * 100) / 100;
          }
          break;
        }
        case "Online Hours": {
          const km = keetaMetrics.find((m) => m.driverId === driver.id);
          if (km) {
            value = Math.round((km.onlineTime / 60) * 100) / 100;
          }
          break;
        }
        case "Rejection Rate": {
          const km = keetaMetrics.find((m) => m.driverId === driver.id);
          if (km && km.acceptedTasks > 0) {
            value = Math.round((km.rejectedTasks / (km.acceptedTasks + km.rejectedTasks)) * 100 * 100) / 100;
          }
          break;
        }
        case "Cash Collection Rate": {
          const recs = cashRecords.filter((c) => c.driverId === driver.id);
          const sales = recs.reduce((sum, c) => sum + Number(c.salesAmount ?? 0), 0);
          const collected = recs.reduce((sum, c) => sum + Number(c.collectionAmount ?? 0), 0);
          if (sales > 0) {
            value = Math.round((collected / sales) * 100 * 100) / 100;
          } else {
            const sessions = talabatSessions.filter((s) => s.driverId === driver.id);
            if (sessions.length > 0) value = 100;
          }
          break;
        }
        default:
          continue;
      }

      if (value === null) continue;

      const isLowerBetter = def.name === "Delivery Efficiency" || def.name === "Rejection Rate";
      const score = target && target > 0
        ? Math.round((isLowerBetter ? (target / Math.max(value, 0.01)) * 100 : (value / target) * 100) * 100) / 100
        : null;
      const cappedScore = score != null ? Math.min(999.99, score) : null;

      try {
        await prisma.kpiRecord.upsert({
          where: {
            tenantId_driverId_kpiDefinitionId_date: {
              tenantId,
              driverId: driver.id,
              kpiDefinitionId: def.id,
              date: dayStart,
            },
          },
          create: { tenantId, driverId: driver.id, kpiDefinitionId: def.id, date: dayStart, value, target, score: cappedScore, source: "COMPUTED" },
          update: { value, target, score: cappedScore, source: "COMPUTED" },
        });
        computed++;
      } catch (err: any) {
        if (process.env.NODE_ENV !== "test") {
          console.error(`KPI compute upsert failed: driver=${driver.id} def=${def.name}`, err.message);
        }
      }
    }
  }

  return { computed, drivers: drivers.length, definitions: definitions.length };
}

export async function computeKpisForRange(
  tenantId: string,
  from: Date,
  to: Date,
  platformFilter?: string | null,
): Promise<ComputeResult> {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  let total: ComputeResult = { computed: 0, drivers: 0, definitions: 0 };
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = new Date(d);
    const r = await computeKpisForDate(tenantId, day, platformFilter);
    total = {
      computed: total.computed + r.computed,
      drivers: r.drivers,
      definitions: r.definitions,
    };
  }
  return total;
}
