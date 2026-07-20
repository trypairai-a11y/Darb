// Darb 2.0 — Wallet engine (plan §A5). Double-entry, append-only ledger.
//
// ── SIGN CONVENTIONS (single source of truth — keep consistent) ────────────
// Every WalletAccount has one of two polarities:
//
//   ASSET-like   (DRIVER_CASH, PLATFORM_CLEARING):
//     DEBIT  ⇒ balance increases, CREDIT ⇒ balance decreases
//   LIABILITY/INCOME-like (VENDOR_PAYABLE, PLATFORM_REVENUE):
//     CREDIT ⇒ balance increases, DEBIT  ⇒ balance decreases
//
// Balance meanings:
//   DRIVER_CASH.balanceKwd       = cash the driver currently holds for us
//   VENDOR_PAYABLE.balanceKwd    = what we owe the vendor (may go negative
//                                  when prepaid fees exceed COD receipts)
//   PLATFORM_REVENUE.balanceKwd  = accumulated delivery fees earned
//   PLATFORM_CLEARING.balanceKwd = remitted cash received at the hub,
//                                  awaiting banking
//
// Postings (one WalletTransaction + balanced WalletEntry legs each;
// Σ DEBIT amounts === Σ CREDIT amounts, every leg amount > 0):
//   COD delivered   ("cod-settle:{orderId}"):
//     driver cash   DEBIT  total          (driver collected the cash)
//     vendor payable CREDIT (total − fee) (we owe the vendor their share)
//     platform revenue CREDIT fee         (our delivery fee)
//   Prepaid delivered ("prepaid-settle:{orderId}"):
//     vendor payable DEBIT fee            (fee deducted from what we owe)
//     platform revenue CREDIT fee
//   Remittance      ("remit:{remittanceId}"):
//     driver cash    CREDIT amount        (driver handed cash in)
//     platform clearing DEBIT amount      (hub now holds it)
//   Adjustment      ("adjust:{uuid}", ADMIN only, reason required):
//     compensating transaction against PLATFORM_CLEARING — never an edit.
//
// Mechanics: the WalletTransaction header is created FIRST so a duplicate
// idempotencyKey (P2002) is caught before any balance is touched — a replay
// inside a live outer transaction must be a true no-op. Then, per leg, the
// account balanceKwd cache is updated via an atomic increment (this acquires
// the row lock), and the WalletEntry records runningBalanceKwd = the
// post-update balance. WalletTransaction/WalletEntry are APPEND-ONLY: there
// are NO update/delete code paths anywhere; corrections are compensating
// transactions.

import { randomUUID } from "crypto";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";

export type Tx = Prisma.TransactionClient;

export type WalletOwnerTypeLiteral =
  | "DRIVER_CASH"
  | "VENDOR_PAYABLE"
  | "PLATFORM_REVENUE"
  | "PLATFORM_CLEARING";

export type EntryDirection = "DEBIT" | "CREDIT";

export type WalletTxTypeLiteral =
  | "COD_SETTLEMENT"
  | "PREPAID_SETTLEMENT"
  | "REMITTANCE"
  | "ADJUSTMENT"
  | "VENDOR_PAYOUT"
  | "REFUND"
  | "TIP"
  | "FLEET_PAYOUT";

/** Domain error — routes map instances to HTTP 400. */
export class WalletError extends Error {}

const ZERO = new Prisma.Decimal(0);

/** Accounts where DEBIT increases the balance (see sign conventions above). */
const ASSET_LIKE: ReadonlySet<WalletOwnerTypeLiteral> = new Set([
  "DRIVER_CASH",
  "PLATFORM_CLEARING",
]);

/** Serialize any money value as a 3dp string (house pattern: Number(x).toFixed(3)). */
export function toKwdString(
  value: Prisma.Decimal | number | string | null | undefined
): string {
  return Number(value ?? 0).toFixed(3);
}

function isP2002(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "P2002";
}

export function driverOwnerKey(driverId: string): string {
  return `DRIVER:${driverId}`;
}

export function vendorOwnerKey(vendorId: string): string {
  return `VENDOR:${vendorId}`;
}

