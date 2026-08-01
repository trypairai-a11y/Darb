// Darb 2.0 — Remittance recording (plan §A5). A driver hands collected COD
// cash to the hub; we persist the Remittance row and post the balanced
// wallet transaction ("remit:{remittanceId}": driver cash CREDIT amount,
// platform clearing DEBIT amount) inside ONE interactive transaction, then
// publish `remittance.recorded` on the event bus after commit.

import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { publishEvent } from "../eventBus";
import {
  ensureAccount,
  postLedgerTransaction,
  toKwdString,
  WalletError,
} from "./walletService";

export type DepositMethodLiteral = "CASH" | "BANK_TRANSFER" | "AL_MUZAINI";

/** Validation failure — routes map instances to HTTP 400. */
export class RemittanceError extends WalletError {}

export interface RecordRemittanceInput {
  driverId: string;
  amountKwd: Prisma.Decimal | string | number;
  method: DepositMethodLiteral;
  note?: string;
  receiptUrl?: string;
}

export interface RecordRemittanceResult {
  remittance: {
    id: string;
    driverId: string;
    amountKwd: Prisma.Decimal;
    method: string;
    receiptUrl: string | null;
    receivedById: string | null;
    createdAt: Date;
  };
  /** Driver cash balance AFTER the remittance posted. */
  balanceKwd: Prisma.Decimal;
}

/**
 * Record a cash hand-in from a driver. Validates amount > 0 and amount ≤ the
 * driver's current cash balance, creates the Remittance row, and posts the
 * double-entry wallet transaction — all in one interactive transaction so a
 * concurrent COD settlement or duplicate submission can never overdraw the
 * driver account. Publishes `remittance.recorded` after commit.
 */
export async function recordRemittance(
  tenantId: string,
  input: RecordRemittanceInput,
  receivedById: string
): Promise<RecordRemittanceResult> {
  const amount = new Prisma.Decimal(input.amountKwd);
  if (amount.lte(0)) throw new RemittanceError("amountKwd must be greater than zero");

  const result = await prisma.$transaction(async (tx) => {
    const driver = await tx.driver.findFirst({
      where: { id: input.driverId, tenantId },
      select: { id: true, name: true },
    });
    if (!driver) throw new RemittanceError("Driver not found");

    const driverAccount = await ensureAccount(tx, tenantId, "DRIVER_CASH", {
      driverId: input.driverId,
    });

    /**
     * Claim the balance under a row lock, do not merely read it.
     *
     * The old comment here said the atomic decrement inside
     * postLedgerTransaction re-enforced the check above. It does not: an atomic
     * `increment` serializes writers but has no non-negative constraint, so two
     * hand-ins of KD 50 against a KD 60 balance both passed the read and both
     * posted, leaving DRIVER_CASH at -40 and clearing overstated by 50. A
     * double-submitted cash-desk form is enough, because each submit creates
     * its own Remittance and therefore its own idempotency key — the ledger's
     * replay guard cannot see it.
     *
     * A guarded updateMany is the same discipline as the order FSM: it takes
     * the row lock, evaluates `balanceKwd >= amount` under it, and count 0
     * means somebody else got there first. The lock is held to the end of this
     * transaction, so the posting below moves the balance while the loser waits
     * and then re-reads a balance that is genuinely short.
     */
    const held = await tx.walletAccount.updateMany({
      where: { id: driverAccount.id, balanceKwd: { gte: amount } },
      data: { updatedAt: new Date() },
    });
    if (held.count === 0) {
      throw new RemittanceError(
        `Amount exceeds driver cash balance (KD ${toKwdString(driverAccount.balanceKwd)})`
      );
    }

    const clearingAccount = await ensureAccount(tx, tenantId, "PLATFORM_CLEARING");

    const remittance = await tx.remittance.create({
      data: {
        tenantId,
        driverId: input.driverId,
        amountKwd: amount,
        method: input.method,
        receiptUrl: input.receiptUrl ?? null,
        receivedById,
      },
    });

    // Note lives on the transaction memo (Remittance has no note column).
    const posted = await postLedgerTransaction(tx, {
      tenantId,
      type: "REMITTANCE",
      idempotencyKey: `remit:${remittance.id}`,
      remittanceId: remittance.id,
      memo: input.note ?? null,
      createdById: receivedById,
      legs: [
        {
          accountId: driverAccount.id,
          ownerType: "DRIVER_CASH",
          direction: "CREDIT",
          amountKwd: amount,
        },
        {
          accountId: clearingAccount.id,
          ownerType: "PLATFORM_CLEARING",
          direction: "DEBIT",
          amountKwd: amount,
        },
      ],
    });

    const balanceKwd = posted?.balances[driverAccount.id] ?? driverAccount.balanceKwd;
    return { remittance, balanceKwd, driverName: driver.name };
  });

  publishEvent({
    type: "remittance.recorded",
    tenantId,
    payload: {
      remittanceId: result.remittance.id,
      driverId: input.driverId,
      driverName: result.driverName,
      amountKwd: toKwdString(result.remittance.amountKwd),
      method: input.method,
      newBalanceKwd: toKwdString(result.balanceKwd),
    },
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  return { remittance: result.remittance, balanceKwd: result.balanceKwd };
}
