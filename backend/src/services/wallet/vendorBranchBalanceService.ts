/**
 * Per-branch wallet balances for a merchant (revision 10, #3).
 *
 * The wallet itself stays one double-entry account per vendor. That was settled
 * in revision 8 (#1) — "the wallet is one" — and splitting the account per
 * branch would mean a shop could be in credit at one counter and in debt at
 * another while owing Darb a single net figure. What the client asked for here
 * is narrower and does not disturb that: the balance FIGURE on the card should
 * follow the branch pills, which were changing the transaction list underneath
 * while the number above it stayed frozen on the account total.
 *
 * So a branch's balance is derived, not stored: the net of every posting that
 * reached that branch through the order it settled. Credits raise it, debits
 * lower it, exactly as they do on the account itself.
 *
 * Postings with no order behind them — a payout, a top-up, a correction — belong
 * to the shop as a whole and land in no branch. They are reported separately as
 * `unallocatedKwd` so the branch figures and the account total reconcile out
 * loud rather than mysteriously failing to add up.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { vendorOwnerKey } from "./walletService";

export interface VendorBranchBalances {
  /** The real account balance: what Darb and the shop settle against. */
  totalKwd: string;
  /** Branch id → that branch's own net movement. */
  byBranch: Record<string, string>;
  /** Postings that belong to no branch (payouts, top-ups, corrections). */
  unallocatedKwd: string;
}

export async function getVendorBranchBalances(
  tenantId: string,
  vendorId: string,
): Promise<VendorBranchBalances> {
  const account = await prisma.walletAccount.findFirst({
    where: { tenantId, ownerKey: vendorOwnerKey(vendorId) },
    select: { id: true, balanceKwd: true },
  });

  const branches = await prisma.vendorBranch.findMany({
    where: { tenantId, vendorId },
    select: { id: true },
  });
  const byBranch: Record<string, string> = {};
  for (const branch of branches) byBranch[branch.id] = "0.000";

  if (!account) {
    return { totalKwd: "0.000", byBranch, unallocatedKwd: "0.000" };
  }

  const total = account.balanceKwd;

  // One grouped pass over the entries on this account, joined to the order that
  // carries the branch. A per-branch query would be one round trip per counter,
  // and the loop over ids version could not survive a shop with 10k orders.
  const rows = await prisma.$queryRaw<
    Array<{ branchId: string | null; direction: string; total: Prisma.Decimal }>
  >`
    SELECT o."branchId" AS "branchId",
           e."direction" AS "direction",
           SUM(e."amountKwd") AS "total"
      FROM "WalletEntry" e
      JOIN "WalletTransaction" tx ON tx."id" = e."transactionId"
      LEFT JOIN "DeliveryOrder" o
             ON o."id" = tx."orderId"
            AND o."tenantId" = ${tenantId}
            AND o."vendorId" = ${vendorId}
     WHERE e."accountId" = ${account.id}
       AND e."tenantId" = ${tenantId}
     GROUP BY o."branchId", e."direction"
  `;

  // VENDOR_PAYABLE is liability-like: a CREDIT raises the balance, a DEBIT
  // lowers it. Same polarity table the ledger itself applies.
  const nets = new Map<string | null, Prisma.Decimal>();
  for (const row of rows) {
    const key = row.branchId ?? null;
    const signed = row.direction === "CREDIT" ? new Prisma.Decimal(row.total) : new Prisma.Decimal(row.total).neg();
    nets.set(key, (nets.get(key) ?? new Prisma.Decimal(0)).plus(signed));
  }

  for (const [branchId, net] of nets) {
    if (branchId === null) continue;
    // A branch that has since been deleted still has history; report it rather
    // than silently dropping money out of the reconciliation.
    byBranch[branchId] = net.toFixed(3);
  }

  return {
    totalKwd: total.toFixed(3),
    byBranch,
    unallocatedKwd: (nets.get(null) ?? new Prisma.Decimal(0)).toFixed(3),
  };
}
