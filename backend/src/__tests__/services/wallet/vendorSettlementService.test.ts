// Monthly vendor netting (PRD §11). Statement math reads the ledger
// (runningBalanceKwd + grouped in-period entries); payout posts
// VENDOR_PAYOUT and marks PAID atomically, idempotent per statement.

import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../mocks/config";

const D = (v: string | number) => new Prisma.Decimal(v);

const {
  generateMonthlyStatements,
  postVendorPayout,
  previousMonthPeriod,
  monthStart,
} = require("../../../services/wallet/vendorSettlementService");
const { WalletError } = require("../../../services/wallet/walletService");

const TENANT = "test-tenant-id";
const PERIOD = {
  start: new Date(Date.UTC(2026, 5, 1)), // 2026-06-01
  end: new Date(Date.UTC(2026, 6, 1)), // 2026-07-01
};

function attach() {
  const p = prisma as any;
  p.walletAccount = p.walletAccount ?? {};
  for (const fn of ["findMany", "upsert", "update"]) p.walletAccount[fn] = jest.fn();
  p.walletEntry = p.walletEntry ?? {};
  for (const fn of ["findFirst", "findMany", "create"]) p.walletEntry[fn] = jest.fn();
  p.vendorStatement = p.vendorStatement ?? {};
  for (const fn of ["findFirst", "create", "update"]) p.vendorStatement[fn] = jest.fn();
  p.walletTransaction = p.walletTransaction ?? {};
  p.walletTransaction.create = jest.fn(async ({ data }: any) => ({ id: "wtx-payout", ...data }));
  p.$transaction = jest.fn(async (fn: any) => fn(p));
  return p;
}

beforeEach(() => {
  jest.clearAllMocks();
  attach();
});

