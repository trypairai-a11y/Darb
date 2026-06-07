import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { upload } from "../utils/upload";
import { parseAmericanaXlsx } from "../services/americanaXlsxParser";
import fs from "fs";
import { getAdapter } from "../adapters";
import {
  buildRevenueByStore,
  buildChainMix,
  buildHeadcountGap,
} from "../services/americanaRevenueService";
import {
  computeAmericanaLeaderboard,
  computeAmericanaBranchPerformance,
} from "../services/americanaPerformanceService";

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── Orders ──────────────────────────────────────────────────────────────────

// GET /orders - List AmericanaDailyOrders with filters, paginated
router.get("/orders", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { month, driverId, storeName } = req.query;
    const where: any = { tenantId };

    if (driverId) where.driverId = driverId;
    if (storeName) where.storeName = { contains: storeName as string, mode: "insensitive" };
    if (month) {
      // Match by month range to handle timezone offsets (same pattern as cash.ts)
      const monthStr = month as string; // "2026-03" or "2026-03-01"
      const parts = monthStr.split("-");
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1; // JS months are 0-indexed
      const startOfMonth = new Date(y, m, 1);
      startOfMonth.setDate(startOfMonth.getDate() - 1); // buffer for timezone
      const endOfMonth = new Date(y, m + 1, 1);
      endOfMonth.setDate(endOfMonth.getDate() + 1); // buffer for timezone
      where.month = { gte: startOfMonth, lt: endOfMonth };
    }

    const [data, total] = await Promise.all([
      prisma.americanaDailyOrders.findMany({
        where, skip, take: limit,
        orderBy: { month: "desc" },
        include: { driver: { select: { id: true, name: true, platform: true } } },
      }),
      prisma.americanaDailyOrders.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /orders/summary - Aggregate stats for a given month
router.get("/orders/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { month } = req.query;
    const where: any = { tenantId };

    if (month) {
      const monthStr = month as string;
      const parts = monthStr.split("-");
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      const startOfMonth = new Date(y, m, 1);
      startOfMonth.setDate(startOfMonth.getDate() - 1);
      const endOfMonth = new Date(y, m + 1, 1);
      endOfMonth.setDate(endOfMonth.getDate() + 1);
      where.month = { gte: startOfMonth, lt: endOfMonth };
    }

    const records = await prisma.americanaDailyOrders.findMany({
      where,
      select: { driverId: true, totalOrders: true, storeName: true },
    });

    const uniqueDrivers = new Set(records.map((r) => r.driverId));
    const totalOrders = records.reduce((sum, r) => sum + (r.totalOrders || 0), 0);
    const totalDrivers = uniqueDrivers.size;
    const avgOrdersPerDriver = totalDrivers > 0
      ? Math.round((totalOrders / totalDrivers) * 10) / 10
      : 0;

    // Store breakdown: orders per store
    const storeMap: Record<string, number> = {};
    for (const r of records) {
      const store = r.storeName || "Unknown";
      storeMap[store] = (storeMap[store] || 0) + (r.totalOrders || 0);
    }
    const storeBreakdown = Object.entries(storeMap)
      .map(([store, orders]) => ({ store, orders }))
      .sort((a, b) => b.orders - a.orders);

    res.json({
      totalDrivers,
      totalOrders,
      avgOrdersPerDriver,
      storeBreakdown,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /orders/:id - Single record with driver
router.get("/orders/:id", async (req: Request, res: Response) => {
  try {
    const record = await prisma.americanaDailyOrders.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { driver: true },
    });
    if (!record) { res.status(404).json({ error: "Order record not found" }); return; }
    res.json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /orders - Create
router.post("/orders", async (req: Request, res: Response) => {
  try {
    const allowed = ["driverId", "month", "chain", "chainId", "empId", "storeName", "storeId", "company", "position", "dailyOrders", "totalOrders", "source"] as const;
    const data: Record<string, unknown> = { tenantId: req.user!.tenantId };
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const record = await prisma.americanaDailyOrders.create({ data: data as any });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /orders/:id - Update
router.put("/orders/:id", async (req: Request, res: Response) => {
  try {
    const allowed = ["chain", "chainId", "empId", "storeName", "storeId", "company", "position", "dailyOrders", "totalOrders", "source"] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const record = await prisma.americanaDailyOrders.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data,
    });
    if (record.count === 0) { res.status(404).json({ error: "Order record not found" }); return; }
    const updated = await prisma.americanaDailyOrders.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Driver Summary ──────────────────────────────────────────────────────────

// GET /drivers/summary - Americana driver stats
router.get("/drivers/summary", async (req: Request, res: Response) => {
  try {
    const summary = await getAdapter("AMERICANA").getDriverSummary(req.user!.tenantId);
    res.json({
      totalDrivers: summary.totalDrivers ?? 0,
      activeDrivers: summary.activeDrivers ?? 0,
      avgOrdersPerDay: summary.avgDeliveriesPerDay ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Import ──────────────────────────────────────────────────────────────────

// POST /import - Parse uploaded Americana monthly XLSX file
router.post("/import", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const tenantId = req.user!.tenantId;
    const { month } = req.body;

    const buffer = fs.readFileSync(req.file.path);
    const rows = parseAmericanaXlsx(buffer);

    if (rows.length === 0) {
      res.status(400).json({ error: "No data rows found in file" });
      return;
    }

    // Determine month: prefer explicit body param, then auto-detected from headers
    let monthDate: Date;
    if (month) {
      const parts = (month as string).split("-");
      monthDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
    } else if (rows[0].detectedMonth) {
      monthDate = rows[0].detectedMonth;
    } else {
      monthDate = new Date();
      monthDate.setDate(1);
    }
    monthDate.setHours(0, 0, 0, 0);

    let imported = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        if (!row.empId) {
          errors.push(`Row missing Emp ID: ${row.driverName || "unknown"}`);
          continue;
        }

        // Look up driver by platformDriverId matching empId, or by name
        let driver = await prisma.driver.findFirst({
          where: {
            tenantId,
            platformDriverId: row.empId,
          },
        });

        if (!driver && row.driverName) {
          driver = await prisma.driver.findFirst({
            where: {
              tenantId,
              name: { equals: row.driverName, mode: "insensitive" },
            },
          });
        }

        if (!driver) {
          errors.push(`Driver not found: ${row.empId} (${row.driverName || "unknown"})`);
          continue;
        }

        await prisma.americanaDailyOrders.upsert({
          where: {
            tenantId_driverId_month: {
              tenantId,
              driverId: driver.id,
              month: monthDate,
            },
          },
          create: {
            tenantId,
            driverId: driver.id,
            month: monthDate,
            chain: row.chain,
            empId: row.empId,
            storeName: row.storeName,
            company: row.company,
            position: row.position,
            dailyOrders: row.dailyOrders,
            totalOrders: row.totalOrders,
            source: "XLSX_IMPORT",
          },
          update: {
            chain: row.chain,
            empId: row.empId,
            storeName: row.storeName,
            company: row.company,
            position: row.position,
            dailyOrders: row.dailyOrders,
            totalOrders: row.totalOrders,
            source: "XLSX_IMPORT",
          },
        });

        imported++;
      } catch (rowErr: any) {
        errors.push(`Error processing ${row.empId}: ${rowErr.message}`);
      }
    }

    res.json({ imported, total: rows.length, errors });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Overview (A4) ─────────────────────────────────────────────────────────

// GET /overview?month=YYYY-MM
router.get("/overview", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const monthStr = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const [y, m] = monthStr.split("-").map((v) => parseInt(v, 10));
    const month = new Date(y, m - 1, 1);
    const [revenueByStore, chainMix, headcountGap] = await Promise.all([
      buildRevenueByStore(tenantId, month),
      buildChainMix(tenantId, month),
      buildHeadcountGap(tenantId, month),
    ]);
    const missingRate = revenueByStore.some((r) => r.orders > 0 && r.rate == null);
    res.json({
      month: monthStr,
      revenueByStore,
      chainMix,
      headcountGap,
      missingRate,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Performance (A7) ─────────────────────────────────────────────────────

// GET /performance?month=YYYY-MM
router.get("/performance", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const monthStr = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const [y, m] = monthStr.split("-").map((v) => parseInt(v, 10));
    const entries = await computeAmericanaLeaderboard(tenantId, new Date(y, m - 1, 1));
    res.json({ month: monthStr, entries });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /branch-performance?month=YYYY-MM&threshold=0.8
// Per-branch averages with under-threshold drivers flagged.
router.get("/branch-performance", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const monthStr = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const [y, m] = monthStr.split("-").map((v) => parseInt(v, 10));
    const rawThreshold = parseFloat(String(req.query.threshold ?? "0.8"));
    const thresholdPct =
      Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 2
        ? rawThreshold
        : 0.8;
    const result = await computeAmericanaBranchPerformance(
      tenantId,
      new Date(y, m - 1, 1),
      { thresholdPct },
    );
    res.json({ month: monthStr, threshold: thresholdPct, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Driver 360 (A5) ──────────────────────────────────────────────────────

// GET /drivers/:id/monthly-grid?from=YYYY-MM&to=YYYY-MM
router.get("/drivers/:id/monthly-grid", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const driverId = req.params.id;
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 7);
    const [toY, toM] = to.split("-").map((v) => parseInt(v, 10));
    const toDate = new Date(toY, toM - 1, 1);

    let fromDate: Date;
    if (req.query.from) {
      const [fromY, fromM] = (req.query.from as string).split("-").map((v) => parseInt(v, 10));
      fromDate = new Date(fromY, fromM - 1, 1);
    } else {
      fromDate = new Date(toDate.getFullYear(), toDate.getMonth() - 5, 1);
    }

    const endDate = new Date(toDate.getFullYear(), toDate.getMonth() + 1, 1);
    const rows = await prisma.americanaDailyOrders.findMany({
      where: {
        tenantId, driverId,
        month: { gte: fromDate, lt: endDate },
      },
      orderBy: { month: "asc" },
      include: {
        storeRef: { select: { id: true, name: true, chain: { select: { name: true } } } },
      },
    });
    const grid = rows.map((r) => ({
      month: r.month.toISOString().slice(0, 7),
      storeName: r.storeRef?.name ?? r.storeName ?? null,
      chainName: r.storeRef?.chain?.name ?? r.chain ?? null,
      position: r.position,
      totalOrders: r.totalOrders,
      dailyOrders: r.dailyOrders,
    }));
    res.json(grid);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /drivers/:id/recent-attendance?days=14
router.get("/drivers/:id/recent-attendance", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const driverId = req.params.id;
    const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 14));
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    const rows = await prisma.attendanceRecord.findMany({
      where: { tenantId, driverId, date: { gte: since } },
      orderBy: { date: "desc" },
      take: days,
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Tenant-scoped Americana settings (A7 targets & tier weights) ─────────

// GET /settings/tenant
router.get("/settings/tenant", async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId }, select: { settings: true },
    });
    const s = (tenant?.settings as any)?.americana ?? {};
    res.json(s);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /settings/tenant — merges { americana: {...} } into tenant.settings
router.put("/settings/tenant", async (req: Request, res: Response) => {
  try {
    const body = req.body?.americana ?? req.body;
    const current = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId }, select: { settings: true },
    });
    const existing = (current?.settings as any) ?? {};
    const nextSettings = { ...existing, americana: { ...(existing.americana ?? {}), ...body } };
    const updated = await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: { settings: nextSettings },
      select: { settings: true },
    });
    res.json((updated.settings as any)?.americana ?? {});
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /drivers/:id/violations?status=OPEN
router.get("/drivers/:id/violations", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const driverId = req.params.id;
    const statusParam = req.query.status as string | undefined;
    const where: any = { tenantId, driverId, platform: "AMERICANA" };
    if (statusParam === "OPEN") where.violationStatus = { in: ["ESTABLISHED", "UNDER_REVIEW"] };
    else if (statusParam) where.violationStatus = statusParam;
    const violations = await prisma.violation.findMany({
      where,
      orderBy: { violationTime: "desc" },
      take: 100,
    });
    res.json(violations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