function ownerKeyFor(
  ownerType: WalletOwnerTypeLiteral,
  opts?: { driverId?: string; vendorId?: string }
): string {
  switch (ownerType) {
    case "DRIVER_CASH":
      if (!opts?.driverId) throw new WalletError("driverId required for DRIVER_CASH account");
      return driverOwnerKey(opts.driverId);
    case "VENDOR_PAYABLE":
      if (!opts?.vendorId) throw new WalletError("vendorId required for VENDOR_PAYABLE account");
      return vendorOwnerKey(opts.vendorId);
    case "PLATFORM_REVENUE":
      return "PLATFORM_REVENUE";
    case "PLATFORM_CLEARING":
      return "PLATFORM_CLEARING";
  }
}

/**
 * Signed balance delta a leg applies to its account, per the polarity table.
 */
function balanceDelta(
  ownerType: WalletOwnerTypeLiteral,
  direction: EntryDirection,
  amountKwd: Prisma.Decimal
): Prisma.Decimal {
  const increases = ASSET_LIKE.has(ownerType) ? direction === "DEBIT" : direction === "CREDIT";
  return increases ? amountKwd : amountKwd.neg();
}

/**
 * Find-or-create the ledger account for an owner. Idempotent (upsert on the
 * [tenantId, ownerKey] unique); the empty update makes replays free of side
 * effects. Safe to call before the idempotency check of a posting.
 */
export async function ensureAccount(
  tx: Tx,
  tenantId: string,
  ownerType: "DRIVER_CASH" | "VENDOR_PAYABLE" | "PLATFORM_REVENUE" | "PLATFORM_CLEARING",
  opts?: { driverId?: string; vendorId?: string }
): Promise<{ id: string; balanceKwd: Prisma.Decimal }> {
  const ownerKey = ownerKeyFor(ownerType, opts);
  const account = await tx.walletAccount.upsert({
    where: { tenantId_ownerKey: { tenantId, ownerKey } },
    create: { tenantId, ownerType, ownerKey },
    update: {},
  });
  return { id: account.id, balanceKwd: account.balanceKwd };
}

// ─── Core posting primitive ────────────────────────────────────────────────

export interface LedgerLeg {
  accountId: string;
  ownerType: WalletOwnerTypeLiteral;
  direction: EntryDirection;
  amountKwd: Prisma.Decimal;
}

export interface PostResult {
  transactionId: string;
  /** accountId → post-update cached balance */
  balances: Record<string, Prisma.Decimal>;
}

/**
 * Post one balanced double-entry transaction. Returns null when the
 * idempotencyKey already exists (replay ⇒ no-op — the header create fires
 * P2002 BEFORE any balance is touched) or when there are no legs to post.
 *
 * Legs are applied in accountId order (deterministic lock order → no
 * deadlocks between concurrent postings touching the same accounts).
 */
