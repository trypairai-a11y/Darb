/**
 * Vendor-portal note #3 (2026-09-15) — one wallet, or one per branch.
 *
 * The invariant under test is the one the whole feature rests on: **the wallet
 * account is still ONE** and the two modes cannot disagree about how much money
 * the shop has. Switching mode moves nothing; an allocation moves the SPLIT and
 * never the total, and writes no ledger posting.
 *
 * If a future change makes `totalKwd` depend on the mode, or makes an
 * allocation post a wallet leg, these tests are what should stop it.
 */
import { getMockPrisma, resetAllMocks } from "../../setup";

jest.mock("../../../services/wallet/vendorBranchBalanceService", () => ({
  getVendorBranchBalances: jest.fn(),
}));

import { getVendorBranchBalances } from "../../../services/wallet/vendorBranchBalanceService";
import {
  branchSpendableKwd,
  getVendorWalletView,
  transferToBranch,
} from "../../../services/wallet/vendorWalletModeService";

const prisma = getMockPrisma();
const mockBalances = getVendorBranchBalances as jest.Mock;

/** The same shop, seen twice: KD 100 in the account, KD 30 spent by Mishref. */
function primeShop(mode: "SINGLE" | "PER_BRANCH", allocations: Array<[string, number]> = []) {
  prisma.vendor.findFirst.mockResolvedValue({ walletMode: mode });
  mockBalances.mockResolvedValue({
    totalKwd: "100.000",
    byBranch: { b1: "-30.000", b2: "0.000" },
    unallocatedKwd: "130.000",
    unallocatedByType: {},
  });
  prisma.vendorBranch.findMany.mockResolvedValue([
    { id: "b1", name: "Mishref" },
    { id: "b2", name: "Salmiya" },
  ]);
  prisma.vendorBranchAllocation.groupBy.mockResolvedValue(
    allocations.map(([branchId, amountKwd]) => ({ branchId, _sum: { amountKwd } })),
  );
}

/**
 * Per-suite delegates, not shared-stub ones — see the note in the training
 * suite for why. The two ledger tables are attached precisely so the "writes no
 * wallet posting" assertion below has real mocks to prove a negative against.
 */
function attachWalletDelegates() {
  const p = prisma as any;
  p.vendor = { ...(p.vendor ?? {}), findFirst: jest.fn() };
  p.vendorBranch = { ...(p.vendorBranch ?? {}), findFirst: jest.fn(), findMany: jest.fn() };
  p.vendorBranchAllocation = { groupBy: jest.fn(), create: jest.fn(), findMany: jest.fn() };
  p.walletTransaction = { create: jest.fn() };
  p.walletEntry = { create: jest.fn(), createMany: jest.fn() };
}

beforeEach(() => {
  resetAllMocks();
  attachWalletDelegates();
  mockBalances.mockReset();
});

describe("getVendorWalletView", () => {
  it("reports the same account total in both modes", async () => {
    primeShop("SINGLE");
    const single = await getVendorWalletView("t1", "v1");
    primeShop("PER_BRANCH", [["b1", 40]]);
    const perBranch = await getVendorWalletView("t1", "v1");

    expect(single.totalKwd).toBe("100.000");
    expect(perBranch.totalKwd).toBe("100.000");
  });

  it("in SINGLE, the main wallet is the whole balance — nothing is fenced off", async () => {
    primeShop("SINGLE", [["b1", 40]]);
    const view = await getVendorWalletView("t1", "v1");
    expect(view.mode).toBe("SINGLE");
    expect(view.mainAvailableKwd).toBe("100.000");
  });

  it("in PER_BRANCH, the main wallet is the pool: the total less what was handed out", async () => {
    primeShop("PER_BRANCH", [["b1", 40]]);
    const view = await getVendorWalletView("t1", "v1");
    expect(view.mainAvailableKwd).toBe("60.000");
  });

  it("a branch's spendable figure is its own net plus what was moved into it", async () => {
    primeShop("PER_BRANCH", [["b1", 40]]);
    const view = await getVendorWalletView("t1", "v1");
    const mishref = view.branches.find((b) => b.branchId === "b1")!;
    expect(mishref.derivedKwd).toBe("-30.000"); // deliveries it was charged for
    expect(mishref.allocatedKwd).toBe("40.000");
    expect(mishref.availableKwd).toBe("10.000");
  });

  it("an unknown stored mode reads as SINGLE rather than fencing the shop off", async () => {
    prisma.vendor.findFirst.mockResolvedValue({ walletMode: "SOMETHING_ELSE" });
    mockBalances.mockResolvedValue({
      totalKwd: "10.000",
      byBranch: {},
      unallocatedKwd: "10.000",
      unallocatedByType: {},
    });
    prisma.vendorBranch.findMany.mockResolvedValue([]);
    prisma.vendorBranchAllocation.groupBy.mockResolvedValue([]);

    const view = await getVendorWalletView("t1", "v1");
    expect(view.mode).toBe("SINGLE");
  });
});

