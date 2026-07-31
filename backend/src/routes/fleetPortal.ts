// Darb 2.0 PRD §9 — fleet-partner portal (/api/fleet). FLEET-role JWT only;
// fleetPartnerId always comes from the token, never the client (mirror of
// vendorPortal). Containment: middleware/fleetContainment fences FLEET
// tokens to /api/auth + /api/fleet + /api/events.

import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { fleetScope } from "../middleware/fleetScope";
import { getFleetScorecard } from "../services/fleetService";
import { getDriverRating } from "../services/ratingService";
import { parseLocalDate, parseLocalDateEnd } from "../utils/date";
import { presignPutUrl, presignGetUrl } from "../services/r2Service";
import {
  COMPANY_DOC_TYPES,
  isCompanyDocType,
  isDriverDocType,
  isStorageConfigured,
} from "../services/fleet/fleetDocumentService";
import {
  createFleetRequest,
  REQUESTABLE_STATUSES,
} from "../services/fleet/fleetRequestService";
import {
  rosterActivity,
  driverMonthActivity,
} from "../services/fleet/fleetActivityService";

const router = Router();
// ADMIN is admitted only so fleetScope can decide: it lets an admin read a
// named partner's portal and refuses everything else. See fleetScope.
router.use(authMiddleware, tenantScope, rbac("FLEET", "ADMIN"), fleetScope);

/**
 * Resolve which fleet partner this request is acting as.
 *
 * Client revision #15/#27: Sidra, Marina and Nakheel share owners, and they
 * asked for one login across all of them rather than logging out and back in
 * per company. A user carrying an ownerGroupId may act as any partner in that
 * group; the active one arrives as ?fleetPartnerId= or the X-Fleet-Partner
 * header and is ALWAYS validated against the group before use, so the request
 * can widen its scope only to companies the same owner already controls.
 *
 * A user with no ownerGroupId behaves exactly as before: pinned to the single
 * fleetPartnerId baked into its token.
 */
