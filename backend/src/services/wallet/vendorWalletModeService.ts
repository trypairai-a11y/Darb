/**
 * Vendor-portal note #3 (2026-09-15) — one wallet for the shop, or one per
 * branch, with manual transfers between them and a statement for each.
 *
 * Client's words: "there should be a button for using the whole vendor account
 * as one wallet, or to segregate each branch with its own wallet... the vendor
 * will top up the main wallet and manually transfer to each branch wallet...
 * the vendor should be able to take a statement for each".
 *
 * The thing NOT to do here is split the wallet account. That was settled in
 * revision 8 (#1) and it still holds: one double-entry account per merchant,
 * `VENDOR:{id}`. Real accounts per branch would mean a shop in credit at one
 * counter and in debt at another while owing Darb one net figure, and every
 * settlement, credit cap and reconciliation in the platform would have to
 * learn which of five balances it meant.
 *
 * What the client is actually describing is a SPENDING LIMIT per branch, set
 * by the shop itself. So:
 *
 *   - The ledger is untouched. No allocation writes a wallet posting and the
 *     account total is identical in both modes.
 *   - `VendorBranchAllocation` is an append-only sub-ledger of transfers from
 *     the shop's own pool to a branch. A transfer back is a negative row.
 *   - A branch's spendable balance is its derived net (which already exists)
 *     plus what has been allocated to it. The pool is what is left.
 *
 * Because the split is arithmetic over the same entries, the two modes cannot
 * disagree about how much money the shop has, and switching modes moves no
 * money at all.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { getVendorBranchBalances } from "./vendorBranchBalanceService";

export type WalletMode = "SINGLE" | "PER_BRANCH";

export function isWalletMode(v: string): v is WalletMode {
  return v === "SINGLE" || v === "PER_BRANCH";
}

const dec = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const fmt = (v: Prisma.Decimal) => v.toFixed(3);

export interface WalletView {
  mode: WalletMode;
  /** The real account balance. Identical in both modes. */
  totalKwd: string;
  /** Postings with no order behind them: top-ups, payouts, corrections. */
  unallocatedKwd: string;
  unallocatedByType: Record<string, string>;
  /**
   * The main wallet's spendable figure.
   *
   * SINGLE: the whole account balance, because nothing is fenced off.
   * PER_BRANCH: the pool, which is the account total less everything the shop
   * has handed to its branches.
   */
  mainAvailableKwd: string;
  branches: Array<{
    branchId: string;
    branchName: string;
    /** Net of this branch's own orders. Negative as deliveries are charged. */
    derivedKwd: string;
    /** What the shop has transferred in, net of transfers back. */
    allocatedKwd: string;
    /** derived + allocated: what this counter may still spend in PER_BRANCH. */
    availableKwd: string;
  }>;
}

/**
 * The wallet as both modes see it.
 *
 * Both shapes are computed either way. A shop that switches mode should see
 * the same money arranged differently, not a screen that has to reload before
 * it can say anything, and a support call about "where did my balance go" is
 * answered by the two figures sitting side by side.
 */
