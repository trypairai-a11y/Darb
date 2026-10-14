// Revision 24 (#7) — Finance › Money › Settle accounts.
//
// Contract under test:
//   1. A part-payment is recorded and posts NOTHING to the ledger.
//   2. The transfer that clears the balance completes the statement through the
//      existing payout (postVendorPayoutTx / postFleetPayoutTx) inside the same
//      transaction, so the month is posted once, never twice.
//   3. Nobody can record more than is still open.
//   4. A delivery company's month cannot be settled, even in part, until the
//      company has CONFIRMED it, and nothing is written when refused.
//   5. Money a shop owes Darb is a record only: it never calls a payout.
//   6. A statement paid from its own screen reads Settled here.

import { getMockPrisma, resetAllMocks } from "../../setup";

const prisma = getMockPrisma();
prisma.vendorStatement = prisma.vendorStatement ?? {};
prisma.vendorStatement.findFirst = jest.fn();
prisma.vendorStatement.findMany = jest.fn();
prisma.fleetPayoutStatement = prisma.fleetPayoutStatement ?? {};
prisma.fleetPayoutStatement.findFirst = jest.fn();
prisma.fleetPayoutStatement.findMany = jest.fn();
prisma.accountSettlement = {
  aggregate: jest.fn(),
  create: jest.fn(),
  findMany: jest.fn(),
};
prisma.user = prisma.user ?? {};
prisma.user.findMany = jest.fn();

jest.mock("../../../services/wallet/vendorSettlementService", () => ({
  postVendorPayoutTx: jest.fn(),
}));
jest.mock("../../../services/fleetService", () => ({
  postFleetPayoutTx: jest.fn(),
}));

import { Prisma } from "../../../generated/prisma";
import {
  listSettleAccounts,
  recordSettlement,
  SettlementError,
} from "../../../services/wallet/accountSettlementService";
import { postVendorPayoutTx } from "../../../services/wallet/vendorSettlementService";
import { postFleetPayoutTx } from "../../../services/fleetService";

const D = (v: string) => new Prisma.Decimal(v);
const JAN = new Date(Date.UTC(2026, 8, 1));
const FEB = new Date(Date.UTC(2026, 9, 1));

const vendorStatement = (closing: string, status = "FINAL") => ({
  id: "vs-1", tenantId: "t-1", vendorId: "v-1", periodStart: JAN, periodEnd: FEB,
  closingBalanceKwd: D(closing), status,
});
const fleetStatement = (status: string, total = "300.000") => ({
  id: "fs-1", tenantId: "t-1", fleetPartnerId: "f-1", periodStart: JAN, periodEnd: FEB,
  totalKwd: D(total), netPayableKwd: null, status,
});

const base = {
  tenantId: "t-1",
  actorId: "u-acc",
  transferredAt: new Date("2026-10-10T00:00:00"),
  reference: "TRX-1",
};

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  prisma.accountSettlement.aggregate.mockResolvedValue({ _sum: { amountKwd: null } });
  prisma.accountSettlement.create.mockImplementation(async ({ data }: any) => ({ id: "as-1", ...data }));
  prisma.accountSettlement.findMany.mockResolvedValue([]);
  prisma.user.findMany.mockResolvedValue([]);
});

test("a part-payment records the transfer and posts nothing", async () => {
  prisma.vendorStatement.findFirst.mockResolvedValue(vendorStatement("100.000"));
  const out = await recordSettlement({
    ...base, partyType: "VENDOR", statementId: "vs-1", action: "PARTIALLY_SETTLED", amountKwd: "40",
  });
  expect(out).toMatchObject({ status: "PARTIALLY_SETTLED", amountKwd: "40.000", remainingKwd: "60.000", payoutTxId: null });
  expect(postVendorPayoutTx).not.toHaveBeenCalled();
  const data = prisma.accountSettlement.create.mock.calls[0][0].data;
  expect(data).toMatchObject({ partyType: "VENDOR", partyId: "v-1", flow: "DARB_PAYS", status: "PARTIALLY_SETTLED", reference: "TRX-1", createdById: "u-acc" });
  expect(data.amountDueKwd.toFixed(3)).toBe("100.000");
});

