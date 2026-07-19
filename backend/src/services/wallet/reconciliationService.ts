// Darb 2.0 — Nightly wallet reconciliation (plan §A5). Four invariant checks
// over the append-only ledger:
//
//   1. cached-balance   — each WalletAccount.balanceKwd (cache) equals the
//                         Σ of its entries per the polarity table
//                         (ASSET-like: ΣDEBIT − ΣCREDIT; LIABILITY-like:
//                         ΣCREDIT − ΣDEBIT — see walletService sign notes).
//   2. per-transaction  — every WalletTransaction is balanced
//                         (Σ DEBIT legs === Σ CREDIT legs).
//   3. cod-invariant    — for the run day's COD settlements:
//                         Σ driver-cash DEBITs === Σ vendor-payable net
//                         CREDITs + Σ platform-revenue CREDITs, plus a
//                         per-order recheck against DeliveryOrder amounts.
//   4. orphans          — both directions: transactions without entries, and
//                         entries whose transaction/account belongs to a
//                         different tenant (FKs make truly dangling entries
//                         impossible; cross-tenant references are the real
//                         corruption mode).
//
// Result upserted into WalletReconciliationRun ([tenantId, runDate] unique).
// On MISMATCH: CRITICAL Alert + in-app Notification to ADMIN/ACCOUNTANT
// users + `wallet.reconciliation_failed` on the event bus.

import { Prisma, AlertSeverity } from "../../generated/prisma";
import { prisma } from "../../config";
import { publishEvent } from "../eventBus";
import { toKwdString } from "./walletService";

const ZERO = new Prisma.Decimal(0);

/** Accounts where DEBIT increases the balance (mirrors walletService). */
const ASSET_LIKE = new Set(["DRIVER_CASH", "PLATFORM_CLEARING"]);

export interface ReconciliationCheck {
  name: "cached-balance" | "per-transaction-balance" | "cod-invariant" | "orphans";
  ok: boolean;
  details: Record<string, unknown>;
}

export interface ReconciliationRunResult {
  id: string;
  tenantId: string;
  runDate: Date;
  status: string; // OK | MISMATCH
  checks: ReconciliationCheck[];
}

function dayBounds(runDate: Date): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(runDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return { dayStart, dayEnd };
}

/**
 * Run all four reconciliation checks for a tenant, persist the run row, and
 * raise the alarm chain on MISMATCH. `runDate` is normalized to the local
 * start of day and used both as the run identity ([tenantId, runDate]
 * unique) and as the window for the day-scoped COD invariant.
 */
export async function runReconciliation(
  tenantId: string,
  runDate: Date
): Promise<ReconciliationRunResult> {
  const { dayStart, dayEnd } = dayBounds(runDate);

  const checks: ReconciliationCheck[] = [
    await checkCachedBalances(tenantId),
    await checkPerTransactionBalance(tenantId),
    await checkCodInvariant(tenantId, dayStart, dayEnd),
    await checkOrphans(tenantId),
  ];

  const status = checks.every((c) => c.ok) ? "OK" : "MISMATCH";

  const run = await prisma.walletReconciliationRun.upsert({
    where: { tenantId_runDate: { tenantId, runDate: dayStart } },
    create: { tenantId, runDate: dayStart, status, checks: checks as unknown as Prisma.InputJsonValue },
    update: { status, checks: checks as unknown as Prisma.InputJsonValue },
  });

  if (status === "MISMATCH") {
    await raiseMismatchAlarms(tenantId, run.id, dayStart, checks).catch(() => {
      // Alarm fan-out must never mask the run result.
    });
  }

  return {
    id: run.id,
    tenantId,
    runDate: run.runDate,
    status: run.status,
    checks,
  };
}

// ─── Check 1: cached balance vs Σ entries per account ──────────────────────