export async function postLedgerTransaction(
  tx: Tx,
  opts: {
    tenantId: string;
    type: WalletTxTypeLiteral;
    idempotencyKey: string;
    orderId?: string;
    remittanceId?: string;
    memo?: string | null;
    createdById?: string | null;
    legs: LedgerLeg[];
  }
): Promise<PostResult | null> {
  const legs = opts.legs;
  if (legs.length === 0) return null;

  let debits = ZERO;
  let credits = ZERO;
  for (const leg of legs) {
    if (leg.amountKwd.lte(0)) {
      throw new WalletError("Wallet entry amounts must be greater than zero");
    }
    if (leg.direction === "DEBIT") debits = debits.plus(leg.amountKwd);
    else credits = credits.plus(leg.amountKwd);
  }
  if (!debits.equals(credits)) {
    throw new WalletError(
      `Unbalanced wallet transaction ${opts.idempotencyKey}: debits ${debits.toString()} != credits ${credits.toString()}`
    );
  }

  // 1. Header first — the @unique idempotencyKey is the replay guard. On
  //    P2002 we return WITHOUT touching any balance so the surrounding
  //    interactive transaction commits unchanged (true no-op).
  let transactionId: string;
  try {
    const header = await tx.walletTransaction.create({
      data: {
        tenantId: opts.tenantId,
        type: opts.type,
        idempotencyKey: opts.idempotencyKey,
        orderId: opts.orderId ?? null,
        remittanceId: opts.remittanceId ?? null,
        memo: opts.memo ?? null,
        createdById: opts.createdById ?? null,
      },
    });
    transactionId = header.id;
  } catch (err) {
    if (isP2002(err)) return null;
    throw err;
  }

  // 2. Per leg: balance update FIRST (atomic increment ⇒ row lock), then the
  //    append-only entry carrying runningBalanceKwd = post-update balance.
  const balances: Record<string, Prisma.Decimal> = {};
  const ordered = [...legs].sort((a, b) => a.accountId.localeCompare(b.accountId));
  for (const leg of ordered) {
    const delta = balanceDelta(leg.ownerType, leg.direction, leg.amountKwd);
    const updated = await tx.walletAccount.update({
      where: { id: leg.accountId },
      data: { balanceKwd: { increment: delta } },
    });
    balances[leg.accountId] = updated.balanceKwd;
    await tx.walletEntry.create({
      data: {
        tenantId: opts.tenantId,
        transactionId,
        accountId: leg.accountId,
        direction: leg.direction,
        amountKwd: leg.amountKwd,
        runningBalanceKwd: updated.balanceKwd,
      },
    });
  }

  return { transactionId, balances };
}

/**
 * Build a leg from a desired signed balance delta. Positive delta increases
 * the account balance; the direction follows the polarity table. Returns
 * null for a zero delta (no leg to post).
 */
function legForDelta(
  account: { id: string },
  ownerType: WalletOwnerTypeLiteral,
  signedDeltaKwd: Prisma.Decimal
): LedgerLeg | null {
  if (signedDeltaKwd.isZero()) return null;
  const increase = signedDeltaKwd.gt(0);
  const direction: EntryDirection = ASSET_LIKE.has(ownerType)
    ? increase
      ? "DEBIT"
      : "CREDIT"
    : increase
      ? "CREDIT"
      : "DEBIT";
  return { accountId: account.id, ownerType, direction, amountKwd: signedDeltaKwd.abs() };
}

// ─── Order settlements (called INSIDE the DELIVERED transition's tx) ───────

/**
 * Post the COD settlement for a delivered order. Idempotent via
 * idempotencyKey "cod-settle:{orderId}" (P2002 ⇒ no-op). MUST be called
 * inside the DELIVERED transition's interactive transaction.
 *
 * driver cash +total (DEBIT), vendor payable +(total−fee) (CREDIT),
 * platform revenue +fee (CREDIT). If fee > total the vendor leg flips to a
 * DEBIT of (fee − total) so the transaction stays balanced.
 */
export async function postCodSettlement(
  tx: Tx,
  order: {
    id: string;
    tenantId: string;
    driverId: string;
    vendorId: string;
    orderTotalKwd: Prisma.Decimal;
    deliveryFeeKwd: Prisma.Decimal;
  }
): Promise<void> {
  const total = new Prisma.Decimal(order.orderTotalKwd);
  const fee = new Prisma.Decimal(order.deliveryFeeKwd);
  const vendorShare = total.minus(fee);

  const driverAccount = await ensureAccount(tx, order.tenantId, "DRIVER_CASH", {
    driverId: order.driverId,
  });
  const vendorAccount = await ensureAccount(tx, order.tenantId, "VENDOR_PAYABLE", {
    vendorId: order.vendorId,
  });
  const revenueAccount = await ensureAccount(tx, order.tenantId, "PLATFORM_REVENUE");

  const legs = [
    legForDelta(driverAccount, "DRIVER_CASH", total),
    legForDelta(vendorAccount, "VENDOR_PAYABLE", vendorShare),
    legForDelta(revenueAccount, "PLATFORM_REVENUE", fee),
  ].filter((l): l is LedgerLeg => l !== null);

  await postLedgerTransaction(tx, {
    tenantId: order.tenantId,
    type: "COD_SETTLEMENT",
    idempotencyKey: `cod-settle:${order.id}`,
    orderId: order.id,
    memo: `COD settlement for order ${order.id}`,
    legs,
  });
}