test("the transfer that clears the balance completes the statement's one payout", async () => {
  prisma.vendorStatement.findFirst.mockResolvedValue(vendorStatement("100.000"));
  prisma.accountSettlement.aggregate.mockResolvedValue({ _sum: { amountKwd: D("40") } });
  (postVendorPayoutTx as jest.Mock).mockResolvedValue({ transactionId: "tx-9", balances: {} });
  const out = await recordSettlement({ ...base, partyType: "VENDOR", statementId: "vs-1", action: "SETTLED" });
  expect(out).toMatchObject({ status: "SETTLED", amountKwd: "60.000", remainingKwd: "0.000", payoutTxId: "tx-9" });
  expect(postVendorPayoutTx).toHaveBeenCalledTimes(1);
  // Same transaction client, so the payout and the record commit together.
  expect((postVendorPayoutTx as jest.Mock).mock.calls[0][0]).toBe(prisma);
  expect((postVendorPayoutTx as jest.Mock).mock.calls[0][1]).toEqual({ tenantId: "t-1", statementId: "vs-1", actorId: "u-acc" });
});

test("a partial amount equal to the balance settles it", async () => {
  prisma.vendorStatement.findFirst.mockResolvedValue(vendorStatement("100.000"));
  (postVendorPayoutTx as jest.Mock).mockResolvedValue({ transactionId: "tx-1", balances: {} });
  const out = await recordSettlement({ ...base, partyType: "VENDOR", statementId: "vs-1", action: "PARTIALLY_SETTLED", amountKwd: "100.000" });
  expect(out.status).toBe("SETTLED");
});

test("more than is still open is refused and writes nothing", async () => {
  prisma.vendorStatement.findFirst.mockResolvedValue(vendorStatement("100.000"));
  prisma.accountSettlement.aggregate.mockResolvedValue({ _sum: { amountKwd: D("90") } });
  await expect(
    recordSettlement({ ...base, partyType: "VENDOR", statementId: "vs-1", action: "PARTIALLY_SETTLED", amountKwd: "20" }),
  ).rejects.toMatchObject({ code: "OVER_REMAINING" });
  expect(prisma.accountSettlement.create).not.toHaveBeenCalled();
});

test("a bad amount is refused", async () => {
  prisma.vendorStatement.findFirst.mockResolvedValue(vendorStatement("100.000"));
  await expect(
    recordSettlement({ ...base, partyType: "VENDOR", statementId: "vs-1", action: "PARTIALLY_SETTLED", amountKwd: "1.2345" }),
  ).rejects.toMatchObject({ code: "BAD_AMOUNT" });
});

test.each([["FINAL", "NOT_CONFIRMED"], ["DISPUTED", "DISPUTED"]])(
  "a delivery company's %s month cannot be settled, even in part",
  async (status, code) => {
    prisma.fleetPayoutStatement.findFirst.mockResolvedValue(fleetStatement(status));
    await expect(
      recordSettlement({ ...base, partyType: "FLEET", statementId: "fs-1", action: "PARTIALLY_SETTLED", amountKwd: "10" }),
    ).rejects.toMatchObject({ code, status: 409 });
    expect(prisma.accountSettlement.create).not.toHaveBeenCalled();
    expect(postFleetPayoutTx).not.toHaveBeenCalled();
  },
);

test("a CONFIRMED fleet month settles through the fleet payout", async () => {
  prisma.fleetPayoutStatement.findFirst.mockResolvedValue(fleetStatement("CONFIRMED"));
  (postFleetPayoutTx as jest.Mock).mockResolvedValue({ transactionId: "tx-f", balances: {} });
  const out = await recordSettlement({ ...base, partyType: "FLEET", statementId: "fs-1", action: "SETTLED" });
  expect(out).toMatchObject({ status: "SETTLED", amountKwd: "300.000", payoutTxId: "tx-f" });
  expect(postFleetPayoutTx).toHaveBeenCalledTimes(1);
});

