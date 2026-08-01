// Darb 2.0 PRD §11 — monthly vendor netting. "At month-end the net decides
// who pays whom": one VendorStatement per (vendor, month), idempotent on the
// [tenantId, vendorId, periodStart] unique; a positive closing balance is
// Darb owing the vendor, settled by an explicit VENDOR_PAYOUT posting.
//
// Statement math reads the ledger, never order rows: opening balance = the
// last WalletEntry.runningBalanceKwd before periodStart (0 when none), and
// the in-period components are grouped sums of the vendor account's entries
// by transaction type. The ledger is append-only, so a regenerated statement
// for a closed month is reproducible.

import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { logger } from "../../config/logger";
import {
  PostResult,
  WalletError,
  ensureAccount,
  postLedgerTransaction,
  vendorOwnerKey,
} from "./walletService";

const ZERO = new Prisma.Decimal(0);

/** First day of the month containing `d`, at 00:00 UTC. */
export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** The month period that ENDED most recently before `now` (the closed month). */
export function previousMonthPeriod(now = new Date()): { start: Date; end: Date } {
  const end = monthStart(now);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  return { start, end };
}

interface ComponentSums {
  codNetKwd: Prisma.Decimal;
  prepaidFeesKwd: Prisma.Decimal;
  refundsKwd: Prisma.Decimal;
}

async function componentSums(
  tenantId: string,
  accountId: string,
  period: { start: Date; end: Date },
): Promise<ComponentSums> {
  const entries = await prisma.walletEntry.findMany({
    where: {
      tenantId,
      accountId,
      createdAt: { gte: period.start, lt: period.end },
    },
    select: {
      direction: true,
      amountKwd: true,
      transaction: { select: { type: true } },
    },
  });

  let codNet = ZERO;
  let prepaidFees = ZERO;
  let refunds = ZERO;
  for (const e of entries) {
    switch (e.transaction.type) {
      case "COD_SETTLEMENT":
        codNet = e.direction === "CREDIT" ? codNet.plus(e.amountKwd) : codNet.minus(e.amountKwd);
        break;
      case "PREPAID_SETTLEMENT":
        // Fee legs are DEBITs on the payable.
        prepaidFees = e.direction === "DEBIT" ? prepaidFees.plus(e.amountKwd) : prepaidFees.minus(e.amountKwd);
        break;
      case "REFUND":
        refunds = e.direction === "DEBIT" ? refunds.plus(e.amountKwd) : refunds.minus(e.amountKwd);
        break;
      default:
        break;
    }
  }
  return { codNetKwd: codNet, prepaidFeesKwd: prepaidFees, refundsKwd: refunds };
}

/**
 * Generate (or return existing) monthly statements for every vendor of a
 * tenant that has a wallet account. Idempotent: an existing
 * (vendor, periodStart) statement is left untouched.
 */
