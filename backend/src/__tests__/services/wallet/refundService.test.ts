// Refund service (PRD §11) — full-order only, merchant approves, Darb
// processes. The leg contract is the core assertion: COD refunds mirror the
// COD settlement exactly (vendor share + fee clawed back, cash out of
// clearing) and NEVER touch DRIVER_CASH.

import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../mocks/config";

const D = (v: string | number) => new Prisma.Decimal(v);

const {
  requestRefund,
  processRefund,
  RefundError,
} = require("../../../services/wallet/refundService");

const TENANT = "test-tenant-id";

function attachDelegates() {
  const p = prisma as any;
  p.deliveryOrder = p.deliveryOrder ?? {};
  for (const fn of ["findFirst", "updateMany"]) p.deliveryOrder[fn] = jest.fn();
  p.refund = p.refund ?? {};
  for (const fn of ["findFirst", "create", "updateMany"]) p.refund[fn] = jest.fn();
  p.walletAccount = p.walletAccount ?? {};
  p.walletAccount.upsert = jest.fn(async ({ where }: any) => ({
    id: `acc:${where.tenantId_ownerKey.ownerKey}`,
    balanceKwd: D(0),
  }));
  p.walletAccount.update = jest.fn(async ({ where }: any) => ({ id: where.id, balanceKwd: D(0) }));
  p.walletTransaction = p.walletTransaction ?? {};
  p.walletTransaction.create = jest.fn(async ({ data }: any) => ({ id: "wtx-refund", ...data }));
  p.walletEntry = p.walletEntry ?? {};
  p.walletEntry.create = jest.fn(async ({ data }: any) => ({ id: "we", ...data }));
  p.$transaction = jest.fn(async (fn: any) => fn(p));
  return p;
}

beforeEach(() => {
  jest.clearAllMocks();
  attachDelegates();
});

describe("requestRefund", () => {
  test("only DELIVERED orders of the requesting vendor are refundable", async () => {
    const p = prisma as any;
    p.deliveryOrder.findFirst.mockResolvedValue({
      id: "ord-1", status: "PICKED_UP", orderTotalKwd: D("5.000"), refundedAt: null,
    });
    await expect(
      requestRefund({ tenantId: TENANT, vendorId: "v-1", orderId: "ord-1", reason: "damaged items" }),
    ).rejects.toThrow(RefundError);
  });

  test("already-refunded orders are rejected", async () => {
    const p = prisma as any;
    p.deliveryOrder.findFirst.mockResolvedValue({
      id: "ord-1", status: "DELIVERED", orderTotalKwd: D("5.000"), refundedAt: new Date(),
    });
    await expect(
      requestRefund({ tenantId: TENANT, vendorId: "v-1", orderId: "ord-1", reason: "damaged items" }),
    ).rejects.toThrow(/already refunded/);
  });

  test("happy path snapshots the FULL order total (full-order refunds only)", async () => {
    const p = prisma as any;
    p.deliveryOrder.findFirst.mockResolvedValue({
      id: "ord-1", status: "DELIVERED", orderTotalKwd: D("5.000"), refundedAt: null,
    });
    p.refund.create.mockImplementation(async ({ data }: any) => ({ id: "ref-1", ...data }));

    const refund = await requestRefund({
      tenantId: TENANT, vendorId: "v-1", orderId: "ord-1", reason: "damaged items",
    });

    expect(refund.amountKwd.toFixed(3)).toBe("5.000");
    expect(p.refund.create.mock.calls[0][0].data.status ?? "REQUESTED").toBe("REQUESTED");
  });
});