/**
 * Post the prepaid settlement for a delivered order. Idempotent via
 * "prepaid-settle:{orderId}". vendor payable −fee (DEBIT — the payable may
 * go negative), platform revenue +fee (CREDIT). No cash moved.
 */
export async function postPrepaidSettlement(
  tx: Tx,
  order: {
    id: string;
    tenantId: string;
    vendorId: string;
    deliveryFeeKwd: Prisma.Decimal;
  }
): Promise<void> {
  const fee = new Prisma.Decimal(order.deliveryFeeKwd);
  if (fee.lte(0)) return; // nothing to settle

  const vendorAccount = await ensureAccount(tx, order.tenantId, "VENDOR_PAYABLE", {
    vendorId: order.vendorId,
  });
  const revenueAccount = await ensureAccount(tx, order.tenantId, "PLATFORM_REVENUE");

  await postLedgerTransaction(tx, {
    tenantId: order.tenantId,
    type: "PREPAID_SETTLEMENT",
    idempotencyKey: `prepaid-settle:${order.id}`,
    orderId: order.id,
    memo: `Prepaid settlement for order ${order.id}`,
    legs: [
      {
        accountId: vendorAccount.id,
        ownerType: "VENDOR_PAYABLE",
        direction: "DEBIT",
        amountKwd: fee,
      },
      {
        accountId: revenueAccount.id,
        ownerType: "PLATFORM_REVENUE",
        direction: "CREDIT",
        amountKwd: fee,
      },
    ],
  });
}

// ─── Tips (PRD §11 — driver keeps 100%) ────────────────────────────────────

/**
 * Post a customer tip for a delivered order. Idempotent via "tip:{orderId}".
 *
 * Legs: PLATFORM_CLEARING DEBIT tip (the tip reaches Darb through the
 * merchant settlement flow), DRIVER_CASH CREDIT tip (the driver's
 * cash-to-remit drops by the tip, i.e. he keeps it in full at remittance —
 * Darb takes no cut). getDriverWalletSummary surfaces the tip aggregates so
 * the driver app can show them; the remittance UI's "cash to remit" is
 * already net of tips by construction.
 */
export async function postTip(
  tx: Tx,
  order: { id: string; tenantId: string; driverId: string },
  tipKwd: Prisma.Decimal
): Promise<PostResult | null> {
  if (tipKwd.lte(0)) throw new WalletError("Tip must be greater than zero");

  const driverAccount = await ensureAccount(tx, order.tenantId, "DRIVER_CASH", {
    driverId: order.driverId,
  });
  const clearing = await ensureAccount(tx, order.tenantId, "PLATFORM_CLEARING");

  return postLedgerTransaction(tx, {
    tenantId: order.tenantId,
    type: "TIP",
    idempotencyKey: `tip:${order.id}`,
    orderId: order.id,
    memo: `Customer tip for order ${order.id} — driver keeps 100%`,
    legs: [
      {
        accountId: clearing.id,
        ownerType: "PLATFORM_CLEARING",
        direction: "DEBIT",
        amountKwd: tipKwd,
      },
      {
        accountId: driverAccount.id,
        ownerType: "DRIVER_CASH",
        direction: "CREDIT",
        amountKwd: tipKwd,
      },
    ],
  });
}

// ─── Vendor credit line (PRD §11 — cap pauses intake) ──────────────────────

/**
 * Is the vendor's outstanding debt to Darb at or over its credit cap?
 *
 * Debt = the NEGATIVE side of the VENDOR_PAYABLE balance (prepaid fees and
 * refunds drive the payable negative — that IS the credit line being
 * consumed). Vendor.creditCapKwd NULL ⇒ no cap ⇒ never over (same
 * "unconfigured = permissive" stance as isDriverOverCeiling). Reads the
 * cached balanceKwd; the nightly reconciliation is the backstop.
 */
