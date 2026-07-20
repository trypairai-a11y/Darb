import { prisma } from "../config";
import { logger } from "../config/logger";

/**
 * F12 — payout lifecycle for an accepted tax invoice.
 *
 * There is no payout provider integration in this codebase: no
 * PAYOUT_PROVIDER_URL, no bank API client, nothing that moves money. This
 * module therefore records the INTENT to pay and stops. It deliberately does
 * NOT mark the withdrawal WITHDRAWN or the billing PAID, because nothing here
 * can know that a transfer settled.
 *
 * (Until 2026-07-20 it did exactly that — created the row PENDING and then
 * immediately flipped it to WITHDRAWN + Billing PAID under a
 * "// Stub: pretend the payout provider succeeded immediately" comment. The
 * books showed partners as paid when no payment had been attempted.)
 *
 * Settlement is now explicit:
 *   triggerWithdrawal  → PaymentWithdrawal PENDING  + Billing APPROVED
 *   settleWithdrawal   → PaymentWithdrawal WITHDRAWN + Billing PAID
 *   failWithdrawal     → PaymentWithdrawal FAILED    + Billing APPROVED (retryable)
 *
 * settleWithdrawal/failWithdrawal are called by a finance operator confirming
 * against the bank statement (POST /api/financial/withdrawals/:id/settle|fail),
 * and are the seam a real provider webhook plugs into later.
 */

/**
 * Record a payout intent for an ACCEPTED tax invoice. Leaves the withdrawal
 * PENDING — settlement requires a confirmed transfer via settleWithdrawal.
 */
export async function triggerWithdrawal(taxInvoiceId: string) {
  const inv = await prisma.taxInvoice.findUnique({
    where: { id: taxInvoiceId },
    include: { billing: { include: { partner: { include: { bankAccounts: true } } } } },
  });
  if (!inv) throw new Error("Tax invoice not found");
  if (inv.status !== "ACCEPTED") throw new Error("Invoice must be ACCEPTED before withdrawal");

  const billing = inv.billing;
  const bank = billing.partner.bankAccounts[0];
  if (!bank) throw new Error("Partner has no bank account on file");

  // Idempotency: accepting an invoice twice must not queue a second payout.
  const existing = await prisma.paymentWithdrawal.findFirst({
    where: { tenantId: billing.tenantId, billingId: billing.id, status: { in: ["PENDING", "WITHDRAWN"] } },
  });
  if (existing) {
    logger.info(
      { billingId: billing.id, withdrawalId: existing.id, status: existing.status },
      "autoWithdraw: withdrawal already exists for this billing — returning it",
    );
    return existing;
  }

  await prisma.billing.update({ where: { id: billing.id }, data: { status: "APPROVED" } });

  const withdrawal = await prisma.paymentWithdrawal.create({
    data: {
      tenantId: billing.tenantId,
      billingId: billing.id,
      groupId: billing.groupId,
      groupName: billing.groupName,
      withdrawTime: new Date(),
      tailNumber: bank.tailNumber,
      amountKwd: billing.payableAmount,
      status: "PENDING",
      operationStatus: "Withdrawing",
      note: "SYSTEM AUTO WITHDRAW — awaiting payout confirmation",
    },
  });

  logger.info(
    { billingId: billing.id, withdrawalId: withdrawal.id, amountKwd: String(billing.payableAmount) },
    "autoWithdraw: payout intent recorded, awaiting settlement",
  );
  return withdrawal;
}

/**
 * Confirm a payout actually settled. Guarded on PENDING so a double-confirm
 * (two operators, or an operator racing a future provider webhook) cannot
 * mark the same money paid twice.
 */
export async function settleWithdrawal(
  tenantId: string,
  withdrawalId: string,
  opts: { reference?: string; actor?: string } = {},
) {
  const withdrawal = await prisma.paymentWithdrawal.findFirst({
    where: { id: withdrawalId, tenantId },
  });
  if (!withdrawal) throw new Error("Withdrawal not found");
  if (withdrawal.status !== "PENDING") {
    throw new Error(`Withdrawal is ${withdrawal.status}, only PENDING can be settled`);
  }

  const note = [
    "SETTLED",
    opts.reference ? `ref ${opts.reference}` : null,
    opts.actor ? `by ${opts.actor}` : null,
  ]
    .filter(Boolean)
    .join(" — ");

  const won = await prisma.paymentWithdrawal.updateMany({
    where: { id: withdrawalId, tenantId, status: "PENDING" },
    data: { status: "WITHDRAWN", operationStatus: "Withdrawn", note },
  });
  if (won.count === 0) throw new Error("Withdrawal was already settled or failed");

  await prisma.billing.update({
    where: { id: withdrawal.billingId },
    data: { status: "PAID" },
  });

  logger.info(
    { withdrawalId, billingId: withdrawal.billingId, reference: opts.reference, actor: opts.actor },
    "withdrawal settled",
  );
  return prisma.paymentWithdrawal.findFirst({ where: { id: withdrawalId, tenantId } });
}

/**
 * Mark a payout attempt failed. Billing drops back to APPROVED so the payout
 * can be retried; it is never left looking PAID.
 */
export async function failWithdrawal(
  tenantId: string,
  withdrawalId: string,
  opts: { reason?: string; actor?: string } = {},
) {
  const withdrawal = await prisma.paymentWithdrawal.findFirst({
    where: { id: withdrawalId, tenantId },
  });
  if (!withdrawal) throw new Error("Withdrawal not found");
  if (withdrawal.status !== "PENDING") {
    throw new Error(`Withdrawal is ${withdrawal.status}, only PENDING can be failed`);
  }

  const won = await prisma.paymentWithdrawal.updateMany({
    where: { id: withdrawalId, tenantId, status: "PENDING" },
    data: {
      status: "FAILED",
      operationStatus: "Failed",
      note: `FAILED — ${opts.reason ?? "no reason given"}${opts.actor ? ` (by ${opts.actor})` : ""}`,
    },
  });
  if (won.count === 0) throw new Error("Withdrawal was already settled or failed");

  await prisma.billing.update({
    where: { id: withdrawal.billingId },
    data: { status: "APPROVED" },
  });

  logger.warn(
    { withdrawalId, billingId: withdrawal.billingId, reason: opts.reason, actor: opts.actor },
    "withdrawal failed",
  );
  return prisma.paymentWithdrawal.findFirst({ where: { id: withdrawalId, tenantId } });
}
