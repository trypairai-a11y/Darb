/**
 * /api/zones — Darb 2.0 delivery-zone management, zone resolution tester,
 * delivery quoting, surcharge matrix, and fulfillment settings (§A4 + §A8).
 *
 * All handlers are tenant-scoped. Zone/surcharge/settings mutations are
 * restricted via rbac(); reads are open to all authenticated staff.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { validateBody } from "../utils/validate";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { Bbox, GeoJsonPolygon, bboxOfPolygon } from "../utils/geo";
import { Prisma } from "../generated/prisma";
import { invalidateZoneCache, resolveZone, rezoneBranches } from "../services/zoneService";
import { quoteDelivery } from "../services/pricingService";

const ZONE_EDITORS = ["ADMIN", "OPS_MANAGER"];

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── Zod schemas ────────────────────────────────────────────────────────────

/** GeoJSON position, [lng, lat] order. */
const positionSchema = z.tuple([
  z.number().gte(-180).lte(180), // lng
  z.number().gte(-90).lte(90), // lat
]);

const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z
    .array(z.array(positionSchema).min(3, "Each ring needs at least 3 vertices"))
    .min(1, "Polygon needs an outer ring"),
});

const createZoneSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(100),
  nameAr: z.string().trim().max(100).nullish(),
  // Accepted for the polygon editor's forward-compatibility; DeliveryZone has
  // no color column yet, so it is currently ignored server-side.
  color: z.string().trim().max(32).nullish(),
  polygon: polygonSchema,
  isActive: z.boolean().optional(),
});

const updateZoneSchema = createZoneSchema.partial();

const resolveSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

const quoteSchema = z.object({
  branchId: z.string().min(1).optional(),
  pickupZoneId: z.string().min(1).optional(),
  dropoff: z.object({
    lat: z.number().gte(-90).lte(90).optional(),
    lng: z.number().gte(-180).lte(180).optional(),
    zoneId: z.string().min(1).optional(),
  }),
});

/** KWD amount: number or "1.250"-style string, ≤3 decimal places. */
const KWD_STRING = /^\d{1,7}(\.\d{1,3})?$/;
const kwdAmountSchema = z.union([
  z.number().finite().nonnegative(),
  z.string().regex(KWD_STRING, "Must be a KWD amount with up to 3 decimals"),
]);
const positiveKwdAmountSchema = kwdAmountSchema.refine(
  (v) => Number(v) > 0,
  "Must be a positive KWD amount",
);

const surchargeMatrixSchema = z.array(
  z.object({
    originZoneId: z.string().min(1),
    destZoneId: z.string().min(1),
    surchargeKwd: kwdAmountSchema,
  }),
).max(2000);

const settingsSchema = z.object({
  intraZoneFeeKwd: positiveKwdAmountSchema.optional(),
  driverCashCeilingKwd: positiveKwdAmountSchema.optional(),
  offerWindowSec: z.number().int().min(5).max(60).optional(),
  maxOfferRounds: z.number().int().min(1).max(20).optional(),
  searchRadiusKm: z.number().positive().max(100).optional(),
  gpsStaleAfterSec: z.number().int().min(30).max(3600).optional(),
  // PRD §8 dispatch knobs: auto-widen + auto-batching.
  radiusWidenAfterRounds: z.number().int().min(0).max(20).optional(),
  radiusWidenFactor: z.number().min(1).max(5).optional(),
  maxSearchRadiusKm: z.number().positive().max(100).optional(),
  batchingEnabled: z.boolean().optional(),
  batchMaxDropKm: z.number().positive().max(20).optional(),
  batchMaxOrders: z.number().int().min(2).max(5).optional(),
});

// ─── Polygon normalization ──────────────────────────────────────────────────

interface NormalizedPolygon {
  polygon: GeoJsonPolygon;
  bbox: Bbox;
  centroidLat: number;
  centroidLng: number;
}

