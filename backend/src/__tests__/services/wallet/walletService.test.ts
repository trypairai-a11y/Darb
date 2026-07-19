// Wallet engine unit tests (plan §A5).
//
// The service's `../../config` import is folded into the shared jest mock by
// moduleNameMapper (see jest.config.js). Wallet delegates are not part of
// the shared mock's default surface, so this file attaches its own
// per-suite delegates at runtime (same object instance the service sees).

import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../mocks/config";
import {
  postCodSettlement,
  postPrepaidSettlement,
  getDriverCashBalance,
  isDriverOverCeiling,
  postLedgerTransaction,
  WalletError,
  Tx,
} from "../../../services/wallet/walletService";

const D = (v: string | number) => new Prisma.Decimal(v);

/**
 * In-memory ledger tx double: upsert resolves accounts by ownerKey (id =
 * "acc:{ownerKey}"), update applies the Decimal increment and returns the
 * new cached balance — mirroring the row-lock + increment mechanics.
 */
function makeLedgerTx(initialBalances: Record<string, string | number> = {}) {
  const balances = new Map<string, Prisma.Decimal>();
  const accountId = (ownerKey: string) => `acc:${ownerKey}`;

  const tx = {
    walletAccount: {
      upsert: jest.fn(async ({ where }: any) => {
        const ownerKey = where.tenantId_ownerKey.ownerKey;
        const id = accountId(ownerKey);
        if (!balances.has(id)) balances.set(id, D(initialBalances[ownerKey] ?? 0));
        return { id, ownerKey, balanceKwd: balances.get(id) };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const increment: Prisma.Decimal = data.balanceKwd.increment;
        const next = (balances.get(where.id) ?? D(0)).plus(increment);
        balances.set(where.id, next);
        return { id: where.id, balanceKwd: next };
      }),
      findFirst: jest.fn(),
    },
    walletTransaction: {
      create: jest.fn(async ({ data }: any) => ({ id: "wtx-1", ...data })),
    },
    walletEntry: {
      create: jest.fn(async ({ data }: any) => ({ id: `we-${Math.random()}`, ...data })),
    },
  };

  return { tx: tx as unknown as Tx, raw: tx, balances, accountId };
}

const ORDER = {
  id: "ord-1",
  tenantId: "test-tenant-id",
  driverId: "drv-1",
  vendorId: "vnd-1",
  orderTotalKwd: D("5.000"),
  deliveryFeeKwd: D("1.000"),
};

describe("postCodSettlement", () => {
  it("posts one transaction with balanced legs (driver +total, vendor +(total-fee), revenue +fee)", async () => {
    const { tx, raw, balances, accountId } = makeLedgerTx();

    await postCodSettlement(tx, ORDER);

    // Header: type + idempotency key + order link.
    expect(raw.walletTransaction.create).toHaveBeenCalledTimes(1);
    expect(raw.walletTransaction.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "test-tenant-id",
      type: "COD_SETTLEMENT",
      idempotencyKey: "cod-settle:ord-1",
      orderId: "ord-1",
    });

    // Exactly 3 legs, Σ DEBIT === Σ CREDIT.
    const entries = raw.walletEntry.create.mock.calls.map((c: any) => c[0].data);
    expect(entries).toHaveLength(3);
    const sum = (dir: string) =>
      entries
        .filter((e: any) => e.direction === dir)
        .reduce((acc: Prisma.Decimal, e: any) => acc.plus(e.amountKwd), D(0));
    expect(sum("DEBIT").equals(sum("CREDIT"))).toBe(true);

    const byAccount = Object.fromEntries(entries.map((e: any) => [e.accountId, e]));
    expect(byAccount[accountId("DRIVER:drv-1")]).toMatchObject({ direction: "DEBIT" });
    expect(Number(byAccount[accountId("DRIVER:drv-1")].amountKwd)).toBe(5);
    expect(byAccount[accountId("VENDOR:vnd-1")]).toMatchObject({ direction: "CREDIT" });
    expect(Number(byAccount[accountId("VENDOR:vnd-1")].amountKwd)).toBe(4);
    expect(byAccount[accountId("PLATFORM_REVENUE")]).toMatchObject({ direction: "CREDIT" });
    expect(Number(byAccount[accountId("PLATFORM_REVENUE")].amountKwd)).toBe(1);

    // Cached balances moved per sign conventions and running balances match.
    expect(Number(balances.get(accountId("DRIVER:drv-1")))).toBe(5);
    expect(Number(balances.get(accountId("VENDOR:vnd-1")))).toBe(4);
    expect(Number(balances.get(accountId("PLATFORM_REVENUE")))).toBe(1);
    for (const e of entries) {
      expect(Number(e.runningBalanceKwd)).toBe(Number(balances.get(e.accountId)));
    }
  });

  it("is idempotent: P2002 on the idempotency key is a no-op that touches no balance", async () => {
    const { tx, raw } = makeLedgerTx();
    raw.walletTransaction.create.mockRejectedValueOnce({ code: "P2002" });

    await expect(postCodSettlement(tx, ORDER)).resolves.toBeUndefined();

    // Replay collapsed BEFORE any balance update or entry write.
    expect(raw.walletAccount.update).not.toHaveBeenCalled();
    expect(raw.walletEntry.create).not.toHaveBeenCalled();
  });

  it("rethrows non-P2002 errors", async () => {
    const { tx, raw } = makeLedgerTx();
    raw.walletTransaction.create.mockRejectedValueOnce(new Error("db down"));
    await expect(postCodSettlement(tx, ORDER)).rejects.toThrow("db down");
  });
});