async function checkCachedBalances(tenantId: string): Promise<ReconciliationCheck> {
  const accounts = await prisma.walletAccount.findMany({
    where: { tenantId },
    select: { id: true, ownerType: true, ownerKey: true, balanceKwd: true },
  });
  const sums = await prisma.walletEntry.groupBy({
    by: ["accountId", "direction"],
    where: { tenantId },
    _sum: { amountKwd: true },
  });

  const byAccount = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const row of sums) {
    const bucket = byAccount.get(row.accountId) ?? { debit: ZERO, credit: ZERO };
    const amount = row._sum.amountKwd ?? ZERO;
    if (row.direction === "DEBIT") bucket.debit = bucket.debit.plus(amount);
    else bucket.credit = bucket.credit.plus(amount);
    byAccount.set(row.accountId, bucket);
  }

  const mismatches: Array<Record<string, unknown>> = [];
  for (const account of accounts) {
    const bucket = byAccount.get(account.id) ?? { debit: ZERO, credit: ZERO };
    const computed = ASSET_LIKE.has(account.ownerType)
      ? bucket.debit.minus(bucket.credit)
      : bucket.credit.minus(bucket.debit);
    if (!computed.equals(account.balanceKwd)) {
      mismatches.push({
        accountId: account.id,
        ownerKey: account.ownerKey,
        ownerType: account.ownerType,
        cachedKwd: toKwdString(account.balanceKwd),
        computedKwd: toKwdString(computed),
      });
    }
  }

  return {
    name: "cached-balance",
    ok: mismatches.length === 0,
    details: { accountsChecked: accounts.length, mismatches },
  };
}

// ─── Check 2: every transaction balanced ───────────────────────────────────

async function checkPerTransactionBalance(tenantId: string): Promise<ReconciliationCheck> {
  const sums = await prisma.walletEntry.groupBy({
    by: ["transactionId", "direction"],
    where: { tenantId },
    _sum: { amountKwd: true },
  });

  const byTx = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const row of sums) {
    const bucket = byTx.get(row.transactionId) ?? { debit: ZERO, credit: ZERO };
    const amount = row._sum.amountKwd ?? ZERO;
    if (row.direction === "DEBIT") bucket.debit = bucket.debit.plus(amount);
    else bucket.credit = bucket.credit.plus(amount);
    byTx.set(row.transactionId, bucket);
  }

  const unbalanced: Array<Record<string, unknown>> = [];
  for (const [transactionId, bucket] of byTx) {
    if (!bucket.debit.equals(bucket.credit)) {
      unbalanced.push({
        transactionId,
        debitsKwd: toKwdString(bucket.debit),
        creditsKwd: toKwdString(bucket.credit),
      });
    }
  }

  return {
    name: "per-transaction-balance",
    ok: unbalanced.length === 0,
    details: { transactionsChecked: byTx.size, unbalanced },
  };
}

// ─── Check 3: COD invariant for the day + per-order recheck ────────────────

