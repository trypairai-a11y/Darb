// Darb 2.0 PRD §9 — staff-facing fleet-partner management (/api/fleets).
// CRUD, driver linking, FLEET portal user creation, scorecards, payout
// statements, and the manual discipline override (the auto ladder only
// escalates; de-escalation is an explicit ops decision recorded here).

import { Router, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { validateBody } from "../utils/validate";
import { getPagination, paginatedResponse } from "../utils/pagination";
import {
  generateFleetStatements,
  getFleetScorecard,
  postFleetPayout,
} from "../services/fleetService";
import { LADDER } from "../services/fleetDiscipline";
import { WalletError } from "../services/wallet/walletService";
import { previousMonthPeriod } from "../services/wallet/vendorSettlementService";

const MUTATE = ["ADMIN", "OPS_MANAGER"];
const READ = ["ADMIN", "OPS_MANAGER", "SUPERVISOR", "ACCOUNTANT"];

const router = Router();
router.use(authMiddleware, tenantScope);

const kwdSchema = z
  .union([z.string(), z.number()])
  .refine((v) => /^\d{1,5}(\.\d{1,3})?$/.test(String(v)), {
    message: "Must be a KWD amount with up to 3 decimals",
  });

const createFleetSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactName: z.string().max(120).nullable().optional(),
  contactPhone: z.string().max(30).nullable().optional(),
  contactEmail: z.string().email().max(200).nullable().optional(),
  flatFeePerOrderKwd: kwdSchema.optional(),
  minOnlineHoursPerDay: z.number().min(0).max(24).nullable().optional(),
  minDriversOnline: z.record(z.number().int().min(0)).nullable().optional(),
});

const updateFleetSchema = createFleetSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const disciplineSchema = z.object({
  status: z.enum(LADDER),
  note: z.string().trim().min(5).max(500),
});

const linkDriversSchema = z.object({
  driverIds: z.array(z.string().min(1)).min(1).max(500),
});

const createFleetUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(2).max(120),
  phone: z.string().max(30).optional(),
});

async function findTenantFleet(tenantId: string, id: string) {
  return prisma.fleetPartner.findFirst({ where: { id, tenantId } });
}

function parseRange(req: Request): { from: Date; to: Date } {
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date();
  const from =
    typeof req.query.from === "string"
      ? new Date(req.query.from)
      : new Date(to.getTime() - 30 * 86_400_000);
  return { from, to };
}

/**
 * @swagger
 * /api/fleets:
 *   get:
 *     tags: [Fleets]
 *     summary: List fleet partners with driver counts
 */
router.get("/", rbac(...READ), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { skip, limit, page } = getPagination(req);
    const where: any = { tenantId };
    if (req.query.active === "1") where.isActive = true;
    const [rows, total] = await Promise.all([
      prisma.fleetPartner.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
        include: {
          _count: { select: { drivers: true, users: true } },
          // Revision #28 — the owner entity, so the table can group commonly
          // owned fleets and report them combined instead of one row each.
          ownerGroup: { select: { id: true, name: true } },
        },
      }),
      prisma.fleetPartner.count({ where }),
    ]);
    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleets:
 *   post:
 *     tags: [Fleets]
 *     summary: Onboard a fleet partner (ADMIN/OPS_MANAGER)
 */