describe("transferToBranch", () => {
  it("writes an allocation row and NO wallet posting", async () => {
    primeShop("PER_BRANCH", [["b1", 40]]);
    prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b1" });
    prisma.vendorBranchAllocation.create.mockResolvedValue({});

    await transferToBranch({ tenantId: "t1", vendorId: "v1", branchId: "b1", amountKwd: 10 });

    expect(prisma.vendorBranchAllocation.create).toHaveBeenCalled();
    // The ledger is for money moving between Darb and somebody else. This is
    // the shop rearranging its own, so nothing double-entry is written.
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.walletEntry.create).not.toHaveBeenCalled();
  });

  it("refuses a transfer out of a pool that does not hold it", async () => {
    primeShop("PER_BRANCH", [["b1", 40]]); // pool = 60
    prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b1" });

    await expect(
      transferToBranch({ tenantId: "t1", vendorId: "v1", branchId: "b1", amountKwd: 61 }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_MAIN_BALANCE" });
    expect(prisma.vendorBranchAllocation.create).not.toHaveBeenCalled();
  });

  it("refuses returning more than the branch holds", async () => {
    primeShop("PER_BRANCH", [["b1", 40]]); // b1 available = 10
    prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b1" });

    await expect(
      transferToBranch({ tenantId: "t1", vendorId: "v1", branchId: "b1", amountKwd: -11 }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BRANCH_BALANCE" });
  });

  it("refuses to move anything while the shop is on one wallet", async () => {
    primeShop("SINGLE");
    prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b1" });

    await expect(
      transferToBranch({ tenantId: "t1", vendorId: "v1", branchId: "b1", amountKwd: 10 }),
    ).rejects.toMatchObject({ code: "WALLET_MODE_SINGLE" });
  });

  it("refuses a zero transfer", async () => {
    primeShop("PER_BRANCH");
    await expect(
      transferToBranch({ tenantId: "t1", vendorId: "v1", branchId: "b1", amountKwd: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("branchSpendableKwd", () => {
  it("returns null in SINGLE, so intake applies no per-branch limit", async () => {
    // Deliberately null and not zero: every merchant is SINGLE until somebody
    // opts in, and zero would refuse every branch on the network.
    primeShop("SINGLE");
    expect(await branchSpendableKwd("t1", "v1", "b1")).toBeNull();
  });

  it("returns the branch's spendable figure in PER_BRANCH", async () => {
    primeShop("PER_BRANCH", [["b1", 40]]);
    const spendable = await branchSpendableKwd("t1", "v1", "b1");
    expect(spendable?.toFixed(3)).toBe("10.000");
  });

  it("returns zero for a branch that has been given nothing", async () => {
    primeShop("PER_BRANCH", []);
    const spendable = await branchSpendableKwd("t1", "v1", "b2");
    expect(spendable?.toFixed(3)).toBe("0.000");
  });
});