async function checkCodInvariant(
  tenantId: string,
  dayStart: Date,
  dayEnd: Date
): Promise<ReconciliationCheck> {
  const codTxs = await prisma.walletTransaction.findMany({
    where: {
      tenantId,
      type: "COD_SETTLEMENT",
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    select: {
      id: true,
      orderId: true,
      entries: {
        select: {
          direction: true,
          amountKwd: true,
          account: { select: { ownerType: true } },
        },
      },
    },
  });

  // Aggregate invariant: Σ driver DEBITs === Σ vendor net CREDITs + Σ fees.
  let driverDebits = ZERO;
  let vendorNetCredits = ZERO;
  let revenueCredits = ZERO;
  for (const t of codTxs) {
    for (const e of t.entries) {
      const signed = e.direction === "CREDIT" ? e.amountKwd : e.amountKwd.neg();
      switch (e.account.ownerType) {
        case "DRIVER_CASH":
          if (e.direction === "DEBIT") driverDebits = driverDebits.plus(e.amountKwd);
          break;
        case "VENDOR_PAYABLE":
          vendorNetCredits = vendorNetCredits.plus(signed);
          break;
        case "PLATFORM_REVENUE":
          if (e.direction === "CREDIT") revenueCredits = revenueCredits.plus(e.amountKwd);
          break;
      }
    }
  }
  const aggregateOk = driverDebits.equals(vendorNetCredits.plus(revenueCredits));

  // Per-order recheck against DeliveryOrder amounts.
  const orderIds = codTxs.map((t) => t.orderId).filter((id): id is string => !!id);
  const orders = orderIds.length
    ? await prisma.deliveryOrder.findMany({
        where: { tenantId, id: { in: orderIds } },
        select: { id: true, orderTotalKwd: true, deliveryFeeKwd: true },
      })
    : [];
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const orderMismatches: Array<Record<string, unknown>> = [];
  for (const t of codTxs) {
    if (!t.orderId) continue;
    const order = orderById.get(t.orderId);
    if (!order) {
      orderMismatches.push({ transactionId: t.id, orderId: t.orderId, problem: "order not found" });
      continue;
    }
    let txDriverDebit = ZERO;
    let txVendorNet = ZERO;
    let txRevenueCredit = ZERO;
    for (const e of t.entries) {
      const signed = e.direction === "CREDIT" ? e.amountKwd : e.amountKwd.neg();
      switch (e.account.ownerType) {
        case "DRIVER_CASH":
          if (e.direction === "DEBIT") txDriverDebit = txDriverDebit.plus(e.amountKwd);
          break;
        case "VENDOR_PAYABLE":
          txVendorNet = txVendorNet.plus(signed);
          break;
        case "PLATFORM_REVENUE":
          if (e.direction === "CREDIT") txRevenueCredit = txRevenueCredit.plus(e.amountKwd);
          break;
      }
    }
    const total = order.orderTotalKwd;
    const fee = order.deliveryFeeKwd ?? ZERO;
    const expectVendorNet = total.minus(fee);
    if (
      !txDriverDebit.equals(total) ||
      !txRevenueCredit.equals(fee) ||
      !txVendorNet.equals(expectVendorNet)
    ) {
      orderMismatches.push({
        transactionId: t.id,
        orderId: t.orderId,
        expected: {
          driverDebitKwd: toKwdString(total),
          vendorNetKwd: toKwdString(expectVendorNet),
          revenueCreditKwd: toKwdString(fee),
        },
        actual: {
          driverDebitKwd: toKwdString(txDriverDebit),
          vendorNetKwd: toKwdString(txVendorNet),
          revenueCreditKwd: toKwdString(txRevenueCredit),
        },
      });
    }
  }

  return {
    name: "cod-invariant",
    ok: aggregateOk && orderMismatches.length === 0,
    details: {
      settlementsChecked: codTxs.length,
      driverDebitsKwd: toKwdString(driverDebits),
      vendorNetCreditsKwd: toKwdString(vendorNetCredits),
      revenueCreditsKwd: toKwdString(revenueCredits),
      aggregateOk,
      orderMismatches,
    },
  };
}

// ─── Check 4: orphans, both directions ─────────────────────────────────────

async function checkOrphans(tenantId: string): Promise<ReconciliationCheck> {
  // Direction A: transaction headers with no entry legs (crash mid-post —
  // should be impossible inside an interactive tx, but this is the net).
  const emptyTransactions = await prisma.walletTransaction.findMany({
    where: { tenantId, entries: { none: {} } },
    select: { id: true, idempotencyKey: true, type: true },
  });

  // Direction B: entries pointing at a transaction or account of ANOTHER
  // tenant (FKs prevent truly dangling rows; cross-tenant is the real risk).
  const crossTenantEntries = await prisma.walletEntry.findMany({
    where: {
      tenantId,
      OR: [
        { transaction: { tenantId: { not: tenantId } } },
        { account: { tenantId: { not: tenantId } } },
      ],
    },
    select: { id: true, transactionId: true, accountId: true },
  });

  return {
    name: "orphans",
    ok: emptyTransactions.length === 0 && crossTenantEntries.length === 0,
    details: {
      emptyTransactions,
      crossTenantEntries,
    },
  };
}

// ─── MISMATCH alarm chain ──────────────────────────────────────────────────

async function raiseMismatchAlarms(
  tenantId: string,
  runId: string,
  runDate: Date,
  checks: ReconciliationCheck[]
): Promise<void> {
  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  const dateLabel = runDate.toISOString().split("T")[0];
  const title = "Wallet reconciliation mismatch";
  const message = `Nightly wallet reconciliation for ${dateLabel} failed: ${failed.join(", ")}. The ledger and cached balances disagree — review before paying out.`;

  await prisma.alert.create({
    data: {
      tenantId,
      type: "WALLET_RECONCILIATION_MISMATCH",
      severity: AlertSeverity.CRITICAL,
      title,
      message,
      data: { runId, runDate: dateLabel, failedChecks: failed, checks } as unknown as Prisma.InputJsonValue,
    },
  });

  const users = await prisma.user.findMany({
    where: { tenantId, role: { in: ["ADMIN", "ACCOUNTANT"] }, isActive: true },
    select: { id: true },
  });
  if (users.length > 0) {
    await prisma.notification.createMany({
      data: users.map((user) => ({
        tenantId,
        userId: user.id,
        title,
        message,
        type: "WALLET_RECONCILIATION_MISMATCH",
        severity: "CRITICAL",
        sourceId: runId,
        metadata: { runId, runDate: dateLabel, failedChecks: failed } as unknown as Prisma.InputJsonValue,
      })),
    });
  }

  publishEvent({
    type: "wallet.reconciliation_failed",
    tenantId,
    payload: { runId, runDate: dateLabel, failedChecks: failed },
    timestamp: new Date().toISOString(),
  }).catch(() => {});
}
