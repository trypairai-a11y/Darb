// Darb 2.0 — /api/wallets (plan §A8). Ledger accounts, entries, remittances,
// ADMIN adjustments, and reconciliation runs. House conventions per
// routes/violations.ts: authMiddleware + tenantScope on the router, rbac()
// per route, getPagination/paginatedResponse, try/catch → { error }.
// Money is serialized as 3dp strings (Number(x).toFixed(3) house pattern).
// WalletTransaction/WalletEntry are append-only — this file exposes NO
// update or delete path for them; corrections go through POST /adjustments.

import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { parseLocalDate, parseLocalDateEnd } from "../utils/date";
import { validateBody } from "../utils/validate";
import { postAdjustment, toKwdString, WalletError } from "../services/wallet/walletService";
import { recordRemittance } from "../services/wallet/remittanceService";

const FINANCE_READ = ["ADMIN", "OPS_MANAGER", "ACCOUNTANT"];
const REMITTANCE_WRITE = ["ACCOUNTANT", "SUPERVISOR", "ADMIN"];
const REMITTANCE_READ = ["ADMIN", "OPS_MANAGER", "ACCOUNTANT", "SUPERVISOR"];

const OWNER_TYPES = [
  "DRIVER_CASH",
  "VENDOR_PAYABLE",
  "PLATFORM_REVENUE",
  "PLATFORM_CLEARING",
] as const;

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
router.get("/accounts", rbac(...FINANCE_READ), async (req: Request, res: Response) => {
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
        include: { driver: { select: { id: true, name: true, phone: true } } },
      }),
      prisma.remittance.count({ where: { ...where, tenantId } }),
    ]);

    const data = remittances.map((r) => ({
      id: r.id,
      driverId: r.driverId,
      driver: r.driver,
      amountKwd: toKwdString(r.amountKwd),
      method: r.method,
      receiptUrl: r.receiptUrl,
      receivedById: r.receivedById,
      createdAt: r.createdAt,
    }));

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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

export default router;