async function fleetContext(
  req: Request,
): Promise<{ tenantId: string; fleetPartnerId: string } | null> {
  const { tenantId } = req.user!;
  const tokenPartnerId = (req.user as { fleetPartnerId?: string }).fleetPartnerId;
  const ownerGroupId = (req.user as { ownerGroupId?: string }).ownerGroupId;

  if (!ownerGroupId) {
    if (!tokenPartnerId) return null;
    return { tenantId, fleetPartnerId: tokenPartnerId };
  }

  const allowed = await prisma.fleetPartner.findMany({
    where: { tenantId, ownerGroupId },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  const allowedIds = new Set(allowed.map((f) => f.id));
  if (allowedIds.size === 0) {
    if (!tokenPartnerId) return null;
    return { tenantId, fleetPartnerId: tokenPartnerId };
  }

  const requested =
    (typeof req.query.fleetPartnerId === "string" ? req.query.fleetPartnerId : undefined) ??
    (typeof req.headers["x-fleet-partner"] === "string"
      ? (req.headers["x-fleet-partner"] as string)
      : undefined);

  if (requested && allowedIds.has(requested)) {
    return { tenantId, fleetPartnerId: requested };
  }
  // An unknown or out-of-group request falls back to the token's own partner
  // rather than erroring, so a stale switcher selection cannot lock anyone out.
  if (tokenPartnerId && allowedIds.has(tokenPartnerId)) {
    return { tenantId, fleetPartnerId: tokenPartnerId };
  }
  return { tenantId, fleetPartnerId: allowed[0].id };
}

/**
 * @swagger
 * /api/fleet/companies:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Fleet partners this login may switch between (revision #15/#27)
 */
router.get("/companies", async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const ownerGroupId = (req.user as { ownerGroupId?: string }).ownerGroupId;
    const tokenPartnerId = (req.user as { fleetPartnerId?: string }).fleetPartnerId;

    const partners = ownerGroupId
      ? await prisma.fleetPartner.findMany({
          where: { tenantId, ownerGroupId },
          select: { id: true, name: true, disciplineStatus: true },
          orderBy: { name: "asc" },
        })
      : tokenPartnerId
        ? await prisma.fleetPartner.findMany({
            where: { tenantId, id: tokenPartnerId },
            select: { id: true, name: true, disciplineStatus: true },
          })
        : [];

    const ctx = await fleetContext(req);
    res.json({ activeFleetPartnerId: ctx?.fleetPartnerId ?? null, partners });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/me:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet partner's own profile + commitments
 */
router.get("/me", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const fleet = await prisma.fleetPartner.findFirst({
      where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
      select: {
        id: true, name: true, contactName: true, contactPhone: true, contactEmail: true,
        flatFeePerOrderKwd: true, minOnlineHoursPerDay: true, minDriversOnline: true,
        disciplineStatus: true, isActive: true, createdAt: true,
      },
    });
    if (!fleet) { res.status(404).json({ error: "Fleet partner not found" }); return; }
    res.json(fleet);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Roster — the fleet's own drivers with doc statuses and ratings
 */
router.get("/drivers", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const drivers = await prisma.driver.findMany({
      where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
      select: {
        id: true, name: true, phone: true, status: true, vehicleType: true,
        performanceTier: true, throttledUntil: true,
        civilIdStatus: true, civilIdExpiry: true,
        drivingLicenseStatus: true, drivingLicenseExpiry: true,
        vehicleRegStatus: true, vehicleRegExpiry: true,
        healthCertStatus: true, healthCertExpiry: true,
      },
      orderBy: { name: "asc" },
    });
    // Revision 12 — the roster carries how much work each driver actually did.
    // `rosterActivity` is one grouped read for the whole fleet, not a query per
    // driver: the ratings loop below is already the expensive part.
    const [ratings, activity, pendingOnboards] = await Promise.all([
      Promise.all(drivers.map((d) => getDriverRating(ctx.tenantId, d.id))),
      rosterActivity(ctx.tenantId, ctx.fleetPartnerId),
      prisma.fleetChangeRequest.findMany({
        where: {
          tenantId: ctx.tenantId,
          fleetPartnerId: ctx.fleetPartnerId,
          type: "DRIVER_ONBOARD",
          status: "PENDING",
        },
        select: { id: true, payload: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json([
      // A driver Darb has not approved yet has no Driver row, so it is drawn
      // from its own request. The fleet asked for them and needs to see that
      // the ask is sitting somewhere, not that it vanished.
      ...pendingOnboards.map((r) => {
        const p = (r.payload ?? {}) as Record<string, any>;
        return {
          id: `pending:${r.id}`,
          requestId: r.id,
          pending: true,
          name: p.name ?? "",
          phone: p.phone ?? "",
          status: "PENDING_REVIEW",
          vehicleType: p.vehicleType ?? "MOTORCYCLE",
          performanceTier: null,
          throttledUntil: null,
          civilIdStatus: null, civilIdExpiry: null,
          drivingLicenseStatus: null, drivingLicenseExpiry: null,
          vehicleRegStatus: null, vehicleRegExpiry: null,
          healthCertStatus: null, healthCertExpiry: null,
          rating: { avg: null, count: 0 },
          ordersToday: 0,
          ordersLast7d: 0,
          submittedAt: r.createdAt,
        };
      }),
      ...drivers.map((d, i) => ({
        ...d,
        pending: false,
        rating: ratings[i],
        ordersToday: activity.get(d.id)?.ordersToday ?? 0,
        ordersLast7d: activity.get(d.id)?.ordersLast7d ?? 0,
      })),
    ]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/scorecard:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet's own performance scorecard (default: last 30 days)
 */
router.get("/scorecard", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    // Inclusive calendar days, same contract as /api/fleets/:id/scorecard:
    // the scorecard queries are `lt: to`, so a date-only `to` has to become
    // that day's end or the partner's "today" reads as an empty day.
    const to =
      typeof req.query.to === "string" ? parseLocalDateEnd(req.query.to) : new Date();
    const from =
      typeof req.query.from === "string"
        ? parseLocalDate(req.query.from)
        : new Date(to.getTime() - 30 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      res.status(400).json({ error: "`from` and `to` must be YYYY-MM-DD dates, `from` first" });
      return;
    }
    const scorecard = await getFleetScorecard(ctx.tenantId, ctx.fleetPartnerId, { from, to });
    res.json(scorecard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/statements:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet's monthly payout statements
 */
router.get("/statements", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const rows = await prisma.fleetPayoutStatement.findMany({
      where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
      orderBy: { periodStart: "desc" },
      take: 24,
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/earnings:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Per-order earnings for a month (delivered orders x flat fee)
 */
router.get("/earnings", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }

    const month = typeof req.query.month === "string" ? req.query.month : null;
    const m = month ? /^(\d{4})-(\d{2})$/.exec(month) : null;
    const now = new Date();
    const start = m
      ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

    const [fleet, orders] = await Promise.all([
      prisma.fleetPartner.findFirst({
        where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
        select: { flatFeePerOrderKwd: true },
      }),
      prisma.deliveryOrder.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: "DELIVERED",
          deliveredAt: { gte: start, lt: end },
          driver: { fleetPartnerId: ctx.fleetPartnerId },
        },
        select: {
          id: true, orderNumber: true, deliveredAt: true,
          driver: { select: { id: true, name: true } },
        },
        orderBy: { deliveredAt: "desc" },
        take: 1000,
      }),
    ]);

    const fee = Number(fleet?.flatFeePerOrderKwd ?? 1.1);
    res.json({
      periodStart: start,
      periodEnd: end,
      feePerOrderKwd: fee.toFixed(3),
      deliveredOrders: orders.length,
      totalKwd: (orders.length * fee).toFixed(3),
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        deliveredAt: o.deliveredAt,
        driverName: o.driver?.name ?? null,
        feeKwd: fee.toFixed(3),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Revision 12: the request desk ──────────────────────────────────────────
//
// Everything below either reads the fleet's own records or opens a request for
// Darb to review. The ONE thing that writes a live record is PATCH
// /drivers/:id/phone, and it is marked as such where it is defined.
//
// fleetScope already fences an inspecting ADMIN to GET, so none of the writes
// here need to re-check the role: a non-FLEET caller cannot reach them.

/** Shared 403 for a driver that is not this fleet's to touch. */
async function ownDriverOr404(
  ctx: { tenantId: string; fleetPartnerId: string },
  driverId: string,
) {
  return prisma.driver.findFirst({
    where: { id: driverId, tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
  });
}

/**
 * @swagger
 * /api/fleet/documents:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The delivery company's own documents (revision 12)
 */
router.get("/documents", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const docs = await prisma.fleetDocument.findMany({
      where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId, driverId: null },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    });
    res.json({
      documents: docs,
      requiredTypes: COMPANY_DOC_TYPES,
      storageConfigured: isStorageConfigured(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/documents/upload-url:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Presigned R2 PUT for a document (revision 12)
 *     description: >
 *       Fails closed with STORAGE_NOT_CONFIGURED rather than 500 when R2 is
 *       not wired up, so the portal can say so plainly instead of showing a
 *       file picker that dies. Same posture as WhatsApp and the payment
 *       gateway elsewhere in this codebase.
 */
router.post("/documents/upload-url", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    if (!isStorageConfigured()) {
      res.status(503).json({
        error: "Document upload is not switched on yet. Contact Darb operations.",
        code: "STORAGE_NOT_CONFIGURED",
      });
      return;
    }

    const { type, contentType, fileName } = req.body as {
      type?: string; contentType?: string; fileName?: string;
    };
    if (!type || (!isCompanyDocType(type) && !isDriverDocType(type))) {
      res.status(400).json({ error: "Unknown document type" });
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!contentType || !allowed.includes(contentType)) {
      res.status(400).json({ error: "File must be a JPEG, PNG, WEBP or PDF" });
      return;
    }

    // The tenant prefix is the cross-tenant isolation boundary: even a leaked
    // presigned URL can only write inside the issuing tenant's own space.
    const ext = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1];
    const key = `${ctx.tenantId}/fleet/${ctx.fleetPartnerId}/${type}/${Date.now()}.${ext}`;
    const url = await presignPutUrl(key, contentType, 300);
    res.json({ url, key, fileName: fileName ?? null, expiresInSec: 300 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/documents/{id}/url:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Short-lived signed GET for a document the fleet owns
 */
router.get("/documents/:id/url", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const doc = await prisma.fleetDocument.findFirst({
      where: { id: req.params.id, tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
      select: { fileKey: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (!doc.fileKey) { res.status(404).json({ error: "No file on this document" }); return; }
    res.json({ url: await presignGetUrl(doc.fileKey, 3600) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Validate + normalise one document submission from the client.
 *
 * Returns both fields optional rather than a discriminated union: ts-jest
 * compiles this file with its own settings and did not narrow the union, so
 * the shape that works everywhere is the one that needs no narrowing.
 */
interface DocInputResult {
  value?: {
    type: string;
    fileKey: string | null;
    fileName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    expiryDate: Date | null;
  };
  error?: string;
}

function readDocInput(body: any): DocInputResult {
  const { type, fileKey, fileName, mimeType, sizeBytes, expiryDate } = body ?? {};
  if (!type || (!isCompanyDocType(type) && !isDriverDocType(type))) {
    return { error: "Unknown document type" };
  }
  if (!fileKey && !expiryDate) {
    return { error: "Give a file or an expiry date" };
  }
  const expiry = expiryDate ? new Date(expiryDate) : null;
  if (expiry && Number.isNaN(expiry.getTime())) {
    return { error: "expiryDate must be a date" };
  }
  return {
    value: {
      type,
      fileKey: fileKey ?? null,
      fileName: fileName ?? null,
      mimeType: mimeType ?? null,
      sizeBytes: typeof sizeBytes === "number" ? sizeBytes : null,
      expiryDate: expiry,
    },
  };
}

/**
 * @swagger
 * /api/fleet/documents:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Record a company document after upload and open a request
 */
router.post("/documents", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const parsed = readDocInput(req.body);
    if (!parsed.value) { res.status(400).json({ error: parsed.error }); return; }
    if (!isCompanyDocType(parsed.value.type)) {
      res.status(400).json({ error: "That is a driver document. Upload it from the driver's profile." });
      return;
    }

    const fleet = await prisma.fleetPartner.findFirst({
      where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
      select: { name: true },
    });

    const doc = await prisma.fleetDocument.create({
      data: {
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        driverId: null,
        ...parsed.value,
        uploadedById: req.user!.userId,
      },
    });
    const request = await createFleetRequest({
      tenantId: ctx.tenantId,
      fleetPartnerId: ctx.fleetPartnerId,
      type: "COMPANY_DOCUMENT",
      payload: { documentType: parsed.value.type },
      documentIds: [doc.id],
      requestedById: req.user!.userId,
      fleetName: fleet?.name,
    });
    res.status(201).json({ document: doc, requestId: request.id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers/{id}:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: One driver's profile — details, documents, activity, open requests
 */
router.get("/drivers/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const driver = await ownDriverOr404(ctx, req.params.id);
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

    const [rating, documents, requests, issues, activity] = await Promise.all([
      getDriverRating(ctx.tenantId, driver.id),
      prisma.fleetDocument.findMany({
        where: { tenantId: ctx.tenantId, driverId: driver.id },
        orderBy: [{ type: "asc" }, { createdAt: "desc" }],
      }),
      prisma.fleetChangeRequest.findMany({
        where: { tenantId: ctx.tenantId, driverId: driver.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.fleetIssue.findMany({
        where: { tenantId: ctx.tenantId, driverId: driver.id, status: { not: "RESOLVED" } },
        orderBy: { openedAt: "desc" },
      }),
      driverMonthActivity(
        ctx.tenantId,
        driver.id,
        typeof req.query.month === "string" ? req.query.month : "",
      ),
    ]);

    res.json({
      driver: {
        id: driver.id, name: driver.name, phone: driver.phone,
        driverCode: driver.driverCode, status: driver.status,
        vehicleType: driver.vehicleType, zone: driver.zone,
        hireDate: driver.hireDate, performanceTier: driver.performanceTier,
        throttledUntil: driver.throttledUntil,
        civilIdExpiry: driver.civilIdExpiry, civilIdStatus: driver.civilIdStatus,
        drivingLicenseExpiry: driver.drivingLicenseExpiry, drivingLicenseStatus: driver.drivingLicenseStatus,
        vehicleRegExpiry: driver.vehicleRegExpiry, vehicleRegStatus: driver.vehicleRegStatus,
        vehicleInsuranceExpiry: driver.vehicleInsuranceExpiry, vehicleInsuranceStatus: driver.vehicleInsuranceStatus,
        healthCertExpiry: driver.healthCertExpiry, healthCertStatus: driver.healthCertStatus,
        workPermitExpiry: driver.workPermitExpiry, workPermitStatus: driver.workPermitStatus,
        foodHandlingCertExpiry: driver.foodHandlingCertExpiry, foodHandlingCertStatus: driver.foodHandlingCertStatus,
      },
      rating,
      documents,
      requests,
      issues,
      activity,
      storageConfigured: isStorageConfigured(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers/{id}/activity:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Day-by-day delivered order counts for one month
 */
router.get("/drivers/:id/activity", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const driver = await ownDriverOr404(ctx, req.params.id);
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
    res.json(
      await driverMonthActivity(
        ctx.tenantId,
        driver.id,
        typeof req.query.month === "string" ? req.query.month : "",
      ),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Put a driver forward for Darb approval (revision 12)
 *     description: >
 *       Creates NO Driver row. The row is created when Darb approves, which is
 *       what stops a rejected submission leaving a half-driver in the dispatch
 *       candidate pool.
 */
router.post("/drivers", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }

    const { name, phone, vehicleType, zone, hireDate, documents } = req.body as {
      name?: string; phone?: string; vehicleType?: string; zone?: string;
      hireDate?: string; documents?: any[];
    };
    if (!name || name.trim().length < 2) {
      res.status(400).json({ error: "Driver name is required" });
      return;
    }
    if (!phone || phone.trim().length < 8) {
      res.status(400).json({ error: "Driver phone is required" });
      return;
    }
    if (vehicleType !== "CAR" && vehicleType !== "MOTORCYCLE") {
      res.status(400).json({ error: "Vehicle must be CAR or MOTORCYCLE" });
      return;
    }

    // A phone already on the road is almost always the same person submitted
    // twice, and two Driver rows with one number breaks the app login.
    const clash = await prisma.driver.findFirst({
      where: { tenantId: ctx.tenantId, phone: phone.trim() },
      select: { id: true },
    });
    if (clash) {
      res.status(409).json({ error: "A driver with that phone number already exists" });
      return;
    }

    const docInputs: any[] = [];
    for (const raw of Array.isArray(documents) ? documents : []) {
      const parsed = readDocInput(raw);
      if (!parsed.value) { res.status(400).json({ error: parsed.error }); return; }
      if (!isDriverDocType(parsed.value.type)) {
        res.status(400).json({ error: `${parsed.value.type} is a company document` });
        return;
      }
      docInputs.push(parsed.value);
    }

    const fleet = await prisma.fleetPartner.findFirst({
      where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
      select: { name: true },
    });

    // driverId stays null on these until approval creates the driver.
    const created = await Promise.all(
      docInputs.map((d) =>
        prisma.fleetDocument.create({
          data: {
            tenantId: ctx.tenantId,
            fleetPartnerId: ctx.fleetPartnerId,
            driverId: null,
            ...d,
            uploadedById: req.user!.userId,
          },
        }),
      ),
    );

    const request = await createFleetRequest({
      tenantId: ctx.tenantId,
      fleetPartnerId: ctx.fleetPartnerId,
      type: "DRIVER_ONBOARD",
      payload: {
        name: name.trim(),
        phone: phone.trim(),
        vehicleType,
        zone: zone ?? null,
        hireDate: hireDate ?? null,
      },
      documentIds: created.map((d) => d.id),
      requestedById: req.user!.userId,
      fleetName: fleet?.name,
    });

    res.status(201).json({ request, documents: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers/{id}/requests:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Ask Darb for a status, details or document change on a driver
 */
router.post("/drivers/:id/requests", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const driver = await ownDriverOr404(ctx, req.params.id);
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

    const { type } = req.body as { type?: string };
    const fleet = await prisma.fleetPartner.findFirst({
      where: { id: ctx.fleetPartnerId, tenantId: ctx.tenantId },
      select: { name: true },
    });

    if (type === "DRIVER_STATUS") {
      const { status, reason } = req.body as { status?: string; reason?: string };
      if (!status || !(REQUESTABLE_STATUSES as readonly string[]).includes(status)) {
        res.status(400).json({ error: `status must be one of ${REQUESTABLE_STATUSES.join(", ")}` });
        return;
      }
      const request = await createFleetRequest({
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        type: "DRIVER_STATUS",
        driverId: driver.id,
        payload: { status, reason: reason ?? null, driverName: driver.name },
        requestedById: req.user!.userId,
        fleetName: fleet?.name,
      });
      res.status(201).json(request);
      return;
    }

    if (type === "DRIVER_PROFILE") {
      const { name, vehicleType, zone } = req.body as {
        name?: string; vehicleType?: string; zone?: string;
      };
      if (!name && !vehicleType && zone === undefined) {
        res.status(400).json({ error: "Nothing to change" });
        return;
      }
      const request = await createFleetRequest({
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        type: "DRIVER_PROFILE",
        driverId: driver.id,
        payload: { name, vehicleType, zone, driverName: driver.name },
        requestedById: req.user!.userId,
        fleetName: fleet?.name,
      });
      res.status(201).json(request);
      return;
    }

    if (type === "DRIVER_DOCUMENT") {
      // `type` on this endpoint names the KIND of request, so the document's
      // own type arrives as `documentType`. Reading `type` here would label
      // every driver document "DRIVER_DOCUMENT".
      const parsed = readDocInput({ ...req.body, type: req.body?.documentType });
      if (!parsed.value) { res.status(400).json({ error: parsed.error }); return; }
      if (!isDriverDocType(parsed.value.type)) {
        res.status(400).json({ error: `${parsed.value.type} is a company document` });
        return;
      }
      const doc = await prisma.fleetDocument.create({
        data: {
          tenantId: ctx.tenantId,
          fleetPartnerId: ctx.fleetPartnerId,
          driverId: driver.id,
          ...parsed.value,
          uploadedById: req.user!.userId,
        },
      });
      const request = await createFleetRequest({
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        type: "DRIVER_DOCUMENT",
        driverId: driver.id,
        payload: { documentType: parsed.value.type, driverName: driver.name },
        documentIds: [doc.id],
        requestedById: req.user!.userId,
        fleetName: fleet?.name,
      });
      res.status(201).json({ request, document: doc });
      return;
    }

    res.status(400).json({ error: "type must be DRIVER_STATUS, DRIVER_PROFILE or DRIVER_DOCUMENT" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/drivers/{id}/phone:
 *   patch:
 *     tags: [Fleet Portal]
 *     summary: The ONE direct write in this portal (revision 12)
 *     description: >
 *       Every other change a delivery company makes is a request Darb reviews.
 *       The phone number is the exception, decided by the client: drivers change
 *       SIMs constantly and a review queue between a driver and their own number
 *       strands them. The cost is real and deliberate — phone is the driver
 *       app's sign-in identity, so this can log a driver out of the app.
 */
router.patch("/drivers/:id/phone", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const driver = await ownDriverOr404(ctx, req.params.id);
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

    const { phone } = req.body as { phone?: string };
    if (!phone || phone.trim().length < 8) {
      res.status(400).json({ error: "A phone number of at least 8 digits is required" });
      return;
    }
    const clash = await prisma.driver.findFirst({
      where: { tenantId: ctx.tenantId, phone: phone.trim(), id: { not: driver.id } },
      select: { id: true },
    });
    if (clash) {
      res.status(409).json({ error: "Another driver already has that phone number" });
      return;
    }

    const updated = await prisma.driver.update({
      where: { id: driver.id },
      data: { phone: phone.trim() },
      select: { id: true, name: true, phone: true },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/requests:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet's own submissions and what Darb decided
 */
router.get("/requests", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await prisma.fleetChangeRequest.findMany({
      where: {
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        ...(status ? { status: status as any } : {}),
      },
      include: { driver: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/requests/{id}/withdraw:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Pull a request back before Darb has decided
 */
router.post("/requests/:id/withdraw", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const claimed = await prisma.fleetChangeRequest.updateMany({
      where: {
        id: req.params.id,
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        status: "PENDING",
      },
      data: { status: "WITHDRAWN" },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "That request has already been decided" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/issues:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: Delivery issues Darb has raised against this fleet (revision 12)
 */
router.get("/issues", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const includeResolved = req.query.includeResolved === "true";
    const rows = await prisma.fleetIssue.findMany({
      where: {
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        ...(includeResolved ? {} : { status: { not: "RESOLVED" } }),
      },
      include: { driver: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }],
      take: 200,
    });
    const openCount = rows.filter((r) => r.status !== "RESOLVED").length;
    res.json({ issues: rows, openCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/issues/{id}/acknowledge:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: The supervisor takes ownership of an issue
 */
router.post("/issues/:id/acknowledge", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const claimed = await prisma.fleetIssue.updateMany({
      where: {
        id: req.params.id,
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        status: { in: ["OPEN", "ESCALATED"] },
      },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        acknowledgedById: req.user!.userId,
      },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "That issue is not open" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/issues/{id}/resolve:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Close an issue with an account of what was done
 *     description: >
 *       The note is required. An acknowledge button with no account of the fix
 *       is a button that gets clicked to clear a badge, and the point of this
 *       tab is that somebody actually called the driver.
 */
router.post("/issues/:id/resolve", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const { note } = req.body as { note?: string };
    if (!note || note.trim().length < 5) {
      res.status(400).json({ error: "Say what you did to resolve it" });
      return;
    }
    const claimed = await prisma.fleetIssue.updateMany({
      where: {
        id: req.params.id,
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        status: { not: "RESOLVED" },
      },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedById: req.user!.userId,
        resolutionNote: note.trim(),
      },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "That issue is already resolved" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Support: the fleet's channel to Darb ────────────────────────────────────
//
// The mirror of the merchant portal's support tab, on the same SupportTicket
// table. Issues flow Darb -> fleet; support flows fleet -> Darb. Two tabs
// because they are two different jobs, one table because Darb triages one
// inbox.

/**
 * @swagger
 * /api/fleet/support:
 *   get:
 *     tags: [Fleet Portal]
 *     summary: The fleet's support requests
 */
router.get("/support", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const tickets = await prisma.supportTicket.findMany({
      where: { tenantId: ctx.tenantId, fleetPartnerId: ctx.fleetPartnerId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/support:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Raise a support request with Darb
 */
router.post("/support", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const { subject, body, type } = req.body as {
      subject?: string; body?: string; type?: string;
    };
    if (!subject || subject.trim().length < 3) {
      res.status(400).json({ error: "A subject is required" });
      return;
    }
    if (!body || body.trim().length < 5) {
      res.status(400).json({ error: "Tell Darb what the problem is" });
      return;
    }
    const allowedTypes = ["ORDER", "WALLET", "TECHNICAL", "OTHER"];
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId: ctx.tenantId,
        vendorId: null,
        fleetPartnerId: ctx.fleetPartnerId,
        createdById: req.user!.userId,
        subject: subject.trim(),
        type: (type && allowedTypes.includes(type) ? type : "OTHER") as any,
        messages: {
          create: {
            tenantId: ctx.tenantId,
            author: "FLEET",
            authorName: req.user!.email ?? null,
            body: body.trim(),
          },
        },
      },
      include: { messages: true },
    });
    res.status(201).json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/support/{id}/reply:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Add a message to an existing request
 */
router.post("/support/:id/reply", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const { body } = req.body as { body?: string };
    if (!body || body.trim().length < 2) {
      res.status(400).json({ error: "Write a message" });
      return;
    }
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: req.params.id,
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
      },
      select: { id: true, status: true },
    });
    if (!ticket) { res.status(404).json({ error: "Request not found" }); return; }
    if (ticket.status === "CANCELLED") {
      res.status(409).json({ error: "That request was withdrawn" });
      return;
    }
    await prisma.supportTicketMessage.create({
      data: {
        tenantId: ctx.tenantId,
        ticketId: ticket.id,
        author: "FLEET",
        authorName: req.user!.email ?? null,
        body: body.trim(),
      },
    });
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "OPEN" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleet/support/{id}/cancel:
 *   post:
 *     tags: [Fleet Portal]
 *     summary: Withdraw a request. CANCELLED, not RESOLVED.
 */
router.post("/support/:id/cancel", async (req: Request, res: Response) => {
  try {
    const ctx = await fleetContext(req);
    if (!ctx) { res.status(403).json({ error: "No fleet partner on this account" }); return; }
    const claimed = await prisma.supportTicket.updateMany({
      where: {
        id: req.params.id,
        tenantId: ctx.tenantId,
        fleetPartnerId: ctx.fleetPartnerId,
        status: { in: ["OPEN", "ANSWERED"] },
      },
      data: { status: "CANCELLED" },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: "That request is already closed" });
      return;
    }
    await prisma.supportTicketMessage.create({
      data: {
        tenantId: ctx.tenantId,
        ticketId: req.params.id,
        author: "FLEET",
        authorName: req.user!.email ?? null,
        body: "Request withdrawn by the delivery company.",
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