export async function isVendorOverCreditCap(
  tenantId: string,
  vendorId: string
): Promise<boolean> {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, tenantId },
    select: { creditCapKwd: true },
  });
  if (!vendor?.creditCapKwd) return false;

  // eslint-disable-next-line no-prisma-without-tenant -- tenantId is inside the tenantId_ownerKey compound unique key; the rule only sees top-level keys.
  const account = await prisma.walletAccount.findUnique({
    where: { tenantId_ownerKey: { tenantId, ownerKey: vendorOwnerKey(vendorId) } },
    select: { balanceKwd: true },
  });
  if (!account) return false;
  const debt = account.balanceKwd.isNegative() ? account.balanceKwd.neg() : ZERO;
  return debt.greaterThanOrEqualTo(vendor.creditCapKwd);
}

// ─── Balance / ceiling reads (feed dispatch + the agent app) ───────────────

/** Cash the driver currently holds. 0 when no account exists yet. */
export async function getDriverCashBalance(
  tenantId: string,
  driverId: string
): Promise<Prisma.Decimal> {
  // eslint-disable-next-line no-prisma-without-tenant -- tenantId is inside the tenantId_ownerKey compound unique key; the rule only sees top-level keys.
  const account = await prisma.walletAccount.findUnique({
    where: { tenantId_ownerKey: { tenantId, ownerKey: driverOwnerKey(driverId) } },
    select: { balanceKwd: true },
  });
  return account?.balanceKwd ?? ZERO;
}

/**
 * Is the driver's cash-on-hand (optionally + an order's COD total) OVER the
 * tenant ceiling? Boundary: balance EQUAL to the ceiling is NOT over. No
 * FulfillmentSettings row ⇒ ceiling unconfigured ⇒ never over (false).
 */
export async function isDriverOverCeiling(
  tenantId: string,
  driverId: string,
  additionalKwd?: Prisma.Decimal
): Promise<boolean> {
  const settings = await prisma.fulfillmentSettings.findUnique({
    where: { tenantId },
    select: { driverCashCeilingKwd: true },
  });
  if (!settings) return false;
  const balance = await getDriverCashBalance(tenantId, driverId);
  const projected = additionalKwd ? balance.plus(additionalKwd) : balance;
  return projected.greaterThan(settings.driverCashCeilingKwd);
}

/**
 * Driver-facing wallet summary (agent app `GET /api/agent/wallet` + Home
 * lockout banner). Remittance notes come from the linked REMITTANCE
 * transaction memo (the Remittance model itself has no note column).
 */