/**
 * Auto-close open rings, enforce ≥4 points per closed ring (3 distinct
 * vertices), and compute bbox + centroid (mean of outer-ring vertices).
 */
function normalizePolygon(
  input: z.infer<typeof polygonSchema>,
): { ok: true; value: NormalizedPolygon } | { ok: false; error: string } {
  const rings: number[][][] = [];
  for (const ring of input.coordinates) {
    const closed = ring.map(([lng, lat]) => [lng, lat]);
    const first = closed[0];
    const last = closed[closed.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      closed.push([first[0], first[1]]); // auto-close
    }
    if (closed.length < 4) {
      return {
        ok: false,
        error: "Polygon ring must have at least 4 points once closed (3 distinct vertices)",
      };
    }
    rings.push(closed);
  }

  const polygon: GeoJsonPolygon = { type: "Polygon", coordinates: rings };
  const bbox = bboxOfPolygon(polygon);
  const outer = rings[0].slice(0, -1); // distinct vertices only
  const centroidLng = outer.reduce((s, [lng]) => s + lng, 0) / outer.length;
  const centroidLat = outer.reduce((s, [, lat]) => s + lat, 0) / outer.length;

  return {
    ok: true,
    value: {
      polygon,
      bbox,
      centroidLat: +centroidLat.toFixed(7),
      centroidLng: +centroidLng.toFixed(7),
    },
  };
}

