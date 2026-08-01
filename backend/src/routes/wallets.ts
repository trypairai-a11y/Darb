// Darb 2.0 — /api/wallets (plan §A8). Ledger accounts, entries, remittances,
// ADMIN adjustments, and reconciliation runs. House conventions per
// routes/violations.ts: authMiddleware + tenantScope on the router, rbac()
// per route, getPagination/paginatedResponse, try/catch → { error }.
// Money is serialized as 3dp strings (Number(x).toFixed(3) house pattern).
// WalletTransaction/WalletEntry are append-only — this file exposes NO
// update or delete path for them; corrections go through POST /adjustments.

import { Router, Request, Response } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { parseLocalDate, parseLocalDateEnd } from "../utils/date";
import { validateBody } from "../utils/validate";
import { postAdjustment, toKwdString, WalletError } from "../services/wallet/walletService";
import { recordRemittance } from "../services/wallet/remittanceService";
import {
  generateMonthlyStatements,
  postVendorPayout,
  previousMonthPeriod,
} from "../services/wallet/vendorSettlementService";
import { RefundError, processRefund } from "../services/wallet/refundService";
import {
  confirmFleetDeposit,
  FleetCashConflict,
  listFleetDeposits,
  rejectFleetDeposit,
} from "../services/wallet/fleetCashService";

const FINANCE_READ = ["ADMIN", "OPS_MANAGER", "ACCOUNTANT"];
// Revision 4 (#3): CASH_COLLECTOR is the cash desk login. Without it here the
// fence lets the role through and rbac then 403s it out of the one job it has.
const REMITTANCE_WRITE = ["ACCOUNTANT", "SUPERVISOR", "ADMIN", "CASH_COLLECTOR"];
const REMITTANCE_READ = [
  "ADMIN",
  "OPS_MANAGER",
  "ACCOUNTANT",
  "SUPERVISOR",
  "CASH_COLLECTOR",
];
// Balances only, no ledger detail. The cash desk has to see what a driver is
// holding before it accepts a hand-in — that is the whole point of the screen
// — so it reads accounts without reading entries or statements.
const BALANCE_READ = [...FINANCE_READ, "SUPERVISOR", "CASH_COLLECTOR"];

const OWNER_TYPES = [
  "DRIVER_CASH",
  "VENDOR_PAYABLE",
  "PLATFORM_REVENUE",
  "PLATFORM_CLEARING",
  // Revision 14 — a delivery company's prepaid cash account.
  "FLEET_CASH",
] as const;

// Who may act on a fleet deposit. Reading it is the cash desk's job, so
// REMITTANCE_READ covers the queue; confirming is money arriving on Darb's
// books, which is an accountant's call and not a cash collector's.
const DEPOSIT_CONFIRM = ["ACCOUNTANT", "ADMIN"];

const DEPOSIT_METHODS = ["CASH", "BANK_TRANSFER", "AL_MUZAINI"] as const;

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── Zod schemas ───────────────────────────────────────────────────────────

/** Positive KWD amount, ≤3 decimal places, as string or number. */
const amountKwdSchema = z
  .union([z.string(), z.number()])
  .refine(
    (v) => /^\d+(\.\d{1,3})?$/.test(String(v)) && parseFloat(String(v)) > 0,
    { message: "amountKwd must be a positive amount with at most 3 decimal places" }
  );

const createRemittanceSchema = z.object({
  driverId: z.string().min(1, "Driver is required"),
  amountKwd: amountKwdSchema,
  method: z.enum(DEPOSIT_METHODS),
  note: z.string().max(500).optional(),
  receiptUrl: z.string().min(1).max(2000).optional(),
});

const createAdjustmentSchema = z.object({
  accountId: z.string().min(1, "Account is required"),
  direction: z.enum(["DEBIT", "CREDIT"]),
  amountKwd: amountKwdSchema,
  reason: z.string().trim().min(5, "Reason must be at least 5 characters"),
});

// ─── Accounts ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/wallets/accounts:
 *   get:
 *     tags: [Wallets]
 *     summary: List wallet accounts (cached balances)
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [DRIVER_CASH, VENDOR_PAYABLE, PLATFORM_REVENUE, PLATFORM_CLEARING] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated wallet accounts with balances as 3dp strings
 */
