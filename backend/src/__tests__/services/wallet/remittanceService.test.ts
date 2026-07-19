// Remittance service unit tests (plan §A5). The service runs inside
// prisma.$transaction — the shared config mock's $transaction jest.fn is
// pointed at an in-memory ledger tx double for each test.

import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../mocks/config";
import {
  recordRemittance,
  RemittanceError,
} from "../../../services/wallet/remittanceService";

const D = (v: string | number) => new Prisma.Decimal(v);

function makeTx(driverBalance: string | number) {
  const balances = new Map<string, Prisma.Decimal>([
    ["acc:DRIVER:drv-1", D(driverBalance)],
    ["acc:PLATFORM_CLEARING", D(0)],
  ]);
  const tx = {
    driver: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === "drv-1" ? { id: "drv-1", name: "Qadir Baloch" } : null
      ),
    },
    walletAccount: {
      upsert: jest.fn(async ({ where }: any) => {
        const ownerKey = where.tenantId_ownerKey.ownerKey;
        const id = `acc:${ownerKey}`;
        if (!balances.has(id)) balances.set(id, D(0));
        return { id, ownerKey, balanceKwd: balances.get(id) };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const next = (balances.get(where.id) ?? D(0)).plus(data.balanceKwd.increment);
        balances.set(where.id, next);
        return { id: where.id, balanceKwd: next };
      }),
    },
    remittance: {
      create: jest.fn(async ({ data }: any) => ({
        id: "rem-1",
        ...data,
        createdAt: new Date("2026-07-19T10:00:00Z"),
      })),
    },
    walletTransaction: {
      create: jest.fn(async ({ data }: any) => ({ id: "wtx-1", ...data })),
    },
    walletEntry: {
      create: jest.fn(async ({ data }: any) => ({ id: "we-1", ...data })),
    },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(tx));
  return { tx, balances };
}

describe("recordRemittance", () => {
  beforeEach(() => {
    (prisma.$transaction as jest.Mock).mockReset();
  });

  it("rejects an amount greater than the driver's cash balance", async () => {
    const { tx } = makeTx("3.000");

    await expect(
      recordRemittance(
        "test-tenant-id",
        { driverId: "drv-1", amountKwd: "5.000", method: "CASH" },
        "user-1"
      )
    ).rejects.toThrow(RemittanceError);

    // Nothing persisted or posted.
    expect(tx.remittance.create).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(tx.walletAccount.update).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount before opening a transaction", async () => {
    makeTx("3.000");
    await expect(
      recordRemittance(
        "test-tenant-id",
        { driverId: "drv-1", amountKwd: "0", method: "CASH" },
        "user-1"
      )
    ).rejects.toThrow(RemittanceError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when the driver does not belong to the tenant", async () => {
    makeTx("3.000");
    await expect(
      recordRemittance(
        "test-tenant-id",
        { driverId: "drv-unknown", amountKwd: "1.000", method: "CASH" },
        "user-1"
      )
    ).rejects.toThrow("Driver not found");
  });

  it("records the remittance, posts driver CREDIT / clearing DEBIT, and returns the new balance", async () => {
    const { tx, balances } = makeTx("5.000");

    const result = await recordRemittance(
      "test-tenant-id",
      { driverId: "drv-1", amountKwd: "3.000", method: "AL_MUZAINI", note: "evening hand-in" },
      "user-1"
    );

    expect(tx.remittance.create).toHaveBeenCalledTimes(1);
    expect(tx.walletTransaction.create.mock.calls[0][0].data).toMatchObject({
      type: "REMITTANCE",
      idempotencyKey: "remit:rem-1",
      remittanceId: "rem-1",
      memo: "evening hand-in",
      createdById: "user-1",
    });

    const entries = tx.walletEntry.create.mock.calls.map((c: any) => c[0].data);
    expect(entries).toHaveLength(2);
    const driverLeg = entries.find((e: any) => e.accountId === "acc:DRIVER:drv-1");
    const clearingLeg = entries.find((e: any) => e.accountId === "acc:PLATFORM_CLEARING");
    expect(driverLeg.direction).toBe("CREDIT");
    expect(clearingLeg.direction).toBe("DEBIT");
    expect(Number(driverLeg.amountKwd)).toBe(3);
    expect(Number(clearingLeg.amountKwd)).toBe(3);

    // Driver 5.000 − 3.000 = 2.000; clearing 0 + 3.000.
    expect(Number(balances.get("acc:DRIVER:drv-1"))).toBe(2);
    expect(Number(balances.get("acc:PLATFORM_CLEARING"))).toBe(3);
    expect(Number(result.balanceKwd)).toBe(2);
    expect(result.remittance.id).toBe("rem-1");
  });
});
