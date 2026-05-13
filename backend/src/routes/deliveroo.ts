import { Router, Request, Response } from "express";
import fs from "fs";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { sendXlsx } from "../utils/xlsxExport";
import { parseLocalDate, parseLocalDateEnd } from "../utils/date";
import { upload } from "../utils/upload";
import { AiOcrService } from "../services/aiOcrService";
import { detectDeliverooUnassignedOrders } from "../services/violationEngine";
import { createViolationNotifications } from "../services/notificationService";
import { getAdapter } from "../adapters";
import { makeXlsxImportRoute } from "../services/ingest/xlsxRouteFactory";

const router = Router();
router.use(authMiddleware, tenantScope);

const MUTATORS = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];
const OCR_CONFIDENCE_THRESHOLD = 0.85;

// ─── Drivers Summary ────────────────────────────────────────────────────────

router.get("/drivers/summary", async (req: Request, res: Response) => {
  try {
    const summary = await getAdapter("DELIVEROO").getDriverSummary(req.user!.tenantId, {
      companyId: req.query.companyId as string | undefined,
    });
    // Preserve existing response shape for the Deliveroo frontend.
    res.json({
      total: summary.totalDrivers ?? 0,
      active: summary.activeDrivers ?? 0,
      inactive: summary.inactiveDrivers ?? 0,
      suspended: summary.suspendedDrivers ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Orders + Cash Summary ──────────────────────────────────────────────────

router.get("/orders/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo } = req.query;

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const start = dateFrom ? new Date(dateFrom as string) : sevenDaysAgo;
    const end = dateTo ? new Date(dateTo as string) : now;

    const [orderAgg, cashAgg, orderCount] = await Promise.all([
      prisma.orderLog.aggregate({
        where: { tenantId, platform: "DELIVEROO", date: { gte: start, lte: end } },
        _sum: { orderCount: true, totalAmount: true },
      }),
      prisma.cashRecord.aggregate({
        where: { tenantId, date: { gte: start, lte: end }, driver: { platform: "DELIVEROO" } },
        _sum: { salesAmount: true, collectionAmount: true, pendingDues: true },
      }),
      prisma.orderLog.count({
        where: { tenantId, platform: "DELIVEROO", date: { gte: start, lte: end } },
      }),
    ]);

    res.json({
      totalOrders: orderAgg._sum.orderCount || 0,
      totalRevenue: Number(orderAgg._sum.totalAmount || 0),
      totalCashCollected: Number(cashAgg._sum?.collectionAmount || 0),
      totalCashDeposited: Number(cashAgg._sum?.salesAmount || 0),
      pendingCash: Number(cashAgg._sum?.pendingDues || 0),
      recordCount: orderCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Orders List ────────────────────────────────────────────────────────────

router.get("/orders", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo, driverId } = req.query;
    const where: any = { tenantId, platform: "DELIVEROO" };
    if (driverId) where.driverId = driverId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom as string);
      if (dateTo) where.date.lte = new Date(dateTo as string);
    }

    const [data, total] = await Promise.all([
      prisma.orderLog.findMany({
        where, skip, take: limit,
        orderBy: { date: "desc" },
        include: { driver: { select: { id: true, name: true, platform: true } } },
      }),
      prisma.orderLog.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cash Records ───────────────────────────────────────────────────────────

router.get("/cash", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo, driverId } = req.query;
    const where: any = { tenantId, driver: { platform: "DELIVEROO" as const } };
    if (driverId) where.driverId = driverId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom as string);
      if (dateTo) where.date.lte = new Date(dateTo as string);
    }

    const [data, total] = await Promise.all([
      prisma.cashRecord.findMany({
        where, skip, take: limit,
        orderBy: { date: "desc" },
        include: { driver: { select: { id: true, name: true, platform: true } } },
      }),
      prisma.cashRecord.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Shifts Summary ─────────────────────────────────────────────────────────

router.get("/shifts/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [total, completed, missed, inProgress] = await Promise.all([
      prisma.shift.count({ where: { tenantId, platform: "DELIVEROO", date: { gte: startOfDay, lte: endOfDay } } }),
      prisma.shift.count({ where: { tenantId, platform: "DELIVEROO", date: { gte: startOfDay, lte: endOfDay }, status: "COMPLETED" } }),
      prisma.shift.count({ where: { tenantId, platform: "DELIVEROO", date: { gte: startOfDay, lte: endOfDay }, status: "MISSED" } }),
      prisma.shift.count({ where: { tenantId, platform: "DELIVEROO", date: { gte: startOfDay, lte: endOfDay }, status: "IN_PROGRESS" } }),
    ]);

    res.json({ total, completed, missed, inProgress, booked: total - completed - missed - inProgress });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Performance Dashboard ──────────────────────────────────────────────────

router.get("/performance", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      activeDrivers,
      totalOrders,
      avgShift,
      attendanceRecords,
    ] = await Promise.all([
      prisma.driver.count({ where: { tenantId, platform: "DELIVEROO", status: "ACTIVE" } }),
      prisma.orderLog.aggregate({
        where: { tenantId, platform: "DELIVEROO", date: { gte: sevenDaysAgo } },
        _sum: { orderCount: true },
      }),
      prisma.shift.aggregate({
        where: { tenantId, platform: "DELIVEROO", date: { gte: sevenDaysAgo }, status: "COMPLETED" },
        _avg: { actualHoursMinutes: true },
      }),
      prisma.attendanceRecord.findMany({
        where: { tenantId, date: { gte: sevenDaysAgo }, driver: { platform: "DELIVEROO" } },
        select: { status: true },
      }),
    ]);

    const presentCount = attendanceRecords.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
    const attendanceRate = attendanceRecords.length > 0 ? Math.round((presentCount / attendanceRecords.length) * 100) : 0;

    res.json({
      activeDrivers,
      totalOrdersWeek: totalOrders._sum.orderCount || 0,
      avgOrdersPerDriverPerDay: activeDrivers > 0
        ? Math.round(((totalOrders._sum.orderCount || 0) / (activeDrivers * 7)) * 10) / 10
        : 0,
      avgShiftHours: avgShift._avg.actualHoursMinutes
        ? Math.round((Number(avgShift._avg.actualHoursMinutes) / 60) * 10) / 10
        : 0,
      attendanceRate,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── D1 · Daily-metrics OCR ingestion ───────────────────────────────────────

/**
 * POST /api/deliveroo/metrics/ingest-screenshot
 * Multipart: image (required), driverId, shiftDate? (ISO date).
 * Extracts Deliveroo "My deliveries" totals via Claude Vision, writes a
 * DeliverooDailyMetrics row, and fires the unassigned-order violation engine
 * when applicable.
 */
router.post(
  "/metrics/ingest-screenshot",
  rbac(...MUTATORS, "DRIVER"),
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { driverId, shiftDate: shiftDateRaw } = req.body ?? {};

      if (!req.file) return res.status(400).json({ error: "image is required" });
      if (!driverId) return res.status(400).json({ error: "driverId is required" });

      const driver = await prisma.driver.findFirst({
        where: { id: driverId, tenantId, platform: "DELIVEROO" },
        select: { id: true, name: true, zone: true },
      });
      if (!driver) return res.status(404).json({ error: "Deliveroo driver not found" });

      const buffer = fs.readFileSync(req.file.path);
      const extracted = await AiOcrService.extractDeliverooMetrics(buffer);

      const confidence = extracted?.confidence ?? 0;

      // Validation: sum of hourly buckets must equal deliveriesCount
      const bucketSum = Array.isArray(extracted?.hourlyBuckets)
        ? extracted!.hourlyBuckets!.reduce((s, n) => s + (Number(n) || 0), 0)
        : null;
      const deliveries = extracted?.deliveriesCount ?? null;
      const bucketsValid =
        bucketSum != null && deliveries != null && bucketSum === deliveries;

      const status =
        !extracted ||
        confidence < OCR_CONFIDENCE_THRESHOLD ||
        deliveries == null ||
        extracted.codCollectedKwd == null ||
        !bucketsValid ||
        (extracted.unassignedCount != null && extracted.unassignedCount < 0)
          ? "PENDING_REVIEW"
          : "PARSED";

      const shiftDate = shiftDateRaw
        ? parseLocalDate(shiftDateRaw)
        : extracted?.shiftDate
          ? parseLocalDate(extracted.shiftDate)
          : (() => {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              return d;
            })();

      const source = req.user!.role === "DRIVER" ? "OCR_MOBILE" : "OCR_WEB";
      const unassigned = extracted?.unassignedCount ?? 0;

      const row = await prisma.deliverooDailyMetrics.upsert({
        where: { tenantId_driverId_shiftDate: { tenantId, driverId, shiftDate } },
        create: {
          tenantId,
          driverId,
          shiftDate,
          codCollectedKwd: (extracted?.codCollectedKwd ?? 0).toString(),
          tipsKwd: (extracted?.tipsKwd ?? 0).toString(),
          deliveriesCount: deliveries ?? 0,
          unassignedCount: unassigned,
          hourlyBuckets: (extracted?.hourlyBuckets ?? []) as any,
          source,
          status,
          rawImageUrl: `/uploads/${req.file.filename}`,
          ocrConfidence: confidence,
          ocrRaw: extracted as any,
        },
        update: {
          codCollectedKwd:
            extracted?.codCollectedKwd != null
              ? extracted.codCollectedKwd.toString()
              : undefined,
          tipsKwd:
            extracted?.tipsKwd != null ? extracted.tipsKwd.toString() : undefined,
          deliveriesCount: deliveries ?? undefined,
          unassignedCount: unassigned,
          hourlyBuckets: (extracted?.hourlyBuckets ?? []) as any,
          source,
          status,
          rawImageUrl: `/uploads/${req.file.filename}`,
          ocrConfidence: confidence,
          ocrRaw: extracted as any,
        },
      });

      // Fire unassigned-order violation engine when PARSED and unassigned > 0
      if (status === "PARSED" && unassigned > 0) {
        detectDeliverooUnassignedOrders({ tenantId, metricId: row.id }).catch(
          () => {}
        );
      }

      if (status === "PENDING_REVIEW") {
        await createViolationNotifications({
          tenantId,
          eventType: "OCR_PENDING_REVIEW",
          severity: "MEDIUM",
          title: "Deliveroo screenshot needs review",
          message: `OCR confidence ${(confidence * 100).toFixed(0)}% for ${driver.name} — please verify`,
          sourceId: row.id,
          metadata: {
            category: "OPS_TODO",
            titleAr: "لقطة شاشة ديليفرو بحاجة إلى مراجعة",
            bodyAr: `ثقة OCR ${(confidence * 100).toFixed(0)}% للسائق ${driver.name} — يرجى التحقق`,
            driverId,
            metricId: row.id,
          },
        }).catch((err) => { logger.warn({ err }, "deliveroo OCR review notification failed"); });
      }

      res.json({
        status,
        extracted,
        metricId: row.id,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── D5 · Daily metrics list + cash ledger ──────────────────────────────────

/**
 * GET /api/deliveroo/metrics?from&to&driverId&status
 * Paginated DeliverooDailyMetrics with driver info.
 */
router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { from, to, driverId, status } = req.query;

    const where: any = { tenantId };
    if (driverId) where.driverId = driverId as string;
    if (status) where.status = status as string;
    if (from || to) {
      where.shiftDate = {};
      if (from) where.shiftDate.gte = parseLocalDate(from as string);
      if (to) where.shiftDate.lte = parseLocalDateEnd(to as string);
    }

    const [data, total] = await Promise.all([
      prisma.deliverooDailyMetrics.findMany({
        where,
        skip,
        take: limit,
        orderBy: { shiftDate: "desc" },
        include: {
          driver: { select: { id: true, name: true, phone: true, zone: true } },
        },
      }),
      prisma.deliverooDailyMetrics.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/deliveroo/cash/daily?from&to&driverId
 * Per-driver-per-day COD + tips ledger from DeliverooDailyMetrics.
 */
router.get("/cash/daily", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { from, to, driverId } = req.query;

    const where: any = { tenantId, status: { in: ["PARSED", "APPROVED"] } };
    if (driverId) where.driverId = driverId as string;
    if (from || to) {
      where.shiftDate = {};
      if (from) where.shiftDate.gte = parseLocalDate(from as string);
      if (to) where.shiftDate.lte = parseLocalDateEnd(to as string);
    }

    const [rows, total] = await Promise.all([
      prisma.deliverooDailyMetrics.findMany({
        where,
        skip,
        take: limit,
        orderBy: { shiftDate: "desc" },
        include: {
          driver: { select: { id: true, name: true, phone: true, zone: true } },
        },
      }),
      prisma.deliverooDailyMetrics.count({ where }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      shiftDate: r.shiftDate,
      status: r.status,
      driver: r.driver,
      codCollectedKwd: Number(r.codCollectedKwd),
      tipsKwd: Number(r.tipsKwd),
      totalKwd: Number(r.codCollectedKwd) + Number(r.tipsKwd),
      deliveriesCount: r.deliveriesCount,
      unassignedCount: r.unassignedCount,
    }));

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/deliveroo/cash/export?from&to
 * CSV export of the Deliveroo cash ledger.
 */
router.get("/cash/export", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { from, to } = req.query;
    const where: any = { tenantId, status: { in: ["PARSED", "APPROVED"] } };
    if (from || to) {
      where.shiftDate = {};
      if (from) where.shiftDate.gte = parseLocalDate(from as string);
      if (to) where.shiftDate.lte = parseLocalDateEnd(to as string);
    }

    const rows = await prisma.deliverooDailyMetrics.findMany({
      where,
      take: 5000,
      orderBy: { shiftDate: "desc" },
      include: { driver: { select: { name: true, platformDriverId: true, zone: true } } },
    });

    const out = rows.map((r) => ({
      Date: new Date(r.shiftDate).toLocaleDateString(),
      "Driver Name": r.driver.name,
      "Driver ID": r.driver.platformDriverId || "",
      Zone: r.driver.zone || "",
      "COD Collected (KD)": Number(r.codCollectedKwd),
      "Tips (KD)": Number(r.tipsKwd),
      "Total (KD)": Number(r.codCollectedKwd) + Number(r.tipsKwd),
      Deliveries: r.deliveriesCount,
      Unassigned: r.unassignedCount,
    }));

    sendXlsx(res, out, "Deliveroo Cash", "deliveroo-cash.xlsx");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Export ─────────────────────────────────────────────────────────────────

router.get("/export/orders", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { dateFrom, dateTo } = req.query;
    const where: any = { tenantId, platform: "DELIVEROO" };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom as string);
      if (dateTo) where.date.lte = new Date(dateTo as string);
    }

    const orders = await prisma.orderLog.findMany({
      where,
      take: 5000,
      orderBy: { date: "desc" },
      include: { driver: { select: { name: true, platformDriverId: true } } },
    });

    const rows = orders.map((o) => ({
      Date: new Date(o.date).toLocaleDateString(),
      "Driver Name": o.driver.name,
      "Driver ID": o.driver.platformDriverId || "",
      "Order Count": o.orderCount,
      "Total Amount": Number(o.totalAmount),
    }));

    sendXlsx(res, rows, "Deliveroo Orders", "deliveroo-orders.xlsx");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 6 / REQ-ingest-adapter-layer ─────────────────────────────────────
// POST /api/deliveroo/import — XLSX-fallback ingest per CON-xlsx-fallback.
// Mirrors the Talabat /import shape via makeXlsxImportRoute('DELIVEROO')
// + DeliverooXlsxAdapter (services/ingest/deliveroo/xlsx.ts).
//
// Auth + tenantScope inherited from router.use at file top.
// Response shape: { success: true, rowsIn, rowsOk, errors[] }.
// Failure: HTTP 400 + { error } on malformed headers or driver mismatch.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/import", upload.single("file"), makeXlsxImportRoute("DELIVEROO"));

export default router;