export async function generateMonthlyStatements(
  tenantId: string,
  period: { start: Date; end: Date },
): Promise<number> {
  const accounts = await prisma.walletAccount.findMany({
    where: { tenantId, ownerType: "VENDOR_PAYABLE" },
    select: { id: true, ownerKey: true },
  });

  let created = 0;
  for (const account of accounts) {
    const vendorId = account.ownerKey.replace(/^VENDOR:/, "");
    try {
      const existing = await prisma.vendorStatement.findFirst({
        where: { tenantId, vendorId, periodStart: period.start },
        select: { id: true },
      });
      if (existing) continue;

      // Opening balance: the running balance of the last entry before the
      // period; the ledger's runningBalanceKwd makes this a single lookup.
      const lastBefore = await prisma.walletEntry.findFirst({
        where: { tenantId, accountId: account.id, createdAt: { lt: period.start } },
        orderBy: { createdAt: "desc" },
        select: { runningBalanceKwd: true },
      });
      const opening = lastBefore?.runningBalanceKwd ?? ZERO;
      const sums = await componentSums(tenantId, account.id, period);

      /**
       * The closing balance is the ledger's, not the sum of three components.
       *
       * It used to be `opening + codNet - prepaidFees - refunds`, and
       * componentSums only recognises those three transaction types. A
       * VENDOR_PAYABLE account also receives TOP_UP (added in revision 10),
       * VENDOR_PAYOUT and ADJUSTMENT, all of which fell through its `default:
       * break`. So any in-period top-up, off-cycle payout or admin correction
       * made this figure diverge from the real balance — and postVendorPayout
       * pays exactly this figure, so a mid-period payout was not subtracted and
       * got paid a second time. One statement's closing also stopped equalling
       * the next one's opening, which is how it would have been noticed
       * eventually, one reconciliation at a time.
       *
       * The last running balance inside the period is the account's own answer
       * and needs no arithmetic. The three component sums stay as the
       * presentation breakdown; when they do not add up to it, the difference
       * is logged rather than silently absorbed, because that difference is
       * exactly the top-up or payout the old formula was dropping.
       */
      const lastInPeriod = await prisma.walletEntry.findFirst({
        where: {
          tenantId,
          accountId: account.id,
          createdAt: { gte: period.start, lt: period.end },
        },
        orderBy: { createdAt: "desc" },
        select: { runningBalanceKwd: true },
      });
      const closing = lastInPeriod?.runningBalanceKwd ?? opening;
      const explained = opening
        .plus(sums.codNetKwd)
        .minus(sums.prepaidFeesKwd)
        .minus(sums.refundsKwd);
      const unexplained = closing.minus(explained);
      if (!unexplained.isZero()) {
        logger.info(
          { tenantId, vendorId, unexplainedKwd: unexplained.toFixed(3) },
          "vendorStatement: period contains movements outside COD/prepaid/refund (top-up, payout or adjustment)",
        );
      }

      await prisma.vendorStatement.create({
        data: {
          tenantId,
          vendorId,
          periodStart: period.start,
          periodEnd: period.end,
          openingBalanceKwd: opening,
          codNetKwd: sums.codNetKwd,
          prepaidFeesKwd: sums.prepaidFeesKwd,
          refundsKwd: sums.refundsKwd,
          closingBalanceKwd: closing,
        },
      });
      created += 1;
    } catch (err) {
      // One vendor's failure must not sink the whole tenant run.
      logger.error({ err, tenantId, vendorId }, "generateMonthlyStatements: vendor failed");
    }
  }
  return created;
}

/**
 * Settle a FINAL statement with a positive closing balance: post the
 * VENDOR_PAYOUT (payable down, clearing cash out) and mark the statement
 * PAID, atomically. Idempotent via "vendor-payout:{statementId}".
 */
export async function postVendorPayout(args: {
  tenantId: string;
  statementId: string;
  actorId: string;
}): Promise<PostResult | null> {
  const { tenantId, statementId, actorId } = args;

  return prisma.$transaction(async (tx) => {
    const statement = await tx.vendorStatement.findFirst({
      where: { id: statementId, tenantId },
    });
    if (!statement) throw new WalletError("Statement not found");
    if (statement.status === "PAID") return null; // replay no-op
    if (statement.closingBalanceKwd.lte(0)) {
      throw new WalletError(
        "Nothing to pay out — the closing balance is not positive (the vendor owes Darb; collect instead)",
      );
    }

    const vendorAccount = await ensureAccount(tx, tenantId, "VENDOR_PAYABLE", {
      vendorId: statement.vendorId,
    });
    const clearing = await ensureAccount(tx, tenantId, "PLATFORM_CLEARING");

    const posted = await postLedgerTransaction(tx, {
      tenantId,
      type: "VENDOR_PAYOUT",
      idempotencyKey: `vendor-payout:${statementId}`,
      memo: `Monthly payout for statement ${statementId} (${statement.periodStart.toISOString().slice(0, 7)})`,
      createdById: actorId,
      legs: [
        {
          accountId: vendorAccount.id,
          ownerType: "VENDOR_PAYABLE",
          direction: "DEBIT", // liability down — we paid the vendor
          amountKwd: statement.closingBalanceKwd,
        },
        {
          accountId: clearing.id,
          ownerType: "PLATFORM_CLEARING",
          direction: "CREDIT", // cash out of clearing
          amountKwd: statement.closingBalanceKwd,
        },
      ],
    });
    if (!posted) return null; // idempotency replay

    await tx.vendorStatement.update({
      where: { id: statementId },
      data: { status: "PAID", payoutTxId: posted.transactionId },
    });
    return posted;
  });
}

/** Ensure the vendor ownerKey helper stays in one place for statements UI. */
export { vendorOwnerKey };
