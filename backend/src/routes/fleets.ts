// Darb 2.0 PRD §9 — staff-facing fleet-partner management (/api/fleets).
// CRUD, driver linking, FLEET portal user creation, scorecards, payout
// statements, and the manual discipline override (the auto ladder only
// escalates; de-escalation is an explicit ops decision recorded here).

import { Router, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
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
import { parseLocalDate, parseLocalDateEnd } from "../utils/date";

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

/**
 * The scorecard is always a period report, so the range is part of the answer
 * and travels back with it. `?from`/`?to` are inclusive calendar days in
 * local (Kuwait) time: the scorecard queries are `lt: to`, so a date-only
 * `to` has to become that day's end or "today" would report an empty day.
 */
function parseRange(req: Request): { from: Date; to: Date } {
  const to =
    typeof req.query.to === "string" ? parseLocalDateEnd(req.query.to) : new Date();
  const from =
    typeof req.query.from === "string"
      ? parseLocalDate(req.query.from)
      : new Date(to.getTime() - 30 * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new RangeError("`from` and `to` must be YYYY-MM-DD dates");
  }
  if (to < from) throw new RangeError("`to` must not be earlier than `from`");
  return { from, to };
}

/** Slugged the same way the client names the file, so both agree. */
function slugifyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fleet";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Excel rejects []:*?/\ in a sheet name and truncates past 31 characters. */
function sheetNameFor(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Fleet";
}

/** A bold band that separates the blocks of a single-fleet sheet. */
function section(sheet: ExcelJS.Worksheet, title: string) {
  const row = sheet.addRow([title]);
  row.font = { bold: true };
}

/** Label in column A, value in column B, with the value's own number format. */
function pair(
  sheet: ExcelJS.Worksheet,
  label: string,
  value: string | number,
  numFmt?: string,
) {
  const row = sheet.addRow([label, value]);
  // "n/a" is text: a percent format on it renders as a stray % sign.
  if (numFmt && typeof value === "number") row.getCell(2).numFmt = numFmt;
}

async function sendWorkbook(res: Response, workbook: ExcelJS.Workbook, filename: string) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
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
 * /api/fleets/export.xlsx:
 *   get:
 *     tags: [Fleets]
 *     summary: Fleets workbook — summary, scorecards and payout statements
 *     description: >
 *       Revision 4 (#10). The old client-side CSV carried only the five list
 *       columns, so everything an ops manager actually reviews (the scorecard
 *       and the payout history in the side panel) had to be read off screen
 *       one fleet at a time. Three sheets, one download.
 *
 *       Rates are written as real numbers with a percent format and money with
 *       a 3dp format, so Excel sorts and sums them instead of treating them as
 *       text.
 *
 *       `?fleetId=` returns a different shape: one sheet that is the detail
 *       panel top to bottom (company, performance scorecard, payout
 *       statements). Narrowing the three sheets instead put the fleet list
 *       first, which is what the screen behind the panel already shows, so the
 *       download read as the main-page report with the two sections the panel
 *       exists for hidden on tabs.
 */
router.get("/export.xlsx", rbac(...READ), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const range = parseRange(req);
    const fleetId = typeof req.query.fleetId === "string" ? req.query.fleetId : null;

    const fleets = await prisma.fleetPartner.findMany({
      where: { tenantId, ...(fleetId ? { id: fleetId } : {}) },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { drivers: true, users: true } },
        statements: { orderBy: { periodStart: "desc" } },
      },
    });
    // A fleetId that resolves to nothing is a wrong id or another tenant's:
    // say so rather than handing back an empty workbook that reads as "this
    // partner has no data".
    if (fleetId && fleets.length === 0) {
      res.status(404).json({ error: "Fleet partner not found" });
      return;
    }

    // Scorecards are per-fleet queries; run them together rather than in
    // series so a 20-fleet tenant is one round of work, not twenty.
    const scorecards = await Promise.all(
      fleets.map((f) =>
        getFleetScorecard(tenantId, f.id, range).catch(() => null),
      ),
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Darb";
    workbook.created = new Date();

    const PCT = "0.0%";
    const KWD = "#,##0.000";

    // One partner: the workbook is the detail panel, not a one-row copy of the
    // list. Three sheets meant the file opened on "Fleets" — the same five
    // columns as the screen behind the panel — and the scorecard and payout
    // history sat on tabs nobody looked at, so the download read as "this is
    // the main page report" and the two sections the panel exists for looked
    // undownloadable. One sheet, laid out top to bottom the way the panel is.
    if (fleetId) {
      const f = fleets[0];
      const s = scorecards[0];
      const sheet = workbook.addWorksheet(sheetNameFor(f.name));
      sheet.columns = [
        { key: "label", width: 26 },
        { key: "value", width: 22 },
        { key: "c", width: 20 },
        { key: "d", width: 18 },
        { key: "e", width: 14 },
      ];

      const title = sheet.addRow([f.name]);
      title.font = { bold: true, size: 14 };
      sheet.addRow([
        "Period covered",
        `${range.from.toISOString().slice(0, 10)} to ${range.to.toISOString().slice(0, 10)}`,
      ]);
      sheet.addRow([]);

      section(sheet, "COMPANY");
      pair(sheet, "Discipline", f.disciplineStatus);
      pair(sheet, "Fee per order (KD)", Number(f.flatFeePerOrderKwd), KWD);
      pair(sheet, "Roster", f._count.drivers);
      pair(sheet, "Portal users", f._count.users);
      pair(sheet, "Status", f.isActive ? "Active" : "Inactive");
      sheet.addRow([]);

      section(sheet, "PERFORMANCE SCORECARD");
      // "n/a" rather than 0: a fleet with no orders has no on-time rate, and a
      // zero there would read as a failing one.
      pair(sheet, "On-time rate", s?.onTimeRate ?? "n/a", PCT);
      pair(sheet, "Acceptance rate", s?.acceptanceRate ?? "n/a", PCT);
      pair(sheet, "Utilisation", s?.utilisation ?? "n/a", PCT);
      pair(sheet, "Delivered orders", s?.deliveredOrders ?? 0);
      pair(sheet, "Online hours", s?.onlineHours ?? 0, "0.0");
      pair(sheet, "Contracted hours", s?.contractedHours ?? "n/a", "0.0");
      pair(sheet, "Rating", s?.avgRating ?? "n/a", "0.00");
      pair(sheet, "Ratings counted", s?.ratingCount ?? 0);
      sheet.addRow([]);

      section(sheet, "PAYOUT STATEMENTS");
      const head = sheet.addRow([
        "Period",
        "Delivered orders",
        "Fee per order (KD)",
        "Total (KD)",
        "Status",
      ]);
      head.font = { bold: true };
      if (f.statements.length === 0) {
        sheet.addRow(["No statements yet"]);
      } else {
        for (const st of f.statements) {
          const row = sheet.addRow([
            st.periodStart.toISOString().slice(0, 7), // YYYY-MM
            st.deliveredOrders,
            Number(st.feePerOrderKwd),
            Number(st.totalKwd),
            st.status,
          ]);
          row.getCell(3).numFmt = KWD;
          row.getCell(4).numFmt = KWD;
        }
      }

      await sendWorkbook(res, workbook, `${slugifyName(f.name)}-${today()}.xlsx`);
      return;
    }

    const summary = workbook.addWorksheet("Fleets");
    summary.columns = [
      { header: "Fleet", key: "name", width: 28 },
      { header: "Roster", key: "roster", width: 10 },
      { header: "Discipline", key: "discipline", width: 14 },
      { header: "Fee per order (KD)", key: "fee", width: 18, style: { numFmt: KWD } },
      { header: "Status", key: "status", width: 12 },
    ];
    for (const f of fleets) {
      summary.addRow({
        name: f.name,
        roster: f._count.drivers,
        discipline: f.disciplineStatus,
        fee: Number(f.flatFeePerOrderKwd),
        status: f.isActive ? "Active" : "Inactive",
      });
    }

    const scores = workbook.addWorksheet("Scorecards");
    scores.columns = [
      { header: "Fleet", key: "name", width: 28 },
      { header: "On-time rate", key: "onTime", width: 14, style: { numFmt: PCT } },
      { header: "Acceptance rate", key: "acceptance", width: 16, style: { numFmt: PCT } },
      { header: "Utilisation", key: "utilisation", width: 13, style: { numFmt: PCT } },
      { header: "Delivered orders", key: "delivered", width: 17 },
      { header: "Online hours", key: "online", width: 14, style: { numFmt: "0.0" } },
      { header: "Contracted hours", key: "contracted", width: 17, style: { numFmt: "0.0" } },
      { header: "Rating", key: "rating", width: 10, style: { numFmt: "0.00" } },
    ];
    fleets.forEach((f, i) => {
      const s = scorecards[i];
      scores.addRow({
        name: f.name,
        // "n/a" rather than 0: a fleet with no orders has no on-time rate, and
        // a zero there would read as a failing one.
        onTime: s?.onTimeRate ?? "n/a",
        acceptance: s?.acceptanceRate ?? "n/a",
        utilisation: s?.utilisation ?? "n/a",
        delivered: s?.deliveredOrders ?? 0,
        online: s?.onlineHours ?? 0,
        contracted: s?.contractedHours ?? "n/a",
        rating: s?.avgRating ?? "n/a",
      });
    });

    const payouts = workbook.addWorksheet("Payouts");
    payouts.columns = [
      { header: "Fleet", key: "name", width: 28 },
      { header: "Period", key: "period", width: 14 },
      { header: "Delivered orders", key: "orders", width: 17 },
      { header: "Fee per order (KD)", key: "fee", width: 18, style: { numFmt: KWD } },
      { header: "Total (KD)", key: "total", width: 14, style: { numFmt: KWD } },
      { header: "Status", key: "status", width: 10 },
    ];
    for (const f of fleets) {
      for (const st of f.statements) {
        payouts.addRow({
          name: f.name,
          period: st.periodStart.toISOString().slice(0, 7), // YYYY-MM
          orders: st.deliveredOrders,
          fee: Number(st.feePerOrderKwd),
          total: Number(st.totalKwd),
          status: st.status,
        });
      }
    }

    for (const sheet of [summary, scores, payouts]) {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
    }

    await sendWorkbook(res, workbook, `fleets-${today()}.xlsx`);
  } catch (err: any) {
    if (err instanceof RangeError) { res.status(400).json({ error: err.message }); return; }
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
 * /api/fleets/{id}/users:
 *   get:
 *     tags: [Fleets]
 *     summary: Portal logins that already exist for this fleet (ADMIN only)
 */
router.get("/:id/users", rbac("ADMIN"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const fleet = await findTenantFleet(tenantId, req.params.id);
    if (!fleet) { res.status(404).json({ error: "Fleet partner not found" }); return; }

    // No role filter. The list endpoint's `_count.users` counts the whole
    // relation, so filtering to role=FLEET here would render a table shorter
    // than the number beside it and read as a bug rather than as a rule.
    // ADMIN, matching the POST below it: creating a login and reading the
    // partner's staff emails are the same disclosure.
    const users = await prisma.user.findMany({
      where: { fleetPartnerId: fleet.id, tenantId },
      select: {
        id: true, email: true, name: true, phone: true,
        role: true, isActive: true, createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    if (err instanceof RangeError) { res.status(400).json({ error: err.message }); return; }
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
