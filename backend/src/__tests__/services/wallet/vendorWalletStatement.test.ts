/**
 * Vendor-portal note #3: "the vendor should be able to take a statement for
 * each [wallet]". A transfer is an allocation row, not a ledger posting, so it
 * was in nobody's statement: a branch's statement showed it spending money
 * that never arrived. Each statement must carry its transfers and tie to the
 * balance its wallet card shows.
 */
import { getMockPrisma, resetAllMocks } from "../../setup";
import { vendorWalletStatement } from "../../../services/wallet/vendorWalletModeService";

const prisma = getMockPrisma();

const d = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T10:00:00Z`);

function prime(mode: "SINGLE" | "PER_BRANCH") {
  const p = prisma as any;
  p.vendor = { findFirst: jest.fn().mockResolvedValue({ walletMode: mode }) };
  p.vendorBranch = { findMany: jest.fn().mockResolvedValue([{ id: "b1", name: "Mishref" }]) };
  p.walletAccount = { findFirst: jest.fn().mockResolvedValue({ id: "acc" }) };
  // Top-up 100 on the 1st; Mishref delivery charged 30 on the 10th.
  p.walletEntry = {
    findMany: jest.fn().mockResolvedValue([
      { direction: "CREDIT", amountKwd: 100, createdAt: d(1), transaction: { type: "TOP_UP", orderId: null, memo: null } },
      { direction: "DEBIT", amountKwd: 30, createdAt: d(10), transaction: { type: "DELIVERY_FEE", orderId: "o1", memo: null } },
    ]),
  };
  p.deliveryOrder = { findMany: jest.fn().mockResolvedValue([{ id: "o1", branchId: "b1", orderNumber: "DRB-1" }]) };
  // 40 moved to Mishref on the 5th.
  p.vendorBranchAllocation = {
    findMany: jest.fn().mockResolvedValue([{ branchId: "b1", amountKwd: 40, createdAt: d(5), note: null }]),
  };
}

beforeEach(() => resetAllMocks());

describe("vendorWalletStatement", () => {
  it("a branch statement shows the transfer in before the charge, and closes at its card balance", async () => {
    prime("PER_BRANCH");
    const st = await vendorWalletStatement({ tenantId: "t1", vendorId: "v1", wallet: "b1" });
    expect(st.lines.map((l) => [l.type, l.creditKwd, l.debitKwd, l.balanceKwd])).toEqual([
      ["TRANSFER_IN", "40.000", "0.000", "40.000"],
      ["DELIVERY_FEE", "0.000", "30.000", "10.000"],
    ]);
    expect(st.closingKwd).toBe("10.000");
  });

  it("the main statement shows the money leaving for the branch and none of the branch's charges", async () => {
    prime("PER_BRANCH");
    const st = await vendorWalletStatement({ tenantId: "t1", vendorId: "v1", wallet: "main" });
    expect(st.lines.map((l) => [l.type, l.reference, l.balanceKwd])).toEqual([
      ["TOP_UP", null, "100.000"],
      ["TRANSFER_OUT", "Mishref", "60.000"],
    ]);
    // Main 60 + Mishref 10 = the 70 the account holds.
    expect(st.closingKwd).toBe("60.000");
  });

  it("in SINGLE the main statement is the whole account, with no transfers", async () => {
    prime("SINGLE");
    const st = await vendorWalletStatement({ tenantId: "t1", vendorId: "v1", wallet: "main" });
    expect(st.lines.map((l) => l.type)).toEqual(["TOP_UP", "DELIVERY_FEE"]);
    expect(st.closingKwd).toBe("70.000");
    expect((prisma as any).vendorBranchAllocation.findMany).not.toHaveBeenCalled();
  });

  it("carries an opening balance for a period that starts mid-history", async () => {
    prime("PER_BRANCH");
    const st = await vendorWalletStatement({ tenantId: "t1", vendorId: "v1", wallet: "b1", from: d(6) });
    expect(st.openingKwd).toBe("40.000");
    expect(st.lines).toHaveLength(1);
    expect(st.lines[0]!.balanceKwd).toBe("10.000");
  });

  it("refuses a branch that is not this shop's", async () => {
    prime("PER_BRANCH");
    await expect(
      vendorWalletStatement({ tenantId: "t1", vendorId: "v1", wallet: "other" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