export async function getDriverWalletSummary(
  tenantId: string,
  driverId: string
): Promise<{
  cashOnHandKwd: string;
  ceilingKwd: string;
  todayCollectedKwd: string;
  tipsTodayKwd: string;
  tipsTotalKwd: string;
  blocked: boolean;
  remittances: Array<{
    id: string;
    amountKwd: string;
    method: string;
    at: string;
    note: string | null;
  }>;
}> {
  const [settings, account] = await Promise.all([
    prisma.fulfillmentSettings.findUnique({
      where: { tenantId },
      select: { driverCashCeilingKwd: true },
    }),
    // eslint-disable-next-line no-prisma-without-tenant -- tenantId is inside the tenantId_ownerKey compound unique key; the rule only sees top-level keys.
    prisma.walletAccount.findUnique({
      where: { tenantId_ownerKey: { tenantId, ownerKey: driverOwnerKey(driverId) } },
      select: { id: true, balanceKwd: true },
    }),
  ]);

  const balance = account?.balanceKwd ?? ZERO;
  const ceiling = settings?.driverCashCeilingKwd ?? ZERO;
  const blocked = settings ? balance.greaterThan(ceiling) : false;

  let todayCollected: Prisma.Decimal = ZERO;
  let tipsToday: Prisma.Decimal = ZERO;
  let tipsTotal: Prisma.Decimal = ZERO;
  if (account) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [agg, tipTodayAgg, tipTotalAgg] = await Promise.all([
      prisma.walletEntry.aggregate({
        where: {
          tenantId,
          accountId: account.id,
          direction: "DEBIT",
          createdAt: { gte: startOfDay },
          transaction: { type: "COD_SETTLEMENT" },
        },
        _sum: { amountKwd: true },
      }),
      // PRD §11 tips — CREDIT legs on the driver account from TIP postings.
      prisma.walletEntry.aggregate({
        where: {
          tenantId,
          accountId: account.id,
          direction: "CREDIT",
          createdAt: { gte: startOfDay },
          transaction: { type: "TIP" },
        },
        _sum: { amountKwd: true },
      }),
      prisma.walletEntry.aggregate({
        where: {
          tenantId,
          accountId: account.id,
          direction: "CREDIT",
          transaction: { type: "TIP" },
        },
        _sum: { amountKwd: true },
      }),
    ]);
    todayCollected = agg._sum.amountKwd ?? ZERO;
    tipsToday = tipTodayAgg._sum.amountKwd ?? ZERO;
    tipsTotal = tipTotalAgg._sum.amountKwd ?? ZERO;
  }

  const remittances = await prisma.remittance.findMany({
    where: { tenantId, driverId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const remitTxs = remittances.length
    ? await prisma.walletTransaction.findMany({
        where: { tenantId, remittanceId: { in: remittances.map((r) => r.id) } },
        select: { remittanceId: true, memo: true },
      })
    : [];
  const noteByRemittanceId = new Map(remitTxs.map((t) => [t.remittanceId, t.memo]));

  return {
    cashOnHandKwd: toKwdString(balance),
    ceilingKwd: toKwdString(ceiling),
    todayCollectedKwd: toKwdString(todayCollected),
    tipsTodayKwd: toKwdString(tipsToday),
    tipsTotalKwd: toKwdString(tipsTotal),
    blocked,
    remittances: remittances.map((r) => ({
      id: r.id,
      amountKwd: toKwdString(r.amountKwd),
      method: r.method,
      at: r.createdAt.toISOString(),
      note: noteByRemittanceId.get(r.id) ?? null,
    })),
  };
}

// ─── Adjustments (ADMIN only — compensating transactions, never edits) ─────

/**
 * Post an ADMIN adjustment as a compensating transaction: the target account
 * gets the requested leg, PLATFORM_CLEARING takes the balancing opposite
 * leg. Reason is required and stored on the transaction memo. Direction
 * semantics follow the polarity table (e.g. DEBIT on DRIVER_CASH raises the
 * driver's cash-on-hand; DEBIT on VENDOR_PAYABLE lowers what we owe).
 */
export async function postAdjustment(
  tenantId: string,
  opts: {
    accountId: string;
    direction: EntryDirection;
    amountKwd: Prisma.Decimal | string | number;
    reason: string;
  },
  createdById: string
): Promise<{ transactionId: string; account: { id: string; balanceKwd: Prisma.Decimal } }> {
  const amount = new Prisma.Decimal(opts.amountKwd);
  if (amount.lte(0)) throw new WalletError("amountKwd must be greater than zero");
  const reason = opts.reason?.trim();
  if (!reason || reason.length < 5) throw new WalletError("reason is required (min 5 characters)");

  return prisma.$transaction(async (tx) => {
    const target = await tx.walletAccount.findFirst({
      where: { id: opts.accountId, tenantId },
    });
    if (!target) throw new WalletError("Wallet account not found");

    const clearing = await ensureAccount(tx, tenantId, "PLATFORM_CLEARING");
    if (clearing.id === target.id) {
      throw new WalletError("Cannot adjust the clearing account against itself");
    }

    const opposite: EntryDirection = opts.direction === "DEBIT" ? "CREDIT" : "DEBIT";
    const posted = await postLedgerTransaction(tx, {
      tenantId,
      type: "ADJUSTMENT",
      idempotencyKey: `adjust:${randomUUID()}`,
      memo: reason,
      createdById,
      legs: [
        {
          accountId: target.id,
          ownerType: target.ownerType as WalletOwnerTypeLiteral,
          direction: opts.direction,
          amountKwd: amount,
        },
        {
          accountId: clearing.id,
          ownerType: "PLATFORM_CLEARING",
          direction: opposite,
          amountKwd: amount,
        },
      ],
    });
    if (!posted) throw new WalletError("Adjustment posting failed");

    return {
      transactionId: posted.transactionId,
      account: { id: target.id, balanceKwd: posted.balances[target.id] },
    };
  });
}