// ─── Zones ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/zones:
 *   get:
 *     tags: [Zones]
 *     summary: List delivery zones (paginated; pass limit=100 for pickers)
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Match against zone code or name
 *     responses:
 *       200:
 *         description: Paginated zone list with branch counts
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { skip, limit, page } = getPagination(req);
    const { isActive, search } = req.query;

    const where: any = { tenantId };
    if (isActive === "true") where.isActive = true;
    if (isActive === "false") where.isActive = false;
    if (search) {
      where.OR = [
        { code: { contains: search as string, mode: "insensitive" } },
        { name: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.deliveryZone.findMany({
        where: { ...where, tenantId },
        skip,
        take: limit,
        orderBy: { code: "asc" },
        include: { _count: { select: { branches: true } } },
      }),
      prisma.deliveryZone.count({ where: { ...where, tenantId } }),
    ]);

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Surcharge matrix (static paths registered before /:id) ────────────────

/**
 * @swagger
 * /api/zones/surcharges:
 *   get:
 *     tags: [Zones]
 *     summary: Full cross-zone surcharge matrix (absence of a pair = unserviceable)
 *     responses:
 *       200:
 *         description: All surcharge rows with origin/dest zone info
 */
router.get("/surcharges", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const rows = await prisma.zoneSurcharge.findMany({
      where: { tenantId },
      orderBy: [{ originZone: { code: "asc" } }, { destZone: { code: "asc" } }],
      include: {
        originZone: { select: { id: true, code: true, name: true } },
        destZone: { select: { id: true, code: true, name: true } },
      },
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/zones/surcharges:
 *   put:
 *     tags: [Zones]
 *     summary: Replace the surcharge matrix (body = COMPLETE state; missing pairs are deleted)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required: [originZoneId, destZoneId, surchargeKwd]
 *               properties:
 *                 originZoneId: { type: string }
 *                 destZoneId: { type: string }
 *                 surchargeKwd: { type: string, example: "0.750" }
 *     responses:
 *       200:
 *         description: The stored matrix after the replace
 *       400:
 *         description: Self-pair, duplicate pair, or unknown zone id
 */
router.put(
  "/surcharges",
  rbac(...ZONE_EDITORS),
  validateBody(surchargeMatrixSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const rows = req.body as z.infer<typeof surchargeMatrixSchema>;

      // Self-pairs are priced by intraZoneFeeKwd, never by the matrix.
      const selfPair = rows.find((r) => r.originZoneId === r.destZoneId);
      if (selfPair) {
        res.status(400).json({
          error: `originZoneId and destZoneId must differ (zone ${selfPair.originZoneId}); intra-zone pricing comes from settings.intraZoneFeeKwd`,
        });
        return;
      }

      const seen = new Set<string>();
      for (const r of rows) {
        const key = `${r.originZoneId}→${r.destZoneId}`;
        if (seen.has(key)) {
          res.status(400).json({ error: `Duplicate pair in body: ${key}` });
          return;
        }
        seen.add(key);
      }

      const zones = await prisma.deliveryZone.findMany({
        where: { tenantId },
        select: { id: true },
      });
      const zoneIds = new Set(zones.map((zn) => zn.id));
      const unknown = rows.find(
        (r) => !zoneIds.has(r.originZoneId) || !zoneIds.has(r.destZoneId),
      );
      if (unknown) {
        res.status(400).json({
          error: `Unknown zone id in pair ${unknown.originZoneId}→${unknown.destZoneId}`,
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        for (const r of rows) {
          await tx.zoneSurcharge.upsert({
            where: {
              tenantId_originZoneId_destZoneId: {
                tenantId,
                originZoneId: r.originZoneId,
                destZoneId: r.destZoneId,
              },
            },
            update: { surchargeKwd: new Prisma.Decimal(String(r.surchargeKwd)) },
            create: {
              tenantId,
              originZoneId: r.originZoneId,
              destZoneId: r.destZoneId,
              surchargeKwd: new Prisma.Decimal(String(r.surchargeKwd)),
            },
          });
        }
        // The matrix editor sends the complete state — delete absent pairs.
        await tx.zoneSurcharge.deleteMany({
          where: {
            tenantId,
            NOT: rows.map((r) => ({
              originZoneId: r.originZoneId,
              destZoneId: r.destZoneId,
            })),
          },
        });
      });

      const matrix = await prisma.zoneSurcharge.findMany({
        where: { tenantId },
        orderBy: [{ originZone: { code: "asc" } }, { destZone: { code: "asc" } }],
        include: {
          originZone: { select: { id: true, code: true, name: true } },
          destZone: { select: { id: true, code: true, name: true } },
        },
      });
      res.json(matrix);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ─── Fulfillment settings ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/zones/settings:
 *   get:
 *     tags: [Zones]
 *     summary: Fulfillment settings for the tenant (fee, ceiling, dispatch knobs)
 *     responses:
 *       200:
 *         description: FulfillmentSettings row
 *       404:
 *         description: Not configured yet — PUT /api/zones/settings creates it
 */
router.get("/settings", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const settings = await prisma.fulfillmentSettings.findUnique({
      where: { tenantId },
    });
    if (!settings) {
      res.status(404).json({
        error: "FulfillmentSettings not configured for this tenant — save settings to create them",
      });
      return;
    }
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/zones/settings:
 *   put:
 *     tags: [Zones]
 *     summary: Upsert fulfillment settings (ADMIN only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               intraZoneFeeKwd: { type: string, example: "1.250" }
 *               driverCashCeilingKwd: { type: string, example: "100.000" }
 *               offerWindowSec: { type: integer, minimum: 5, maximum: 60 }
 *               maxOfferRounds: { type: integer, minimum: 1, maximum: 20 }
 *               searchRadiusKm: { type: number }
 *               gpsStaleAfterSec: { type: integer }
 *     responses:
 *       200:
 *         description: Upserted settings row
 */
router.put(
  "/settings",
  rbac("ADMIN"),
  validateBody(settingsSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const body = req.body as z.infer<typeof settingsSchema>;

      const data: any = {};
      if (body.intraZoneFeeKwd !== undefined) {
        data.intraZoneFeeKwd = new Prisma.Decimal(String(body.intraZoneFeeKwd));
      }
      if (body.driverCashCeilingKwd !== undefined) {
        data.driverCashCeilingKwd = new Prisma.Decimal(String(body.driverCashCeilingKwd));
      }
      if (body.offerWindowSec !== undefined) data.offerWindowSec = body.offerWindowSec;
      if (body.maxOfferRounds !== undefined) data.maxOfferRounds = body.maxOfferRounds;
      if (body.searchRadiusKm !== undefined) data.searchRadiusKm = body.searchRadiusKm;
      if (body.gpsStaleAfterSec !== undefined) data.gpsStaleAfterSec = body.gpsStaleAfterSec;
      if (body.radiusWidenAfterRounds !== undefined) data.radiusWidenAfterRounds = body.radiusWidenAfterRounds;
      if (body.radiusWidenFactor !== undefined) data.radiusWidenFactor = body.radiusWidenFactor;
      if (body.maxSearchRadiusKm !== undefined) data.maxSearchRadiusKm = body.maxSearchRadiusKm;
      if (body.batchingEnabled !== undefined) data.batchingEnabled = body.batchingEnabled;
      if (body.batchMaxDropKm !== undefined) data.batchMaxDropKm = body.batchMaxDropKm;
      if (body.batchMaxOrders !== undefined) data.batchMaxOrders = body.batchMaxOrders;

      const settings = await prisma.fulfillmentSettings.upsert({
        where: { tenantId },
        update: data,
        create: { tenantId, ...data },
      });
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ─── Resolution tester + quoting ────────────────────────────────────────────

/**
 * @swagger
 * /api/zones/resolve:
 *   post:
 *     tags: [Zones]
 *     summary: Resolve a lat/lng point to its delivery zone (tester)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lat, lng]
 *             properties:
 *               lat: { type: number }
 *               lng: { type: number }
 *     responses:
 *       200:
 *         description: "{ zone: ResolvedZone | null }"
 */
router.post("/resolve", validateBody(resolveSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { lat, lng } = req.body as z.infer<typeof resolveSchema>;
    const zone = await resolveZone(tenantId, lat, lng);
    res.json({ zone });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/zones/quote:
 *   post:
 *     tags: [Zones]
 *     summary: Quote a delivery fee (vendor portal + agent contract)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dropoff]
 *             properties:
 *               branchId: { type: string }
 *               pickupZoneId: { type: string }
 *               dropoff:
 *                 type: object
 *                 properties:
 *                   lat: { type: number }
 *                   lng: { type: number }
 *                   zoneId: { type: string }
 *     responses:
 *       200:
 *         description: "{ ok: true, feeKwd, zones… } or { ok: false, reason }"
 *       500:
 *         description: FulfillmentSettings missing (tenant misconfiguration)
 */
router.post("/quote", validateBody(quoteSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const input = req.body as z.infer<typeof quoteSchema>;
    const result = await quoteDelivery(tenantId, input);

    if (!result.ok) {
      res.json({ ok: false, reason: result.reason });
      return;
    }
    res.json({
      ok: true,
      pickupZoneId: result.pickupZoneId,
      dropoffZoneId: result.dropoffZoneId,
      feeKwd: result.feeKwd.toFixed(3),
      pickupZone: result.pickupZone,
      dropoffZone: result.dropoffZone,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Zone mutations ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/zones:
 *   post:
 *     tags: [Zones]
 *     summary: Create a delivery zone (ADMIN/OPS_MANAGER)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name, polygon]
 *             properties:
 *               code: { type: string, example: "SALMIYA" }
 *               name: { type: string }
 *               nameAr: { type: string }
 *               color: { type: string, description: "Accepted but not yet stored" }
 *               polygon: { type: object, description: "GeoJSON Polygon, [lng,lat] ring (auto-closed)" }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Created zone
 *       400:
 *         description: Invalid polygon ring
 *       409:
 *         description: Zone code already exists for this tenant
 */
router.post(
  "/",
  rbac(...ZONE_EDITORS),
  validateBody(createZoneSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const body = req.body as z.infer<typeof createZoneSchema>;

      const normalized = normalizePolygon(body.polygon);
      if (!normalized.ok) {
        res.status(400).json({ error: normalized.error });
        return;
      }

      const zone = await prisma.deliveryZone.create({
        data: {
          tenantId,
          code: body.code,
          name: body.name,
          nameAr: body.nameAr ?? null,
          polygon: normalized.value.polygon as any,
          bbox: normalized.value.bbox as any,
          centroidLat: normalized.value.centroidLat,
          centroidLng: normalized.value.centroidLng,
          isActive: body.isActive ?? true,
        },
      });

      invalidateZoneCache(tenantId);
      res.status(201).json(zone);
    } catch (err: any) {
      if (err?.code === "P2002") {
        res.status(409).json({ error: "A zone with this code already exists" });
        return;
      }
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/zones/{id}:
 *   put:
 *     tags: [Zones]
 *     summary: Update a zone; re-resolves all vendor branches against the new polygons
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ zone, rezonedBranches }"
 *       404:
 *         description: Zone not found
 */
router.put(
  "/:id",
  rbac(...ZONE_EDITORS),
  validateBody(updateZoneSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const body = req.body as z.infer<typeof updateZoneSchema>;

      const data: any = {};
      if (body.code !== undefined) data.code = body.code;
      if (body.name !== undefined) data.name = body.name;
      if (body.nameAr !== undefined) data.nameAr = body.nameAr;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      if (body.polygon !== undefined) {
        const normalized = normalizePolygon(body.polygon);
        if (!normalized.ok) {
          res.status(400).json({ error: normalized.error });
          return;
        }
        data.polygon = normalized.value.polygon;
        data.bbox = normalized.value.bbox;
        data.centroidLat = normalized.value.centroidLat;
        data.centroidLng = normalized.value.centroidLng;
      }

      const result = await prisma.deliveryZone.updateMany({
        where: { id: req.params.id, tenantId },
        data,
      });
      if (result.count === 0) {
        res.status(404).json({ error: "Zone not found" });
        return;
      }

      // Fresh polygons ⇒ every branch's zone assignment may have changed.
      invalidateZoneCache(tenantId);
      const rezonedBranches = await rezoneBranches(tenantId);

      const zone = await prisma.deliveryZone.findFirst({
        where: { id: req.params.id, tenantId },
        include: { _count: { select: { branches: true } } },
      });
      res.json({ zone, rezonedBranches });
    } catch (err: any) {
      if (err?.code === "P2002") {
        res.status(409).json({ error: "A zone with this code already exists" });
        return;
      }
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/zones/{id}:
 *   delete:
 *     tags: [Zones]
 *     summary: Delete a zone (blocked with 409 while branches, surcharges, or orders reference it)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ ok: true }"
 *       404:
 *         description: Zone not found
 *       409:
 *         description: Zone still referenced — { error, references }
 */
router.delete("/:id", rbac(...ZONE_EDITORS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const zoneId = req.params.id;

    const zone = await prisma.deliveryZone.findFirst({
      where: { id: zoneId, tenantId },
      select: { id: true },
    });
    if (!zone) {
      res.status(404).json({ error: "Zone not found" });
      return;
    }

    const [branches, surcharges, orders] = await Promise.all([
      prisma.vendorBranch.count({ where: { tenantId, zoneId } }),
      prisma.zoneSurcharge.count({
        where: { tenantId, OR: [{ originZoneId: zoneId }, { destZoneId: zoneId }] },
      }),
      prisma.deliveryOrder.count({
        where: { tenantId, OR: [{ pickupZoneId: zoneId }, { dropoffZoneId: zoneId }] },
      }),
    ]);

    if (branches > 0 || surcharges > 0 || orders > 0) {
      res.status(409).json({
        error:
          "Zone is still referenced — reassign branches, remove its surcharge rows, and keep historical orders before deleting",
        references: { branches, surcharges, orders },
      });
      return;
    }

    await prisma.deliveryZone.deleteMany({ where: { id: zoneId, tenantId } });
    invalidateZoneCache(tenantId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
