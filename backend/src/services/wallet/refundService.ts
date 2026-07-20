// Darb 2.0 PRD §11 — refunds. Full-order only; the merchant approves (raises
// the request from its portal), Darb finance processes. Processing posts ONE
// compensating REFUND transaction, idempotent via "refund:{refundId}".
//
// Leg design (COD-delivered order):
//   VENDOR_PAYABLE   DEBIT (total − fee)  — claw back the vendor's share
//   PLATFORM_REVENUE DEBIT fee            — give back our fee
//   PLATFORM_CLEARING CREDIT total        — the cash actually returned
// DRIVER_CASH is never touched: the driver already collected/remitted the
// cash truthfully; reversing his leg would claim he handed cash back at the
// door, which is false.
// Prepaid order: exact reverse of postPrepaidSettlement (payable CREDIT fee,
// revenue DEBIT fee) — no cash moved through Darb, only the fee unwinds.

import { Prisma, Refund } from "../../generated/prisma";
import { prisma } from "../../config";
import {
  WalletError,
  ensureAccount,
  postLedgerTransaction,
} from "./walletService";

export class RefundError extends Error {}

/**
 * Vendor raises a refund request for a DELIVERED order of its own. One per
 * order (Refund.orderId unique — P2002 ⇒ 409 at the route).
 */
export async function requestRefund(args: {
  tenantId: string;
  vendorId: string;
  orderId: string;
  reason: string;
  requestedById?: string;
}): Promise<Refund> {
  const { tenantId, vendorId, orderId, reason } = args;
  if (!reason || reason.trim().length < 5) {
    throw new RefundError("A reason of at least 5 characters is required");
  }

  const order = await prisma.deliveryOrder.findFirst({
    where: { id: orderId, tenantId, vendorId },
    select: { id: true, status: true, orderTotalKwd: true, refundedAt: true },
  });
  if (!order) throw new RefundError("Order not found");
  if (order.status !== "DELIVERED") {
    throw new RefundError("Only DELIVERED orders can be refunded (full-order refunds)");
  }
  if (order.refundedAt) throw new RefundError("Order is already refunded");

  return prisma.refund.create({
    data: {
      tenantId,
      orderId,
      vendorId,
      amountKwd: order.orderTotalKwd,
      reason: reason.trim(),
      requestedById: args.requestedById ?? null,
    },
  });
}

/**
 * Darb finance processes (or rejects) a refund request. Approval posts the
 * compensating REFUND transaction and stamps DeliveryOrder.refundedAt in the
 * same tx. Status guard REQUESTED→PROCESSED/REJECTED via updateMany makes
 * double-processing a no-op race loser.
 */
export async function processRefund(args: {
  tenantId: string;
  refundId: string;
  approve: boolean;
  actorId: string;
}): Promise<Refund> {
  const { tenantId, refundId, approve, actorId } = args;

  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findFirst({
      where: { id: refundId, tenantId },
    });
    if (!refund) throw new RefundError("Refund not found");
    if (refund.status !== "REQUESTED") {
      throw new RefundError(`Refund already ${refund.status.toLowerCase()}`);
    }

    if (!approve) {
      const guarded = await tx.refund.updateMany({
        where: { id: refundId, tenantId, status: "REQUESTED" },
        data: { status: "REJECTED", processedById: actorId },
      });
      if (guarded.count === 0) throw new RefundError("Refund state changed concurrently");
      return (await tx.refund.findFirst({ where: { id: refundId, tenantId } }))!;
    }

    const order = await tx.deliveryOrder.findFirst({
      where: { id: refund.orderId, tenantId },
      select: {
        id: true,
        vendorId: true,
        paymentMethod: true,
        orderTotalKwd: true,
        deliveryFeeKwd: true,
        refundedAt: true,
      },
    });
    if (!order) throw new RefundError("Order not found");
    if (order.refundedAt) throw new RefundError("Order is already refunded");

    const total = new Prisma.Decimal(order.orderTotalKwd);
    const fee = new Prisma.Decimal(order.deliveryFeeKwd ?? 0);

    const vendorAccount = await ensureAccount(tx, tenantId, "VENDOR_PAYABLE", {
      vendorId: order.vendorId,
    });
    const revenue = await ensureAccount(tx, tenantId, "PLATFORM_REVENUE");
    const clearing = await ensureAccount(tx, tenantId, "PLATFORM_CLEARING");

    const legs =
      order.paymentMethod === "COD"
        ? [
            ...(total.minus(fee).gt(0)
              ? [{
                  accountId: vendorAccount.id,
                  ownerType: "VENDOR_PAYABLE" as const,
                  direction: "DEBIT" as const,
                  amountKwd: total.minus(fee),
                }]
              : []),
            ...(fee.gt(0)
              ? [{
                  accountId: revenue.id,
                  ownerType: "PLATFORM_REVENUE" as const,
                  direction: "DEBIT" as const,
                  amountKwd: fee,
                }]
              : []),
            {
              accountId: clearing.id,
              ownerType: "PLATFORM_CLEARING" as const,
              direction: "CREDIT" as const,
              amountKwd: total,
            },
          ]
        : // Prepaid: exact reverse of postPrepaidSettlement.
          fee.gt(0)
          ? [
              {
                accountId: vendorAccount.id,
                ownerType: "VENDOR_PAYABLE" as const,
                direction: "CREDIT" as const,
                amountKwd: fee,
              },
              {
                accountId: revenue.id,
                ownerType: "PLATFORM_REVENUE" as const,
                direction: "DEBIT" as const,
                amountKwd: fee,
              },
            ]
          : [];

    const posted = await postLedgerTransaction(tx, {
      tenantId,
      type: "REFUND",
      idempotencyKey: `refund:${refundId}`,
      orderId: order.id,
      memo: `Full-order refund for order ${order.id}: ${refund.reason}`,
      createdById: actorId,
      legs,
    });

    const guarded = await tx.refund.updateMany({
      where: { id: refundId, tenantId, status: "REQUESTED" },
      data: {
        status: "PROCESSED",
        processedById: actorId,
        walletTxId: posted?.transactionId ?? null,
      },
    });
    if (guarded.count === 0) throw new RefundError("Refund state changed concurrently");

    await tx.deliveryOrder.updateMany({
      where: { id: order.id, tenantId, refundedAt: null },
      data: { refundedAt: new Date() },
    });

    return (await tx.refund.findFirst({ where: { id: refundId, tenantId } }))!;
  });
}

/** WalletError re-export so routes can map both error families to 400. */
export { WalletError };