test("money a shop owes Darb is recorded but never posts a payout", async () => {
  prisma.vendorStatement.findFirst.mockResolvedValue(vendorStatement("-25.500"));
  const out = await recordSettlement({ ...base, partyType: "VENDOR", statementId: "vs-1", action: "SETTLED" });
  expect(out).toMatchObject({ status: "SETTLED", amountKwd: "25.500" });
  expect(postVendorPayoutTx).not.toHaveBeenCalled();
  expect(prisma.accountSettlement.create.mock.calls[0][0].data.flow).toBe("PARTY_PAYS");
});

test("an already PAID statement is refused", async () => {
  prisma.vendorStatement.findFirst.mockResolvedValue(vendorStatement("100.000", "PAID"));
  await expect(
    recordSettlement({ ...base, partyType: "VENDOR", statementId: "vs-1", action: "SETTLED" }),
  ).rejects.toBeInstanceOf(SettlementError);
});

test("a serialization conflict reads as a 409, not a crash", async () => {
  prisma.$transaction.mockRejectedValue(Object.assign(new Error("conflict"), { code: "P2034" }));
  await expect(
    recordSettlement({ ...base, partyType: "VENDOR", statementId: "vs-1", action: "SETTLED" }),
  ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
});

describe("listSettleAccounts", () => {
  beforeEach(() => {
    prisma.vendorStatement.findMany.mockResolvedValue([
      { ...vendorStatement("100.000"), vendor: { name: "Royal Pharmacy" } },
      { ...vendorStatement("50.000", "PAID"), id: "vs-2", vendorId: "v-2", vendor: { name: "Al Seef" } },
      { ...vendorStatement("0"), id: "vs-3", vendorId: "v-3", vendor: { name: "Nothing owed" } },
    ]);
    prisma.fleetPayoutStatement.findMany.mockResolvedValue([
      { ...fleetStatement("FINAL"), fleet: { name: "Marina" } },
    ]);
    prisma.accountSettlement.findMany.mockResolvedValue([
      {
        id: "as-1", partyType: "VENDOR", statementId: "vs-1", amountKwd: D("40"), remainingKwd: D("60"),
        status: "PARTIALLY_SETTLED", transferredAt: new Date("2026-10-02"), reference: "TRX", note: null,
        payoutTxId: null, createdById: "u-acc", createdAt: new Date("2026-10-02"),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: "u-acc", name: "Huda" }]);
  });

  test("shows the remaining balance, the history, and who recorded it", async () => {
    const out = await listSettleAccounts({ tenantId: "t-1", state: "all" });
    const royal = out.data.find((r) => r.statementId === "vs-1")!;
    expect(royal).toMatchObject({ state: "PARTIALLY_SETTLED", amountDueKwd: "100.000", settledKwd: "40.000", remainingKwd: "60.000", canSettle: true });
    expect(royal.transfers[0]).toMatchObject({ amountKwd: "40.000", createdByName: "Huda" });
    // Nothing owed is not an account to settle.
    expect(out.data.find((r) => r.statementId === "vs-3")).toBeUndefined();
  });

  test("a statement paid from its own screen reads Settled", async () => {
    const out = await listSettleAccounts({ tenantId: "t-1", state: "all" });
    expect(out.data.find((r) => r.statementId === "vs-2")).toMatchObject({
      state: "SETTLED", paidOutsideSettlement: true, remainingKwd: "0.000", canSettle: false,
    });
  });

  test("an unconfirmed fleet month is listed but blocked", async () => {
    const out = await listSettleAccounts({ tenantId: "t-1" });
    expect(out.data.find((r) => r.partyType === "FLEET")).toMatchObject({ canSettle: false, blockedReason: "NOT_CONFIRMED" });
    // The default view hides settled accounts.
    expect(out.data.find((r) => r.statementId === "vs-2")).toBeUndefined();
    expect(out.totals.owedByDarbKwd).toBe("360.000");
  });
});