export async function getVendorWalletView(tenantId: string, vendorId: string): Promise<WalletView> {
  const [vendor, balances, branches, allocations] = await Promise.all([
    prisma.vendor.findFirst({ where: { id: vendorId, tenantId }, select: { walletMode: true } }),
    getVendorBranchBalances(tenantId, vendorId),
    prisma.vendorBranch.findMany({
      where: { tenantId, vendorId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.vendorBranchAllocation.groupBy({
      by: ["branchId"],
      where: { tenantId, vendorId },
      _sum: { amountKwd: true },
    }),
  ]);

  const allocatedBy = new Map(allocations.map((a) => [a.branchId, dec(a._sum.amountKwd ?? 0)]));
  const totalAllocated = allocations.reduce((sum, a) => sum.plus(dec(a._sum.amountKwd ?? 0)), dec(0));

  const mode: WalletMode =
    vendor && isWalletMode(vendor.walletMode) ? (vendor.walletMode as WalletMode) : "SINGLE";
  const total = dec(balances.totalKwd);

  return {
    mode,
    totalKwd: fmt(total),
    unallocatedKwd: balances.unallocatedKwd,
    unallocatedByType: balances.unallocatedByType,
    mainAvailableKwd: fmt(mode === "SINGLE" ? total : total.minus(totalAllocated)),
    branches: branches.map((b) => {
      const derived = dec(balances.byBranch[b.id] ?? 0);
      const allocated = allocatedBy.get(b.id) ?? dec(0);
      return {
        branchId: b.id,
        branchName: b.name,
        derivedKwd: fmt(derived),
        allocatedKwd: fmt(allocated),
        availableKwd: fmt(derived.plus(allocated)),
      };
    }),
  };
}

/**
 * Switch the shop between one wallet and one per branch.
 *
 * Moves no money either way. Turning PER_BRANCH off leaves the allocation rows
 * exactly where they are rather than reversing them: the history of what a
 * shop gave a branch is worth keeping, and turning the mode back on should
 * restore the arrangement rather than start from nothing.
 */
export async function setVendorWalletMode(params: {
  tenantId: string;
  vendorId: string;
  mode: WalletMode;
}) {
  const claimed = await prisma.vendor.updateMany({
    where: { id: params.vendorId, tenantId: params.tenantId },
    data: { walletMode: params.mode },
  });
  if (claimed.count === 0) throw Object.assign(new Error("Shop not found"), { statusCode: 404 });
  return getVendorWalletView(params.tenantId, params.vendorId);
}

/**
 * Move money between the shop's pool and one of its branches.
 *
 * Positive fills the branch, negative returns it. Two things are refused:
 * a transfer out of a pool that does not hold it, and a transfer back of more
 * than the branch has available — both would produce a branch whose spendable
 * figure is a number the shop cannot act on.
 *
 * This is one row, not a wallet posting. The double-entry ledger is for money
 * moving between Darb and somebody else; this is the shop rearranging its own.
 */
export async function transferToBranch(params: {
  tenantId: string;
  vendorId: string;
  branchId: string;
  amountKwd: number | string;
  note?: string | null;
  createdById?: string | null;
}) {
  const amount = dec(params.amountKwd);
  if (amount.isZero() || !amount.isFinite()) {
    throw Object.assign(new Error("A transfer needs a non-zero amount"), { statusCode: 400 });
  }

  const branch = await prisma.vendorBranch.findFirst({
    where: { id: params.branchId, tenantId: params.tenantId, vendorId: params.vendorId },
    select: { id: true },
  });
  if (!branch) throw Object.assign(new Error("Branch not found"), { statusCode: 404 });

  const view = await getVendorWalletView(params.tenantId, params.vendorId);
  if (view.mode !== "PER_BRANCH") {
    throw Object.assign(
      new Error("Turn on a wallet per branch before transferring between them"),
      { statusCode: 409, code: "WALLET_MODE_SINGLE" },
    );
  }

  const row = view.branches.find((b) => b.branchId === params.branchId);
  const pool = dec(view.mainAvailableKwd);
  if (amount.greaterThan(0) && amount.greaterThan(pool)) {
    throw Object.assign(
      new Error(`The main wallet holds ${fmt(pool)} KWD`),
      { statusCode: 400, code: "INSUFFICIENT_MAIN_BALANCE" },
    );
  }
  if (amount.lessThan(0)) {
    const available = dec(row?.availableKwd ?? 0);
    if (amount.abs().greaterThan(available)) {
      throw Object.assign(
        new Error(`That branch holds ${fmt(available)} KWD`),
        { statusCode: 400, code: "INSUFFICIENT_BRANCH_BALANCE" },
      );
    }
  }

  await prisma.vendorBranchAllocation.create({
    data: {
      tenantId: params.tenantId,
      vendorId: params.vendorId,
      branchId: params.branchId,
      amountKwd: amount,
      note: params.note?.trim() || null,
      createdById: params.createdById ?? null,
    },
  });

  return getVendorWalletView(params.tenantId, params.vendorId);
}

/** The transfer history, which is the audit trail behind every branch figure. */
export async function listBranchTransfers(params: {
  tenantId: string;
  vendorId: string;
  branchId?: string;
  take?: number;
}) {
  return prisma.vendorBranchAllocation.findMany({
    where: {
      tenantId: params.tenantId,
      vendorId: params.vendorId,
      ...(params.branchId ? { branchId: params.branchId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.take ?? 100,
    include: {
      branch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

/**
 * How much a branch may still spend, for intake to check in PER_BRANCH mode.
 *
 * Returns null in SINGLE mode, which means "no per-branch limit applies" and
 * is deliberately NOT zero: a shop that has never used the feature must not
 * have every branch refused.
 */
export async function branchSpendableKwd(
  tenantId: string,
  vendorId: string,
  branchId: string,
): Promise<Prisma.Decimal | null> {
  const view = await getVendorWalletView(tenantId, vendorId);
  if (view.mode !== "PER_BRANCH") return null;
  const row = view.branches.find((b) => b.branchId === branchId);
  return dec(row?.availableKwd ?? 0);
}