describe("period helpers", () => {
  test("previousMonthPeriod returns the closed month", () => {
    const { start, end } = previousMonthPeriod(new Date(Date.UTC(2026, 6, 20)));
    expect(start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  test("monthStart works across a year boundary", () => {
    const { start } = previousMonthPeriod(new Date(Date.UTC(2026, 0, 3)));
    expect(start.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(monthStart(new Date(Date.UTC(2026, 0, 31))).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("generateMonthlyStatements", () => {
  test("closing balance is the ledger's, so an in-period adjustment is not dropped", async () => {
    // It used to be opening + codNet - prepaidFees - refunds, and those three
    // are the only types componentSums recognises. A TOP_UP, a VENDOR_PAYOUT or
    // an ADJUSTMENT in the period fell through and the statement diverged from
    // the real balance — and postVendorPayout pays this figure, so a mid-period
    // payout got paid twice.
    const p = prisma as any;
    p.walletAccount.findMany.mockResolvedValue([
      { id: "acc-1", ownerKey: "VENDOR:v-1" },
    ]);
    p.vendorStatement.findFirst.mockResolvedValue(null);
    // Opening (last entry BEFORE the period) vs closing (last entry INSIDE it).
    p.walletEntry.findFirst.mockImplementation(async ({ where }: any) =>
      where.createdAt?.lt && !where.createdAt?.gte
        ? { runningBalanceKwd: D("10.000") }
        : { runningBalanceKwd: D("-82.750") },
    );
    p.walletEntry.findMany.mockResolvedValue([
      { direction: "CREDIT", amountKwd: D("3.750"), transaction: { type: "COD_SETTLEMENT" } },
      { direction: "CREDIT", amountKwd: D("7.500"), transaction: { type: "COD_SETTLEMENT" } },
      { direction: "DEBIT", amountKwd: D("1.250"), transaction: { type: "PREPAID_SETTLEMENT" } },
      { direction: "DEBIT", amountKwd: D("3.750"), transaction: { type: "REFUND" } },
      // The movement the old formula ignored. 16.250 - 99.000 = -82.750.
      { direction: "DEBIT", amountKwd: D("99.000"), transaction: { type: "ADJUSTMENT" } },
    ]);
    p.vendorStatement.create.mockImplementation(async ({ data }: any) => ({ id: "st-1", ...data }));

    const created = await generateMonthlyStatements(TENANT, PERIOD);

    expect(created).toBe(1);
    const data = p.vendorStatement.create.mock.calls[0][0].data;
    expect(data.vendorId).toBe("v-1");
    expect(data.openingBalanceKwd.toFixed(3)).toBe("10.000");
    // The breakdown still reports the three it understands.
    expect(data.codNetKwd.toFixed(3)).toBe("11.250");
    expect(data.prepaidFeesKwd.toFixed(3)).toBe("1.250");
    expect(data.refundsKwd.toFixed(3)).toBe("3.750");
    // And the closing figure is the account's own, adjustment included — not
    // the 16.250 the three components alone would have produced.
    expect(data.closingBalanceKwd.toFixed(3)).toBe("-82.750");
  });

  test("idempotent: an existing (vendor, period) statement is left untouched", async () => {
    const p = prisma as any;
    p.walletAccount.findMany.mockResolvedValue([{ id: "acc-1", ownerKey: "VENDOR:v-1" }]);
    p.vendorStatement.findFirst.mockResolvedValue({ id: "st-exists" });

    const created = await generateMonthlyStatements(TENANT, PERIOD);

    expect(created).toBe(0);
    expect(p.vendorStatement.create).not.toHaveBeenCalled();
  });

  test("no entries before the period ⇒ opening balance 0", async () => {
    const p = prisma as any;
    p.walletAccount.findMany.mockResolvedValue([{ id: "acc-1", ownerKey: "VENDOR:v-1" }]);
    p.vendorStatement.findFirst.mockResolvedValue(null);
    p.walletEntry.findFirst.mockResolvedValue(null);
    p.walletEntry.findMany.mockResolvedValue([]);
    p.vendorStatement.create.mockImplementation(async ({ data }: any) => ({ id: "st-1", ...data }));

    await generateMonthlyStatements(TENANT, PERIOD);

    const data = p.vendorStatement.create.mock.calls[0][0].data;
    expect(data.openingBalanceKwd.toFixed(3)).toBe("0.000");
    expect(data.closingBalanceKwd.toFixed(3)).toBe("0.000");
  });
});

describe("postVendorPayout", () => {
  const STATEMENT = {
    id: "st-1",
    vendorId: "v-1",
    periodStart: PERIOD.start,
    status: "FINAL",
    closingBalanceKwd: D("16.250"),
  };

  function primePayout(statement = STATEMENT) {
    const p = prisma as any;
    p.vendorStatement.findFirst.mockResolvedValue(statement);
    p.walletAccount.upsert.mockImplementation(async ({ where }: any) => ({
      id: `acc:${where.tenantId_ownerKey.ownerKey}`,
      balanceKwd: D(0),
    }));
    p.walletAccount.update.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      balanceKwd: D(0),
    }));
    p.walletEntry.create = jest.fn(async ({ data }: any) => ({ id: "we", ...data }));
    p.vendorStatement.update.mockResolvedValue({ ...statement, status: "PAID" });
    return p;
  }

  test("payout legs: VENDOR_PAYABLE DEBIT / PLATFORM_CLEARING CREDIT; statement marked PAID with the tx id", async () => {
    const p = primePayout();

    const posted = await postVendorPayout({ tenantId: TENANT, statementId: "st-1", actorId: "u-1" });

    expect(posted).not.toBeNull();
    const header = p.walletTransaction.create.mock.calls[0][0].data;
    expect(header).toMatchObject({ type: "VENDOR_PAYOUT", idempotencyKey: "vendor-payout:st-1" });
    const entries = p.walletEntry.create.mock.calls.map((c: any) => c[0].data);
    const byAccount = Object.fromEntries(
      entries.map((e: any) => [e.accountId, { dir: e.direction, amt: e.amountKwd.toFixed(3) }]),
    );
    expect(byAccount["acc:VENDOR:v-1"]).toEqual({ dir: "DEBIT", amt: "16.250" });
    expect(byAccount["acc:PLATFORM_CLEARING"]).toEqual({ dir: "CREDIT", amt: "16.250" });
    expect(p.vendorStatement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "PAID", payoutTxId: "wtx-payout" },
      }),
    );
  });

  test("a PAID statement replays as null (no double payout)", async () => {
    const p = primePayout({ ...STATEMENT, status: "PAID" });
    const posted = await postVendorPayout({ tenantId: TENANT, statementId: "st-1", actorId: "u-1" });
    expect(posted).toBeNull();
    expect(p.walletTransaction.create).not.toHaveBeenCalled();
  });

  test("a non-positive closing balance cannot be paid out", async () => {
    primePayout({ ...STATEMENT, closingBalanceKwd: D("-4.000") });
    await expect(
      postVendorPayout({ tenantId: TENANT, statementId: "st-1", actorId: "u-1" }),
    ).rejects.toThrow(WalletError);
  });
});