router.post("/", rbac(...MUTATE), validateBody(createFleetSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const body = req.body as z.infer<typeof createFleetSchema>;
    const fleet = await prisma.fleetPartner.create({
      data: {
        tenantId,
        name: body.name,
        contactName: body.contactName ?? null,
        contactPhone: body.contactPhone ?? null,
        contactEmail: body.contactEmail ?? null,
        ...(body.flatFeePerOrderKwd !== undefined
          ? { flatFeePerOrderKwd: String(body.flatFeePerOrderKwd) }
          : {}),
        minOnlineHoursPerDay: body.minOnlineHoursPerDay ?? null,
        minDriversOnline: (body.minDriversOnline ?? undefined) as any,
      },
    });
    res.status(201).json(fleet);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleets/{id}:
 *   get:
 *     tags: [Fleets]
 *     summary: Fleet detail with drivers and portal users
 */
router.get("/:id", rbac(...READ), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const fleet = await prisma.fleetPartner.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        drivers: {
          select: {
            id: true, name: true, phone: true, status: true, vehicleType: true,
            performanceTier: true, throttledUntil: true,
          },
        },
        users: { select: { id: true, email: true, name: true, isActive: true } },
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
 * /api/fleets/{id}:
 *   put:
 *     tags: [Fleets]
 *     summary: Update fleet partner fields
 */
router.put("/:id", rbac(...MUTATE), validateBody(updateFleetSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const body = req.body as z.infer<typeof updateFleetSchema>;
    const data: any = {};
    for (const key of ["name", "contactName", "contactPhone", "contactEmail", "minOnlineHoursPerDay", "isActive"] as const) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (body.flatFeePerOrderKwd !== undefined) data.flatFeePerOrderKwd = String(body.flatFeePerOrderKwd);
    if (body.minDriversOnline !== undefined) data.minDriversOnline = body.minDriversOnline;
    const updated = await prisma.fleetPartner.updateMany({
      where: { id: req.params.id, tenantId },
      data,
    });
    if (updated.count === 0) { res.status(404).json({ error: "Fleet partner not found" }); return; }
    res.json(await findTenantFleet(tenantId, req.params.id));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleets/{id}/discipline:
 *   post:
 *     tags: [Fleets]
 *     summary: Manual discipline override (escalate OR de-escalate, note required)
 */
router.post(
  "/:id/discipline",
  rbac(...MUTATE),
  validateBody(disciplineSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { status, note } = req.body as z.infer<typeof disciplineSchema>;
      const fleet = await findTenantFleet(tenantId, req.params.id);
      if (!fleet) { res.status(404).json({ error: "Fleet partner not found" }); return; }

      await prisma.$transaction(async (tx) => {
        await tx.fleetPartner.updateMany({
          where: { id: fleet.id, tenantId },
          data: {
            disciplineStatus: status,
            disciplineNote: `${note} (manual by ${req.user!.email}, ${new Date().toISOString().slice(0, 10)})`,
            isActive: status !== "REMOVED",
          },
        });
        if (status === "OK" || status === "WARNED") {
          // De-escalation clears the drivers' throttle.
          await tx.driver.updateMany({
            where: { tenantId, fleetPartnerId: fleet.id },
            data: { throttledUntil: null },
          });
        }
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: req.user!.userId,
            action: "FLEET_DISCIPLINE_OVERRIDE",
            entityType: "FleetPartner",
            entityId: fleet.id,
            changes: { status, note } as any,
          },
        });
      });
      res.json(await findTenantFleet(tenantId, req.params.id));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/fleets/{id}/drivers:
 *   post:
 *     tags: [Fleets]
 *     summary: Link existing drivers to this fleet partner
 */
router.post(
  "/:id/drivers",
  rbac(...MUTATE),
  validateBody(linkDriversSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const fleet = await findTenantFleet(tenantId, req.params.id);
      if (!fleet) { res.status(404).json({ error: "Fleet partner not found" }); return; }
      const { driverIds } = req.body as z.infer<typeof linkDriversSchema>;
      const updated = await prisma.driver.updateMany({
        where: { id: { in: driverIds }, tenantId },
        data: { fleetPartnerId: fleet.id },
      });
      res.json({ linked: updated.count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/fleets/{id}/users:
 *   post:
 *     tags: [Fleets]
 *     summary: Create a FLEET-role portal user for this fleet (ADMIN only)
 */
router.post(
  "/:id/users",
  rbac("ADMIN"),
  validateBody(createFleetUserSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const fleet = await findTenantFleet(tenantId, req.params.id);
      if (!fleet) { res.status(404).json({ error: "Fleet partner not found" }); return; }

      const { email, password, name, phone } = req.body as z.infer<typeof createFleetUserSchema>;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) { res.status(400).json({ error: "Email already registered" }); return; }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: {
          tenantId,
          email,
          passwordHash,
          name,
          phone,
          role: "FLEET",
          fleetPartnerId: fleet.id,
        },
        select: {
          id: true, email: true, name: true, phone: true, role: true,
          tenantId: true, fleetPartnerId: true, isActive: true, createdAt: true,
        },
      });
      res.status(201).json(user);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/fleets/{id}/scorecard:
 *   get:
 *     tags: [Fleets]
 *     summary: Fleet performance scorecard (on-time, acceptance, utilisation, rating)
 */
router.get("/:id/scorecard", rbac(...READ), async (req: Request, res: Response) => {
  try {
    const scorecard = await getFleetScorecard(req.user!.tenantId, req.params.id, parseRange(req));
    res.json(scorecard);
  } catch (err: any) {
    if (/not found/i.test(err.message)) { res.status(404).json({ error: err.message }); return; }
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/fleets/statements/generate:
 *   post:
 *     tags: [Fleets]
 *     summary: Generate fleet payout statements for the last closed month
 */
router.post(
  "/statements/generate",
  rbac("ADMIN", "ACCOUNTANT"),
  async (req: Request, res: Response) => {
    try {
      const period = previousMonthPeriod();
      const created = await generateFleetStatements(req.user!.tenantId, period);
      res.json({ ok: true, created, periodStart: period.start, periodEnd: period.end });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/fleets/{id}/statements:
 *   get:
 *     tags: [Fleets]
 *     summary: Payout statements for one fleet
 */
router.get("/:id/statements", rbac(...READ), async (req: Request, res: Response) => {
  try {
    const rows = await prisma.fleetPayoutStatement.findMany({
      where: { tenantId: req.user!.tenantId, fleetPartnerId: req.params.id },
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
 * /api/fleets/statements/{id}/payout:
 *   post:
 *     tags: [Fleets]
 *     summary: Pay a statement — posts FLEET_PAYOUT and marks PAID
 */
router.post(
  "/statements/:id/payout",
  rbac("ADMIN", "ACCOUNTANT"),
  async (req: Request, res: Response) => {
    try {
      const posted = await postFleetPayout({
        tenantId: req.user!.tenantId,
        statementId: req.params.id,
        actorId: req.user!.userId,
      });
      res.json({ ok: true, transactionId: posted?.transactionId ?? null, replay: posted === null });
    } catch (err: any) {
      if (err instanceof WalletError) { res.status(400).json({ error: err.message }); return; }
      res.status(500).json({ error: err.message });
    }
  },
);

export default router;