describe("processRefund (approve)", () => {
  const COD_ORDER = {
    id: "ord-1",
    vendorId: "v-1",
    paymentMethod: "COD",
    orderTotalKwd: D("5.000"),
    deliveryFeeKwd: D("1.250"),
    refundedAt: null,
  };
  const REFUND_ROW = {
    id: "ref-1", orderId: "ord-1", vendorId: "v-1", status: "REQUESTED",
    amountKwd: D("5.000"), reason: "damaged items",
  };

  function primeApprove(order = COD_ORDER) {
    const p = prisma as any;
    p.refund.findFirst
      .mockResolvedValueOnce(REFUND_ROW) // initial load
      .mockResolvedValue({ ...REFUND_ROW, status: "PROCESSED", walletTxId: "wtx-refund" });
    p.deliveryOrder.findFirst.mockResolvedValue(order);
    p.refund.updateMany.mockResolvedValue({ count: 1 });
    p.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
    return p;
  }

  test("COD legs mirror the settlement exactly and DRIVER_CASH is never touched", async () => {
    const p = primeApprove();

    const refund = await processRefund({
      tenantId: TENANT, refundId: "ref-1", approve: true, actorId: "u-1",
    });

    expect(refund.status).toBe("PROCESSED");
    const header = p.walletTransaction.create.mock.calls[0][0].data;
    expect(header).toMatchObject({ type: "REFUND", idempotencyKey: "refund:ref-1" });

    const entries = p.walletEntry.create.mock.calls.map((c: any) => c[0].data);
    const byAccount = Object.fromEntries(
      entries.map((e: any) => [e.accountId, { dir: e.direction, amt: e.amountKwd.toFixed(3) }]),
    );
    // vendor share clawback 3.750, fee give-back 1.250, cash out 5.000.
    expect(byAccount["acc:VENDOR:v-1"]).toEqual({ dir: "DEBIT", amt: "3.750" });
    expect(byAccount["acc:PLATFORM_REVENUE"]).toEqual({ dir: "DEBIT", amt: "1.250" });
    expect(byAccount["acc:PLATFORM_CLEARING"]).toEqual({ dir: "CREDIT", amt: "5.000" });
    // The driver's cash account must not appear anywhere.
    expect(Object.keys(byAccount).some((k) => k.startsWith("acc:DRIVER:"))).toBe(false);
    // Balanced: debits === credits.
    const debits = entries.filter((e: any) => e.direction === "DEBIT")
      .reduce((s: number, e: any) => s + Number(e.amountKwd), 0);
    const credits = entries.filter((e: any) => e.direction === "CREDIT")
      .reduce((s: number, e: any) => s + Number(e.amountKwd), 0);
    expect(debits.toFixed(3)).toBe(credits.toFixed(3));
    // Order stamped refunded.
    expect(p.deliveryOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ refundedAt: null }) }),
    );
  });

  test("prepaid refund is the exact reverse of postPrepaidSettlement (fee only, no cash)", async () => {
    const p = primeApprove({ ...COD_ORDER, paymentMethod: "PREPAID" });

    await processRefund({ tenantId: TENANT, refundId: "ref-1", approve: true, actorId: "u-1" });

    const entries = p.walletEntry.create.mock.calls.map((c: any) => c[0].data);
    expect(entries).toHaveLength(2);
    const byAccount = Object.fromEntries(
      entries.map((e: any) => [e.accountId, { dir: e.direction, amt: e.amountKwd.toFixed(3) }]),
    );
    expect(byAccount["acc:VENDOR:v-1"]).toEqual({ dir: "CREDIT", amt: "1.250" });
    expect(byAccount["acc:PLATFORM_REVENUE"]).toEqual({ dir: "DEBIT", amt: "1.250" });
    expect(byAccount["acc:PLATFORM_CLEARING"]).toBeUndefined();
  });

  test("a non-REQUESTED refund cannot be processed again", async () => {
    const p = prisma as any;
    p.refund.findFirst.mockResolvedValue({ ...REFUND_ROW, status: "PROCESSED" });
    await expect(
      processRefund({ tenantId: TENANT, refundId: "ref-1", approve: true, actorId: "u-1" }),
    ).rejects.toThrow(/already processed/);
    expect(p.walletTransaction.create).not.toHaveBeenCalled();
  });

  test("reject path flips status without any ledger posting", async () => {
    const p = prisma as any;
    p.refund.findFirst
      .mockResolvedValueOnce(REFUND_ROW)
      .mockResolvedValue({ ...REFUND_ROW, status: "REJECTED" });
    p.refund.updateMany.mockResolvedValue({ count: 1 });

    const refund = await processRefund({
      tenantId: TENANT, refundId: "ref-1", approve: false, actorId: "u-1",
    });

    expect(refund.status).toBe("REJECTED");
    expect(p.walletTransaction.create).not.toHaveBeenCalled();
  });
});