router.get("/accounts", rbac(...BALANCE_READ), async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { type } = req.query;

    const where: any = { tenantId };
    if (type) {
      if (!OWNER_TYPES.includes(type as any)) {
        res.status(400).json({ error: `type must be one of ${OWNER_TYPES.join(", ")}` });
        return;
      }
      where.ownerType = type as string;
    }

    const [accounts, total] = await Promise.all([
      prisma.walletAccount.findMany({
        where: { ...where, tenantId },
        skip,
        take: limit,
        orderBy: [{ ownerType: "asc" }, { ownerKey: "asc" }],
      }),
      prisma.walletAccount.count({ where: { ...where, tenantId } }),
    ]);

    const data = accounts.map((a) => ({
      id: a.id,
      ownerType: a.ownerType,
      ownerKey: a.ownerKey,
      balanceKwd: toKwdString(a.balanceKwd),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/wallets/entries:
 *   get:
 *     tags: [Wallets]
 *     summary: Ledger entries across every account in the tenant, newest first
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [DRIVER_CASH, VENDOR_PAYABLE, PLATFORM_REVENUE, PLATFORM_CLEARING] }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Paginated entries with the owning account and transaction context
 */
router.get("/entries", rbac(...FINANCE_READ), async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { accountId, type, dateFrom, dateTo } = req.query;

    const where: any = { tenantId };
    if (accountId) where.accountId = accountId as string;
    if (type) {
      if (!OWNER_TYPES.includes(type as any)) {
        res.status(400).json({ error: `type must be one of ${OWNER_TYPES.join(", ")}` });
        return;
      }
      where.account = { ownerType: type as string };
    }
    // dateFrom/dateTo are inclusive calendar days in the server's local zone —
    // parseLocalDate keeps this window identical to /remittances below, which
    // matters because Kuwait is UTC+3 and a hardcoded Z would shift the day.
    if (dateFrom || dateTo) {
      const from = dateFrom ? parseLocalDate(dateFrom as string) : null;
      const to = dateTo ? parseLocalDateEnd(dateTo as string) : null;
      if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
        res.status(400).json({ error: "dateFrom/dateTo must be YYYY-MM-DD" });
        return;
      }
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const [entries, total] = await Promise.all([
      prisma.walletEntry.findMany({
        where: { ...where, tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          account: { select: { id: true, ownerType: true, ownerKey: true } },
          transaction: {
            select: { id: true, type: true, memo: true, orderId: true, remittanceId: true },
          },
        },
      }),
      prisma.walletEntry.count({ where: { ...where, tenantId } }),
    ]);

    const data = entries.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      account: {
        id: e.account.id,
        ownerType: e.account.ownerType,
        ownerKey: e.account.ownerKey,
      },
      direction: e.direction,
      amountKwd: toKwdString(e.amountKwd),
      runningBalanceKwd: toKwdString(e.runningBalanceKwd),
      createdAt: e.createdAt,
      transaction: {
        id: e.transaction.id,
        type: e.transaction.type,
        memo: e.transaction.memo,
        orderId: e.transaction.orderId,
        remittanceId: e.transaction.remittanceId,
      },
    }));

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/wallets/accounts/{id}/entries:
 *   get:
 *     tags: [Wallets]
 *     summary: Ledger entries for one account, newest first, with transaction context
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated entries with joined transaction type/memo/orderId
 *       404:
 *         description: Account not found
 */
router.get(
  "/accounts/:id/entries",
  rbac(...FINANCE_READ),
  async (req: Request, res: Response) => {
    try {
      const { skip, limit, page } = getPagination(req);
      const tenantId = req.user!.tenantId;

      const account = await prisma.walletAccount.findFirst({
        where: { id: req.params.id, tenantId },
        select: { id: true, ownerType: true, ownerKey: true, balanceKwd: true },
      });
      if (!account) {
        res.status(404).json({ error: "Wallet account not found" });
        return;
      }

      const where = { tenantId, accountId: account.id };
      const [entries, total] = await Promise.all([
        prisma.walletEntry.findMany({
          where: { ...where, tenantId },
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            transaction: {
              select: { id: true, type: true, memo: true, orderId: true, remittanceId: true },
            },
          },
        }),
        prisma.walletEntry.count({ where: { ...where, tenantId } }),
      ]);

      const data = entries.map((e) => ({
        id: e.id,
        direction: e.direction,
        amountKwd: toKwdString(e.amountKwd),
        runningBalanceKwd: toKwdString(e.runningBalanceKwd),
        createdAt: e.createdAt,
        transaction: {
          id: e.transaction.id,
          type: e.transaction.type,
          memo: e.transaction.memo,
          orderId: e.transaction.orderId,
          remittanceId: e.transaction.remittanceId,
        },
      }));

      res.json({
        account: {
          id: account.id,
          ownerType: account.ownerType,
          ownerKey: account.ownerKey,
          balanceKwd: toKwdString(account.balanceKwd),
        },
        ...paginatedResponse(data, total, page, limit),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── Remittances ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/wallets/remittances:
 *   post:
 *     tags: [Wallets]
 *     summary: Record a driver cash hand-in (posts the wallet transaction)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId, amountKwd, method]
 *             properties:
 *               driverId: { type: string }
 *               amountKwd: { type: string, example: "12.500" }
 *               method: { type: string, enum: [CASH, BANK_TRANSFER, AL_MUZAINI] }
 *               note: { type: string }
 *               receiptUrl: { type: string }
 *     responses:
 *       201:
 *         description: Remittance recorded; returns the new driver cash balance
 *       400:
 *         description: Validation error (e.g. amount exceeds driver cash balance)
 */
router.post(
  "/remittances",
  rbac(...REMITTANCE_WRITE),
  validateBody(createRemittanceSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { driverId, amountKwd, method, note, receiptUrl } = req.body;

      const result = await recordRemittance(
        tenantId,
        { driverId, amountKwd, method, note, receiptUrl },
        req.user!.userId
      );

      res.status(201).json({
        remittance: {
          id: result.remittance.id,
          driverId: result.remittance.driverId,
          amountKwd: toKwdString(result.remittance.amountKwd),
          method: result.remittance.method,
          receiptUrl: result.remittance.receiptUrl,
          receivedById: result.remittance.receivedById,
          createdAt: result.remittance.createdAt,
        },
        balanceKwd: toKwdString(result.balanceKwd),
      });
    } catch (err: any) {
      if (err instanceof WalletError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/wallets/remittances:
 *   get:
 *     tags: [Wallets]
 *     summary: List remittances with driver/date filters
 *     parameters:
 *       - in: query
 *         name: driverId
 *         schema: { type: string }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Paginated remittances, newest first
 */
router.get("/remittances", rbac(...REMITTANCE_READ), async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { driverId, dateFrom, dateTo } = req.query;

    const where: any = { tenantId };
    if (driverId) where.driverId = driverId as string;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = parseLocalDate(dateFrom as string);
      if (dateTo) where.createdAt.lte = parseLocalDateEnd(dateTo as string);
    }

    const [remittances, total] = await Promise.all([
      prisma.remittance.findMany({
        where: { ...where, tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          driver: { select: { id: true, name: true, phone: true, driverCode: true } },
        },
      }),
      prisma.remittance.count({ where: { ...where, tenantId } }),
    ]);

    // The hand-in note lives on the wallet transaction memo (Remittance has no
    // note column), so fetch the memos for this page and fold them back in.
    const memoByRemittanceId = new Map<string, string | null>();
    if (remittances.length > 0) {
      const transactions = await prisma.walletTransaction.findMany({
        where: { tenantId, remittanceId: { in: remittances.map((r) => r.id) } },
        select: { remittanceId: true, memo: true },
      });
      for (const tx of transactions) {
        if (tx.remittanceId) memoByRemittanceId.set(tx.remittanceId, tx.memo);
      }
    }

    const data = remittances.map((r) => ({
      id: r.id,
      driverId: r.driverId,
      driver: r.driver,
      amountKwd: toKwdString(r.amountKwd),
      method: r.method,
      note: memoByRemittanceId.get(r.id) ?? null,
      receiptUrl: r.receiptUrl,
      receivedById: r.receivedById,
      createdAt: r.createdAt,
    }));

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Fleet cash deposits (revision 14) ─────────────────────────────────────
//
// The cash desk's other queue. A delivery company submits a deposit from its
// own portal, and an accountant here is the ONLY thing that credits FLEET_CASH
// — same posture as a merchant top-up, for the same reason: a portal that could
// credit itself is a portal that can pay Darb with a form.

/**
 * @swagger
 * /api/wallets/fleet-deposits:
 *   get:
 *     tags: [Wallets]
 *     summary: Fleet cash deposits, newest first (default: the pending queue)
 */
router.get("/fleet-deposits", rbac(...REMITTANCE_READ), async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { page, limit, skip } = getPagination(req);
    // The screen this feeds is a work queue, so the default is what is waiting.
    // `status=ALL` is the explicit way to ask for the history.
    const requested = typeof req.query.status === "string" ? req.query.status : "PENDING";
    const status = requested === "ALL" ? undefined : requested;
    const { data, total } = await listFleetDeposits({
      tenantId,
      status,
      take: limit,
      skip,
      withPartnerName: true,
      ...(typeof req.query.fleetPartnerId === "string"
        ? { fleetPartnerIds: [req.query.fleetPartnerId] }
        : {}),
    });
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/wallets/fleet-deposits/{id}/confirm:
 *   post:
 *     tags: [Wallets]
 *     summary: Confirm the money arrived and credit the company's cash account
 */
router.post(
  "/fleet-deposits/:id/confirm",
  rbac(...DEPOSIT_CONFIRM),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = req.user!;
      const result = await confirmFleetDeposit({
        tenantId,
        depositId: req.params.id,
        actorId: userId,
      });
      res.json(result);
    } catch (err: any) {
      // A deposit somebody else already acted on is a conflict, not a bad
      // request: the accountant did nothing wrong, the screen was just stale.
      if (err instanceof FleetCashConflict) { res.status(409).json({ error: err.message }); return; }
      if (err instanceof WalletError) { res.status(400).json({ error: err.message }); return; }
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/wallets/fleet-deposits/{id}/reject:
 *   post:
 *     tags: [Wallets]
 *     summary: Refuse a deposit. Posts nothing; a reason is required.
 */
router.post(
  "/fleet-deposits/:id/reject",
  rbac(...DEPOSIT_CONFIRM),
  async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = req.user!;
      const { reason } = req.body as { reason?: string };
      const ok = await rejectFleetDeposit({
        tenantId,
        depositId: req.params.id,
        actorId: userId,
        reason: reason ?? "",
      });
      if (!ok) {
        res.status(409).json({ error: "This deposit has already been acted on" });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof WalletError) { res.status(400).json({ error: err.message }); return; }
      res.status(500).json({ error: err.message });
    }
  },
);

// ─── Adjustments (ADMIN only — compensating transactions) ──────────────────

/**
 * @swagger
 * /api/wallets/adjustments:
 *   post:
 *     tags: [Wallets]
 *     summary: Post an ADMIN balance adjustment (compensating transaction)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountId, direction, amountKwd, reason]
 *             properties:
 *               accountId: { type: string }
 *               direction: { type: string, enum: [DEBIT, CREDIT] }
 *               amountKwd: { type: string, example: "5.000" }
 *               reason: { type: string, minLength: 5 }
 *     responses:
 *       201:
 *         description: Adjustment posted; returns the account's new balance
 *       400:
 *         description: Validation error
 */
router.post(
  "/adjustments",
  rbac("ADMIN"),
  validateBody(createAdjustmentSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { accountId, direction, amountKwd, reason } = req.body;

      const result = await postAdjustment(
        tenantId,
        { accountId, direction, amountKwd, reason },
        req.user!.userId
      );

      res.status(201).json({
        transactionId: result.transactionId,
        account: {
          id: result.account.id,
          balanceKwd: toKwdString(result.account.balanceKwd),
        },
      });
    } catch (err: any) {
      if (err instanceof WalletError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── Reconciliation runs ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/wallets/reconciliation:
 *   get:
 *     tags: [Wallets]
 *     summary: List nightly wallet reconciliation runs, latest first
 *     responses:
 *       200:
 *         description: Paginated reconciliation runs with per-check results
 */
router.get("/reconciliation", rbac(...FINANCE_READ), async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;

    const where = { tenantId };
    const [runs, total] = await Promise.all([
      prisma.walletReconciliationRun.findMany({
        where: { ...where, tenantId },
        skip,
        take: limit,
        orderBy: { runDate: "desc" },
      }),
      prisma.walletReconciliationRun.count({ where: { ...where, tenantId } }),
    ]);

    res.json(paginatedResponse(runs, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Vendor statements (PRD §11 monthly netting) ────────────────────────────

/**
 * @swagger
 * /api/wallets/vendor-statements:
 *   get:
 *     tags: [Wallets]
 *     summary: List monthly vendor statements (finance)
 */
router.get("/vendor-statements", rbac(...FINANCE_READ), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const where: any = { tenantId };
    if (typeof req.query.vendorId === "string") where.vendorId = req.query.vendorId;
    if (typeof req.query.status === "string") where.status = req.query.status;
    const { skip, page, limit } = getPagination(req);
    const [rows, total] = await Promise.all([
      prisma.vendorStatement.findMany({
        where,
        orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: { vendor: { select: { id: true, name: true, code: true } } },
      }),
      prisma.vendorStatement.count({ where }),
    ]);
    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Revision 4 (#4) / revision 5 (#2). The rows behind one statement, shared by
 * the on-screen drill-in and the Excel export so the download can never
 * disagree with the screen it was opened from.
 *
 * Returns null when the statement is not this tenant's.
 */
async function loadStatementDetail(tenantId: string, statementId: string) {
      const statement = await prisma.vendorStatement.findFirst({
        where: { id: statementId, tenantId },
        include: { vendor: { select: { id: true, name: true, code: true } } },
      });
      if (!statement) return null;

      const period = {
        gte: statement.periodStart,
        lt: statement.periodEnd, // periodEnd is exclusive, per the model
      };

      const [orders, refunds, payoutTx] = await Promise.all([
        prisma.deliveryOrder.findMany({
          where: {
            tenantId,
            vendorId: statement.vendorId,
            status: "DELIVERED",
            deliveredAt: period,
          },
          orderBy: { deliveredAt: "asc" },
          select: {
            id: true,
            orderNumber: true,
            deliveredAt: true,
            paymentMethod: true,
            orderTotalKwd: true,
            deliveryFeeKwd: true,
            codCollectedKwd: true,
            customerName: true,
          },
        }),
        prisma.refund.findMany({
          where: {
            tenantId,
            vendorId: statement.vendorId,
            status: "PROCESSED",
            updatedAt: period,
          },
          orderBy: { updatedAt: "asc" },
          include: { order: { select: { orderNumber: true } } },
        }),
        statement.payoutTxId
          ? prisma.walletTransaction.findFirst({
              where: { id: statement.payoutTxId, tenantId },
              include: { entries: true },
            })
          : Promise.resolve(null),
      ]);

      // The postings behind the order rows, fetched in one query and grouped
      // rather than one query per order.
      const orderIds = orders.map((o) => o.id);
      const txs = orderIds.length
        ? await prisma.walletTransaction.findMany({
            where: { tenantId, orderId: { in: orderIds } },
            include: { entries: { include: { account: { select: { ownerType: true } } } } },
          })
        : [];
      const txByOrder = new Map<string, typeof txs>();
      for (const tx of txs) {
        if (!tx.orderId) continue;
        const list = txByOrder.get(tx.orderId) ?? [];
        list.push(tx);
        txByOrder.set(tx.orderId, list);
      }

      const serialiseEntries = (list: typeof txs) =>
        list.flatMap((tx) =>
          tx.entries.map((e: any) => ({
            id: e.id,
            transactionType: tx.type,
            account: e.account?.ownerType ?? null,
            direction: e.direction,
            amountKwd: toKwdString(e.amountKwd),
            runningBalanceKwd: toKwdString(e.runningBalanceKwd),
            createdAt: e.createdAt,
          })),
        );

      const rows = [
        ...orders.map((o) => {
          const total = Number(o.orderTotalKwd ?? 0);
          const fee = Number(o.deliveryFeeKwd ?? 0);
          return {
            kind: "DELIVERY" as const,
            date: o.deliveredAt,
            orderId: o.id,
            orderNumber: o.orderNumber,
            reference: o.customerName ?? null,
            paymentMethod: o.paymentMethod,
            orderTotalKwd: total.toFixed(3),
            deliveryFeeKwd: fee.toFixed(3),
            // What the shop is owed for this order: COD collected less our fee.
            // Prepaid orders collect nothing, so the shop owes us the fee.
            codNetKwd: (Number(o.codCollectedKwd ?? 0) - fee).toFixed(3),
            entries: serialiseEntries(txByOrder.get(o.id) ?? []),
          };
        }),
        ...refunds.map((r) => ({
          kind: "REFUND" as const,
          date: r.updatedAt,
          orderId: r.orderId,
          orderNumber: r.order?.orderNumber ?? null,
          reference: r.reason,
          paymentMethod: null,
          orderTotalKwd: (-Number(r.amountKwd ?? 0)).toFixed(3),
          deliveryFeeKwd: null,
          codNetKwd: (-Number(r.amountKwd ?? 0)).toFixed(3),
          entries: [],
        })),
        ...(payoutTx
          ? [
              {
                kind: "PAYOUT" as const,
                date: payoutTx.createdAt,
                orderId: null,
                orderNumber: null,
                reference: payoutTx.memo ?? "Statement settled",
                paymentMethod: null,
                orderTotalKwd: null,
                deliveryFeeKwd: null,
                codNetKwd: (-Number(statement.closingBalanceKwd ?? 0)).toFixed(3),
                entries: serialiseEntries([payoutTx as any]),
              },
            ]
          : []),
      ].sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());

      return {
        raw: statement,
        statement: {
          id: statement.id,
          vendor: statement.vendor,
          periodStart: statement.periodStart,
          periodEnd: statement.periodEnd,
          openingBalanceKwd: toKwdString(statement.openingBalanceKwd),
          codNetKwd: toKwdString(statement.codNetKwd),
          prepaidFeesKwd: toKwdString(statement.prepaidFeesKwd),
          refundsKwd: toKwdString(statement.refundsKwd),
          closingBalanceKwd: toKwdString(statement.closingBalanceKwd),
          status: statement.status,
        },
        rows,
      };
}

/**
 * @swagger
 * /api/wallets/vendor-statements/{id}/transactions:
 *   get:
 *     tags: [Wallets]
 *     summary: Every transaction behind one shop's statement period
 *     description: >
 *       Revision 4 (#4). The statement list answers "what do we owe this shop";
 *       this answers "why". One row per order delivered in the period, plus the
 *       refunds and the payout, each carrying the ledger postings behind it.
 */
router.get(
  "/vendor-statements/:id/transactions",
  rbac(...FINANCE_READ),
  async (req: Request, res: Response) => {
    try {
      const detail = await loadStatementDetail(req.user!.tenantId, req.params.id);
      if (!detail) { res.status(404).json({ error: "Statement not found" }); return; }
      res.json({ statement: detail.statement, rows: detail.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ─── Revision 5 (#2): the shop statement as a real workbook ─────────────────

type StatementRow = NonNullable<Awaited<ReturnType<typeof loadStatementDetail>>>["rows"][number];

/**
 * The three columns the client asked for, per transaction.
 *
 * These are not a new calculation — they are the double-entry postings the
 * ledger already makes, written the way a merchant reads their account:
 *
 *   walletCredit  what went INTO the shop's wallet. A cash order puts the order
 *                 amount in (the fee is not the shop's money and never was); a
 *                 card order puts in nothing, because Darb collected nothing on
 *                 the shop's behalf.
 *   deliveryFee   what Darb charges, always negative, on every order whichever
 *                 way the customer paid.
 *   (the caller runs these two into a balance.)
 *
 * postCodSettlement credits VENDOR_PAYABLE by exactly (total − fee) and
 * postPrepaidSettlement debits it by the fee, so the two columns below sum to
 * the same movement the ledger booked. If they ever stop agreeing, the ledger
 * is right and this is wrong.
 */
function walletColumns(row: StatementRow): { credit: number; fee: number } {
  if (row.kind === "DELIVERY") {
    return {
      credit: row.paymentMethod === "COD" ? Number(row.orderTotalKwd ?? 0) : 0,
      fee: -Number(row.deliveryFeeKwd ?? 0),
    };
  }
  // A refund reverses money out of the wallet and a payout empties it; both are
  // already signed on codNetKwd, and neither carries a delivery fee.
  return { credit: Number(row.codNetKwd ?? 0), fee: 0 };
}

const KWD_FMT = "#,##0.000";

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 characters. */
function sheetName(code: string | null | undefined, periodStart: Date): string {
  const base = `${code ?? "shop"} ${periodStart.toISOString().slice(0, 7)}`;
  return base.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
}

async function writeStatementSheet(
  workbook: ExcelJS.Workbook,
  detail: NonNullable<Awaited<ReturnType<typeof loadStatementDetail>>>,
) {
  const { statement, rows } = detail;
  const sheet = workbook.addWorksheet(sheetName(statement.vendor?.code, statement.periodStart));

  sheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Order", key: "order", width: 20 },
    { header: "Type", key: "type", width: 12 },
    { header: "Payment", key: "payment", width: 10 },
    { header: "Reference", key: "reference", width: 26 },
    { header: "Order total (KD)", key: "total", width: 17, style: { numFmt: KWD_FMT } },
    { header: "Wallet credit (KD)", key: "credit", width: 18, style: { numFmt: KWD_FMT } },
    { header: "Delivery fee (KD)", key: "fee", width: 17, style: { numFmt: KWD_FMT } },
    { header: "Wallet balance (KD)", key: "balance", width: 19, style: { numFmt: KWD_FMT } },
  ];

  // The period does not start at zero. It starts wherever the shop's wallet
  // stood when the last statement closed, and the client asked for "the current
  // full balance of the account", not a balance since the first of the month.
  const opening = Number(statement.openingBalanceKwd);
  sheet.addRow({
    date: statement.periodStart.toISOString().slice(0, 10),
    order: "n/a",
    type: "Opening balance",
    payment: "n/a",
    reference: "n/a",
    balance: opening,
  });

  let running = opening;
  let creditTotal = 0;
  let feeTotal = 0;
  for (const row of rows) {
    const { credit, fee } = walletColumns(row);
    running += credit + fee;
    creditTotal += credit;
    feeTotal += fee;
    sheet.addRow({
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "n/a",
      order: row.orderNumber ?? "n/a",
      type: row.kind === "DELIVERY" ? "Delivery" : row.kind === "REFUND" ? "Refund" : "Payout",
      payment: row.paymentMethod === "COD" ? "Cash" : row.paymentMethod ? "Card" : "n/a",
      reference: row.reference ?? "n/a",
      total: row.orderTotalKwd == null ? "n/a" : Number(row.orderTotalKwd),
      credit,
      fee,
      balance: running,
    });
  }

  const totals = sheet.addRow({
    type: "Totals",
    credit: creditTotal,
    fee: feeTotal,
    balance: running,
  });
  totals.font = { bold: true };
  totals.border = { top: { style: "thin" } };

  // The statement's own closing figure, so the workbook foots to the number on
  // the list row rather than being a second opinion about it.
  const closing = sheet.addRow({
    type: "Net balance",
    balance: Number(statement.closingBalanceKwd),
  });
  closing.font = { bold: true };

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/**
 * @swagger
 * /api/wallets/vendor-statements/export.xlsx:
 *   get:
 *     tags: [Wallets]
 *     summary: Shop statements as an Excel workbook, one sheet per statement
 *     description: >
 *       Revision 5 (#2). The CSV carried the order columns but not the wallet:
 *       "the Excel sheet should be complete with the order amount, the fee that
 *       is deducted, and the current full balance of the account for each
 *       transaction". Three money columns per row — wallet credit, delivery fee
 *       as a negative, and the running balance — opened from the shop's real
 *       opening balance and footed to the statement's net.
 *
 *       `?id=` exports one statement. Without it the same vendorId/status
 *       filters as the list apply and each statement gets its own sheet.
 */
router.get(
  "/vendor-statements/export.xlsx",
  rbac(...FINANCE_READ),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;

      let ids: string[];
      if (typeof req.query.id === "string") {
        ids = [req.query.id];
      } else {
        const where: any = { tenantId };
        if (typeof req.query.vendorId === "string") where.vendorId = req.query.vendorId;
        if (typeof req.query.status === "string") where.status = req.query.status;
        const found = await prisma.vendorStatement.findMany({
          where,
          orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
          // A finance user exporting "everything" wants this month's shops, not
          // three years of them, and a workbook per shop per month gets slow
          // long before it gets useful.
          take: 60,
          select: { id: true },
        });
        ids = found.map((s) => s.id);
      }

      const details = (
        await Promise.all(ids.map((id) => loadStatementDetail(tenantId, id)))
      ).filter((d): d is NonNullable<typeof d> => d !== null);

      // An id that resolves to nothing is a wrong id or another tenant's. Say
      // so rather than handing back an empty workbook that reads as "this shop
      // had no activity".
      if (details.length === 0) {
        res.status(404).json({ error: "No statements found" });
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Darb";
      workbook.created = new Date();
      for (const detail of details) await writeStatementSheet(workbook, detail);

      const single = details.length === 1 ? details[0].statement : null;
      const slug = single
        ? `statement-${single.vendor?.code ?? "shop"}-${single.periodStart
            .toISOString()
            .slice(0, 7)}`.replace(/[^A-Za-z0-9-]/g, "-")
        : `shop-statements-${new Date().toISOString().slice(0, 10)}`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${slug}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/wallets/vendor-statements/generate:
 *   post:
 *     tags: [Wallets]
 *     summary: Generate statements for the last closed month (idempotent)
 */
router.post(
  "/vendor-statements/generate",
  rbac("ADMIN", "ACCOUNTANT"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const period = previousMonthPeriod();
      const created = await generateMonthlyStatements(tenantId, period);
      res.json({ ok: true, created, periodStart: period.start, periodEnd: period.end });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * @swagger
 * /api/wallets/vendor-statements/{id}/payout:
 *   post:
 *     tags: [Wallets]
 *     summary: Settle a positive statement — posts VENDOR_PAYOUT and marks PAID
 */
router.post(
  "/vendor-statements/:id/payout",
  rbac("ADMIN", "ACCOUNTANT"),
  async (req: Request, res: Response) => {
    try {
      const posted = await postVendorPayout({
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

// ─── Refunds (PRD §11 — merchant approves, Darb processes) ─────────────────

/**
 * @swagger
 * /api/wallets/refunds:
 *   get:
 *     tags: [Wallets]
 *     summary: List refund requests (finance)
 */
router.get("/refunds", rbac(...FINANCE_READ), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const where: any = { tenantId };
    if (typeof req.query.status === "string") where.status = req.query.status;
    if (typeof req.query.vendorId === "string") where.vendorId = req.query.vendorId;
    const { skip, page, limit } = getPagination(req);
    const [rows, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          order: { select: { id: true, orderNumber: true } },
          vendor: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.refund.count({ where }),
    ]);
    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/wallets/refunds/{id}/process:
 *   post:
 *     tags: [Wallets]
 *     summary: Approve (posts compensating REFUND) or reject a refund request
 */
router.post(
  "/refunds/:id/process",
  rbac("ADMIN", "ACCOUNTANT"),
  validateBody(z.object({ approve: z.boolean() })),
  async (req: Request, res: Response) => {
    try {
      const refund = await processRefund({
        tenantId: req.user!.tenantId,
        refundId: req.params.id,
        approve: (req.body as { approve: boolean }).approve,
        actorId: req.user!.userId,
      });
      res.json(refund);
    } catch (err: any) {
      if (err instanceof RefundError || err instanceof WalletError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message });
    }
  },
);

export default router;
