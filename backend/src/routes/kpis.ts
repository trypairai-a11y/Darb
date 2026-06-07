import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { cacheGet, cacheSet, cacheInvalidate } from "../utils/cache";
import { validateBody, createKpiRecordSchema } from "../utils/validate";
import { rbac } from "../middleware/rbac";
import { computeKpisForDate, computeKpisForRange } from "../services/kpiComputeService";

const router = Router();
router.use(authMiddleware, tenantScope);

const DEF_ADMINS = ["ADMIN", "OPS_MANAGER"];

// ─── KPI Definitions ────────────────────────────────────────────────────────

// GET /definitions - List all KPI definitions
router.get("/definitions", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform, category, isActive } = req.query;
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === "true";

    const definitions = await prisma.kpiDefinition.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    res.json(definitions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /definitions - Create a KPI definition
router.post("/definitions", rbac(...DEF_ADMINS), async (req: Request, res: Response) => {
  try {
    const definition = await prisma.kpiDefinition.create({
      data: { ...req.body, tenantId: req.user!.tenantId },
    });
    res.status(201).json(definition);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /definitions/:id - Update a KPI definition
router.put("/definitions/:id", rbac(...DEF_ADMINS), async (req: Request, res: Response) => {
  try {
    const allowed = ["name", "description", "category", "unit", "platform", "target", "isActive", "sortOrder"] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const result = await prisma.kpiDefinition.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data,
    });
    if (result.count === 0) { res.status(404).json({ error: "KPI definition not found" }); return; }
    const updated = await prisma.kpiDefinition.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /definitions/:id - Soft delete (deactivate)
router.delete("/definitions/:id", rbac(...DEF_ADMINS), async (req: Request, res: Response) => {
  try {
    const result = await prisma.kpiDefinition.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data: { isActive: false },
    });
    if (result.count === 0) { res.status(404).json({ error: "KPI definition not found" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /definitions/seed - Seed default KPI definitions for a tenant
router.post("/definitions/seed", rbac(...DEF_ADMINS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const defaults = [
      // Common KPIs (all platforms)
      { name: "On-Time Attendance", description: "Percentage of shifts where driver clocked in on time", category: "ATTENDANCE" as const, unit: "PERCENTAGE" as const, platform: null, target: 95, sortOrder: 1 },
      { name: "Daily Orders", description: "Number of orders completed per day", category: "ORDERS" as const, unit: "COUNT" as const, platform: null, target: 15, sortOrder: 2 },
      { name: "Delivery Efficiency", description: "Average delivery time in minutes", category: "DELIVERY_EFFICIENCY" as const, unit: "MINUTES" as const, platform: null, target: 30, sortOrder: 3 },

      // Talabat-specific
      { name: "GPS Violation", description: "Percentage of time GPS was active during shift", category: "VIOLATION" as const, unit: "PERCENTAGE" as const, platform: "TALABAT" as const, target: 98, sortOrder: 10 },
      { name: "Face Verification Rate", description: "Percentage of sessions with successful face verification", category: "VIOLATION" as const, unit: "PERCENTAGE" as const, platform: "TALABAT" as const, target: 100, sortOrder: 11 },
      { name: "Cash Collection Rate", description: "Percentage of cash collected vs sales amount", category: "FINANCIAL" as const, unit: "PERCENTAGE" as const, platform: "TALABAT" as const, target: 100, sortOrder: 12 },
      { name: "Zone Violation", description: "Percentage of deliveries within assigned zone", category: "VIOLATION" as const, unit: "PERCENTAGE" as const, platform: "TALABAT" as const, target: 95, sortOrder: 13 },

      // Keeta-specific
      { name: "Completion Rate", description: "Percentage of accepted tasks completed", category: "ORDERS" as const, unit: "PERCENTAGE" as const, platform: "KEETA" as const, target: 95, sortOrder: 20 },
      { name: "On-Time Delivery Rate", description: "Percentage of deliveries on time", category: "DELIVERY_EFFICIENCY" as const, unit: "PERCENTAGE" as const, platform: "KEETA" as const, target: 90, sortOrder: 21 },
      { name: "Online Hours", description: "Hours online per day", category: "ATTENDANCE" as const, unit: "HOURS" as const, platform: "KEETA" as const, target: 8, sortOrder: 22 },
      { name: "Rejection Rate", description: "Percentage of tasks rejected (lower is better)", category: "ORDERS" as const, unit: "PERCENTAGE" as const, platform: "KEETA" as const, target: 5, sortOrder: 23 },

      // Deliveroo-specific
      { name: "Order Accuracy", description: "Percentage of orders delivered without issues", category: "ORDERS" as const, unit: "PERCENTAGE" as const, platform: "DELIVEROO" as const, target: 98, sortOrder: 30 },

      // Americana-specific
      { name: "Orders Per Shift", description: "Average orders per shift", category: "ORDERS" as const, unit: "COUNT" as const, platform: "AMERICANA" as const, target: 20, sortOrder: 40 },
    ];

    let created = 0;
    for (const def of defaults) {
      await prisma.kpiDefinition.upsert({
        where: {
          tenantId_name_platform: {
            tenantId,
            name: def.name,
            platform: def.platform as any,
          },
        },
        create: { ...def, tenantId, target: def.target },
        update: {},
      });
      created++;
    }

    res.json({ seeded: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── KPI Records ────────────────────────────────────────────────────────────

// GET /records - List KPI records with filters
router.get("/records", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { driverId, kpiDefinitionId, platform, dateFrom, dateTo } = req.query;
    const where: any = { tenantId };

    if (driverId) where.driverId = driverId;
    if (kpiDefinitionId) where.kpiDefinitionId = kpiDefinitionId;
    if (platform) {
      where.kpiDefinition = { platform: platform };
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        const d = new Date(dateFrom as string);
        d.setHours(0, 0, 0, 0);
        where.date.gte = d;
      }
      if (dateTo) {
        const d = new Date(dateTo as string);
        d.setHours(23, 59, 59, 999);
        where.date.lte = d;
      }
    }

    const [data, total] = await Promise.all([
      prisma.kpiRecord.findMany({
        where, skip, take: limit,
        orderBy: { date: "desc" },
        include: {
          driver: { select: { id: true, name: true, platform: true, zone: true } },
          kpiDefinition: { select: { id: true, name: true, category: true, unit: true, platform: true, target: true } },
        },
      }),
      prisma.kpiRecord.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/kpi/records:
 *   post:
 *     tags: [KPIs]
 *     summary: Create or update a KPI record for a driver
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId, kpiDefinitionId, date, value]
 *             properties:
 *               driverId: { type: string, format: uuid }
 *               kpiDefinitionId: { type: string, format: uuid }
 *               date: { type: string, format: date }
 *               value: { type: number }
 *               target: { type: number }
 *               source: { type: string, enum: [MANUAL, AUTO, IMPORT] }
 *     responses:
 *       201:
 *         description: KPI record created or updated
 *       422:
 *         description: Validation error
 */
// POST /records - Create/update a KPI record
router.post("/records", validateBody(createKpiRecordSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { driverId, kpiDefinitionId, date, value, target, source } = req.body;

    const score = target && Number(target) > 0 ? Math.round((Number(value) / Number(target)) * 100 * 100) / 100 : null;

    const record = await prisma.kpiRecord.upsert({
      where: {
        tenantId_driverId_kpiDefinitionId_date: {
          tenantId,
          driverId,
          kpiDefinitionId,
          date: new Date(date),
        },
      },
      create: { tenantId, driverId, kpiDefinitionId, date: new Date(date), value, target, score, source: source || "MANUAL" },
      update: { value, target, score, source: source || "MANUAL" },
      include: {
        driver: { select: { id: true, name: true } },
        kpiDefinition: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Summary / Dashboard ────────────────────────────────────────────────────

/**
 * @swagger
 * /api/kpi/summary:
 *   get:
 *     tags: [KPIs]
 *     summary: Aggregate KPI scores across all drivers, weighted by shifts worked
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema: { type: string, enum: [TALABAT, KEETA, DELIVEROO, AMERICANA] }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Weighted KPI summary with per-driver breakdown and platform averages
 *         headers:
 *           X-Cache:
 *             schema: { type: string }
 *             description: HIT if served from Redis cache
 */
// GET /summary - Aggregate KPI performance across drivers for a date range
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { platform, dateFrom, dateTo, companyId } = req.query;

    const startDate = dateFrom ? new Date(dateFrom as string) : new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = dateTo ? new Date(dateTo as string) : new Date();
    endDate.setHours(23, 59, 59, 999);

    // Lazy-compute: if no KpiRecord rows for this date range, run compute now
    const existing = await prisma.kpiRecord.findFirst({
      where: { tenantId, date: { gte: startDate, lte: endDate } },
      select: { id: true },
    });
    if (!existing) {
      await computeKpisForRange(tenantId, startDate, endDate, platform as string | undefined);
      await cacheInvalidate(`kpi_summary:${tenantId}:*`);
    }

    const cacheKey = `kpi_summary:${tenantId}:${platform || ""}:${companyId || ""}:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cached = await cacheGet(cacheKey);
    if (cached) { res.json(cached); return; }

    // Get active definitions
    const defWhere: any = { tenantId, isActive: true };
    if (platform) {
      defWhere.OR = [{ platform: platform }, { platform: null }];
    }
    const definitions = await prisma.kpiDefinition.findMany({ where: defWhere, orderBy: { sortOrder: "asc" } });

    // Get records for the date range
    const recordWhere: any = {
      tenantId,
      date: { gte: startDate, lte: endDate },
    };
    if (platform) {
      recordWhere.kpiDefinition = { OR: [{ platform: platform }, { platform: null }] };
    }
    if (companyId) {
      recordWhere.driver = { companyId: companyId as string };
    }

    const records = await prisma.kpiRecord.findMany({
      where: recordWhere,
      include: {
        kpiDefinition: { select: { id: true, name: true, category: true, unit: true, target: true } },
      },
    });

    // Count shifts per driver in the date range for weighted aggregation
    const shiftCounts = await prisma.shift.groupBy({
      by: ["driverId"],
      where: {
        tenantId,
        date: { gte: startDate, lte: endDate },
        status: { in: ["COMPLETED", "IN_PROGRESS"] },
        ...(platform ? { platform: platform as any } : {}),
        ...(companyId ? { driver: { companyId: companyId as string } } : {}),
      },
      _count: { id: true },
    });
    const shiftCountMap = new Map(shiftCounts.map((s) => [s.driverId, s._count.id]));

    // Aggregate by KPI definition using shift-count-weighted averages
    const kpiSummaries = definitions.map((def) => {
      const defRecords = records.filter((r) => r.kpiDefinitionId === def.id);

      // Weighted average: each driver's score weighted by their shift count
      let weightedValueSum = 0;
      let weightedScoreSum = 0;
      let totalWeight = 0;
      for (const r of defRecords) {
        const weight = shiftCountMap.get(r.driverId) || 1;
        weightedValueSum += Number(r.value) * weight;
        if (r.score != null) weightedScoreSum += Number(r.score) * weight;
        totalWeight += weight;
      }
      const avg = totalWeight > 0 ? weightedValueSum / totalWeight : 0;
      const avgScore = totalWeight > 0 ? weightedScoreSum / totalWeight : 0;

      return {
        id: def.id,
        name: def.name,
        category: def.category,
        unit: def.unit,
        platform: def.platform,
        target: def.target ? Number(def.target) : null,
        avgValue: Math.round(avg * 100) / 100,
        avgScore: Math.round(avgScore * 100) / 100,
        totalRecords: defRecords.length,
        driversAboveTarget: defRecords.filter((r) => r.score != null && Number(r.score) >= 100).length,
        driversBelowTarget: defRecords.filter((r) => r.score != null && Number(r.score) < 100).length,
      };
    });

    // Overall weighted score across all KPIs
    const totalDrivers = new Set(records.map((r) => r.driverId)).size;
    let overallWeightedSum = 0;
    let overallTotalWeight = 0;
    for (const r of records.filter((r) => r.score != null)) {
      const w = shiftCountMap.get(r.driverId) || 1;
      overallWeightedSum += Number(r.score) * w;
      overallTotalWeight += w;
    }
    const overallScore = overallTotalWeight > 0
      ? Math.round((overallWeightedSum / overallTotalWeight) * 100) / 100
      : 0;

    const summaryPayload = {
      totalDrivers,
      totalRecords: records.length,
      overallScore,
      kpis: kpiSummaries,
    };
    await cacheSet(cacheKey, summaryPayload, 300); // 5 minute TTL
    res.json(summaryPayload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /drivers - Per-driver KPI breakdown for a date range
router.get("/drivers", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { platform, dateFrom, dateTo, search, companyId } = req.query;

    const startDate = dateFrom ? new Date(dateFrom as string) : new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = dateTo ? new Date(dateTo as string) : new Date();
    endDate.setHours(23, 59, 59, 999);

    // Lazy-compute: if no KpiRecord rows for this date range, run compute now
    const existing = await prisma.kpiRecord.findFirst({
      where: { tenantId, date: { gte: startDate, lte: endDate } },
      select: { id: true },
    });
    if (!existing) {
      await computeKpisForRange(tenantId, startDate, endDate, platform as string | undefined);
      await cacheInvalidate(`kpi_summary:${tenantId}:*`);
    }

    // Get drivers
    const driverWhere: any = { tenantId, status: "ACTIVE" };
    if (platform) driverWhere.platform = platform;
    if (companyId) driverWhere.companyId = companyId as string;
    if (search) {
      driverWhere.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { phone: { contains: search as string } },
        { platformDriverId: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [drivers, totalDrivers] = await Promise.all([
      prisma.driver.findMany({
        where: driverWhere,
        skip, take: limit,
        orderBy: { name: "asc" },
        select: { id: true, name: true, platform: true, zone: true, companyId: true, company: { select: { name: true } } },
      }),
      prisma.driver.count({ where: driverWhere }),
    ]);

    // Get KPI records for these drivers
    const driverIds = drivers.map((d) => d.id);
    const records = await prisma.kpiRecord.findMany({
      where: {
        tenantId,
        driverId: { in: driverIds },
        date: { gte: startDate, lte: endDate },
      },
      include: {
        kpiDefinition: { select: { id: true, name: true, category: true, unit: true, target: true } },
      },
    });

    // Group records by driver
    const driverKpis = drivers.map((driver) => {
      const driverRecords = records.filter((r) => r.driverId === driver.id);
      const scores = driverRecords.filter((r) => r.score != null).map((r) => Number(r.score));
      const overallScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;

      // Group by KPI
      const kpis: Record<string, { name: string; value: number; target: number | null; score: number | null; unit: string }> = {};
      for (const rec of driverRecords) {
        const defName = rec.kpiDefinition.name;
        if (!kpis[defName]) {
          kpis[defName] = {
            name: defName,
            value: Number(rec.value),
            target: rec.target ? Number(rec.target) : (rec.kpiDefinition.target ? Number(rec.kpiDefinition.target) : null),
            score: rec.score ? Number(rec.score) : null,
            unit: rec.kpiDefinition.unit,
          };
        } else {
          // Average if multiple days
          kpis[defName].value = Math.round(((kpis[defName].value + Number(rec.value)) / 2) * 100) / 100;
          if (rec.score != null) {
            kpis[defName].score = kpis[defName].score != null
              ? Math.round(((kpis[defName].score! + Number(rec.score)) / 2) * 100) / 100
              : Number(rec.score);
          }
        }
      }

      return {
        ...driver,
        overallScore,
        kpis: Object.values(kpis),
        totalKpiRecords: driverRecords.length,
      };
    });

    res.json(paginatedResponse(driverKpis, totalDrivers, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Compute KPIs from existing data ────────────────────────────────────────

// POST /compute - Compute KPIs from existing attendance/order/shift data for a date
router.post("/compute", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { date: dateStr, platform: platformFilter } = req.body;
    const date = dateStr ? new Date(dateStr) : new Date();
    date.setHours(0, 0, 0, 0);

    const result = await computeKpisForDate(tenantId, date, platformFilter);
    await cacheInvalidate(`kpi_summary:${tenantId}:*`);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