describe("postPrepaidSettlement", () => {
  it("debits the vendor payable (which may go negative) and credits revenue", async () => {
    const { tx, raw, balances, accountId } = makeLedgerTx();

    await postPrepaidSettlement(tx, {
      id: "ord-2",
      tenantId: "test-tenant-id",
      vendorId: "vnd-1",
      deliveryFeeKwd: D("1.000"),
    });

    expect(raw.walletTransaction.create.mock.calls[0][0].data).toMatchObject({
      type: "PREPAID_SETTLEMENT",
      idempotencyKey: "prepaid-settle:ord-2",
    });

    const entries = raw.walletEntry.create.mock.calls.map((c: any) => c[0].data);
    expect(entries).toHaveLength(2);
    const vendorEntry = entries.find((e: any) => e.accountId === accountId("VENDOR:vnd-1"));
    expect(vendorEntry.direction).toBe("DEBIT");
    expect(Number(vendorEntry.amountKwd)).toBe(1);

    // Vendor payable started at 0 → fee deduction takes it negative.
    expect(Number(balances.get(accountId("VENDOR:vnd-1")))).toBe(-1);
    expect(Number(vendorEntry.runningBalanceKwd)).toBe(-1);
    expect(Number(balances.get(accountId("PLATFORM_REVENUE")))).toBe(1);
  });

  it("no-ops for a zero fee", async () => {
    const { tx, raw } = makeLedgerTx();
    await postPrepaidSettlement(tx, {
      id: "ord-3",
      tenantId: "test-tenant-id",
      vendorId: "vnd-1",
      deliveryFeeKwd: D(0),
    });
    expect(raw.walletTransaction.create).not.toHaveBeenCalled();
    expect(raw.walletEntry.create).not.toHaveBeenCalled();
  });
});

describe("postLedgerTransaction validation", () => {
  it("rejects unbalanced legs", async () => {
    const { tx } = makeLedgerTx();
    await expect(
      postLedgerTransaction(tx, {
        tenantId: "test-tenant-id",
        type: "ADJUSTMENT",
        idempotencyKey: "adjust:x",
        legs: [
          { accountId: "a", ownerType: "DRIVER_CASH", direction: "DEBIT", amountKwd: D(2) },
          { accountId: "b", ownerType: "PLATFORM_CLEARING", direction: "CREDIT", amountKwd: D(1) },
        ],
      })
    ).rejects.toThrow(WalletError);
  });

  it("rejects zero/negative leg amounts", async () => {
    const { tx } = makeLedgerTx();
    await expect(
      postLedgerTransaction(tx, {
        tenantId: "test-tenant-id",
        type: "ADJUSTMENT",
        idempotencyKey: "adjust:y",
        legs: [
          { accountId: "a", ownerType: "DRIVER_CASH", direction: "DEBIT", amountKwd: D(0) },
          { accountId: "b", ownerType: "PLATFORM_CLEARING", direction: "CREDIT", amountKwd: D(0) },
        ],
      })
    ).rejects.toThrow(WalletError);
  });
});

describe("driver cash balance + ceiling", () => {
  const p = prisma as any;

  beforeEach(() => {
    p.walletAccount = { findUnique: jest.fn() };
    p.fulfillmentSettings = { findUnique: jest.fn() };
  });

  it("getDriverCashBalance returns 0 when no account exists", async () => {
    p.walletAccount.findUnique.mockResolvedValue(null);
    const balance = await getDriverCashBalance("test-tenant-id", "drv-1");
    expect(balance.isZero()).toBe(true);
  });

  it("isDriverOverCeiling is false when no FulfillmentSettings row exists", async () => {
    p.fulfillmentSettings.findUnique.mockResolvedValue(null);
    await expect(isDriverOverCeiling("test-tenant-id", "drv-1")).resolves.toBe(false);
    // Short-circuits before reading the wallet.
    expect(p.walletAccount.findUnique).not.toHaveBeenCalled();
  });

  it("boundary: balance EQUAL to the ceiling is NOT over", async () => {
    p.fulfillmentSettings.findUnique.mockResolvedValue({
      driverCashCeilingKwd: D("100.000"),
    });
    p.walletAccount.findUnique.mockResolvedValue({ balanceKwd: D("100.000") });
    await expect(isDriverOverCeiling("test-tenant-id", "drv-1")).resolves.toBe(false);
  });

  it("boundary: balance + orderTotal landing EXACTLY on the ceiling is NOT over", async () => {
    p.fulfillmentSettings.findUnique.mockResolvedValue({
      driverCashCeilingKwd: D("100.000"),
    });
    p.walletAccount.findUnique.mockResolvedValue({ balanceKwd: D("95.000") });
    await expect(
      isDriverOverCeiling("test-tenant-id", "drv-1", D("5.000"))
    ).resolves.toBe(false);
  });

  it("balance + orderTotal crossing the ceiling IS over", async () => {
    p.fulfillmentSettings.findUnique.mockResolvedValue({
      driverCashCeilingKwd: D("100.000"),
    });
    p.walletAccount.findUnique.mockResolvedValue({ balanceKwd: D("98.000") });
    await expect(
      isDriverOverCeiling("test-tenant-id", "drv-1", D("5.000"))
    ).resolves.toBe(true);
  });
});
