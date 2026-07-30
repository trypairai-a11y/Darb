// Revision 10 (#2) — merchant wallet top-ups.
//
// Three things are worth guarding here and they are all about money:
//   the suggestion is derived from the shop's own debt and burn, not invented;
//   the credit posts on the right side of a liability account;
//   a webhook delivered three times credits exactly once.
//
// The service's `../../config` import is folded into the shared jest mock by
// moduleNameMapper. Wallet delegates are not in the mock's default surface, so
// this file attaches its own, the same way walletService.test.ts does.

import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../mocks/config";

const D = (v: string | number) => new Prisma.Decimal(v);

const p = prisma as any;
p.walletAccount = p.walletAccount ?? {};
for (const fn of ["findFirst", "upsert", "update"]) {
  p.walletAccount[fn] = p.walletAccount[fn] ?? jest.fn();
}
p.deliveryOrder = p.deliveryOrder ?? {};
p.deliveryOrder.findMany = p.deliveryOrder.findMany ?? jest.fn();
p.vendor = p.vendor ?? {};
p.vendor.findFirst = p.vendor.findFirst ?? jest.fn();
p.vendorTopUp = {
  create: jest.fn(),
  findFirst: jest.fn(),
  findFirstOrThrow: jest.fn(),
  updateMany: jest.fn(),
};
p.walletTransaction = p.walletTransaction ?? {};
p.walletTransaction.create = p.walletTransaction.create ?? jest.fn();
p.walletEntry = p.walletEntry ?? {};
p.walletEntry.create = p.walletEntry.create ?? jest.fn();

import {
  TopUpError,
  cancelTopUp,
  confirmTopUp,
  createTopUp,
  suggestTopUp,
} from "../../../services/wallet/topUpService";

const TENANT = "t-1";
const VENDOR = "v-1";

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.MYFATOORAH_API_KEY;
  process.env.PUBLIC_TRACKING_BASE_URL = "https://darbkw.vercel.app";
});

// ─── suggestTopUp ────────────────────────────────────────────────────────────

describe("suggestTopUp", () => {
  it("floors at KD 10 for a shop with nothing owed and no history", async () => {
    p.walletAccount.findFirst.mockResolvedValue(null);
    p.deliveryOrder.findMany.mockResolvedValue([]);

    const s = await suggestTopUp(TENANT, VENDOR);

    expect(s.amountKwd).toBe("10.000");
    expect(s.outstandingKwd).toBe("0.000");
  });

  it("covers the debt plus a week of the shop's own fees, rounded up to KD 5", async () => {
    // Owed 20.000, and 30 days of fees totalling 60.000 ⇒ 2.000/day ⇒ 14.000 for
    // the week ⇒ 34.000 ⇒ rounds up to 35.000.
    p.walletAccount.findFirst.mockResolvedValue({ balanceKwd: D("-20.000") });
    p.deliveryOrder.findMany.mockResolvedValue(
      Array.from({ length: 30 }, () => ({ deliveryFeeKwd: D("2.000") })),
    );

    const s = await suggestTopUp(TENANT, VENDOR);

    expect(s.outstandingKwd).toBe("20.000");
    expect(s.dailyBurnKwd).toBe("2.000");
    expect(s.amountKwd).toBe("35.000");
  });

  it("treats a positive balance as nothing owed — Darb owing the shop is not a debt", async () => {
    p.walletAccount.findFirst.mockResolvedValue({ balanceKwd: D("40.000") });
    p.deliveryOrder.findMany.mockResolvedValue([]);

    const s = await suggestTopUp(TENANT, VENDOR);

    expect(s.outstandingKwd).toBe("0.000");
    expect(s.amountKwd).toBe("10.000");
  });
});

// ─── createTopUp ─────────────────────────────────────────────────────────────

describe("createTopUp", () => {
  beforeEach(() => {
    p.vendor.findFirst.mockResolvedValue({ id: VENDOR, name: "Al Dawaa Pharmacy" });
    p.vendorTopUp.create.mockImplementation(async ({ data }: any) => ({
      id: "tu-1",
      status: "PENDING",
      createdAt: new Date("2026-07-30T09:00:00Z"),
      ...data,
    }));
  });

  it("with no gateway configured, the link is the Darb-hosted page for the token", async () => {
    const created = await createTopUp({ tenantId: TENANT, vendorId: VENDOR, amountKwd: "25.000" });

    expect(created.provider).toBe("MANUAL");
    expect(created.paymentUrl).toBe(`https://darbkw.vercel.app/pay/${created.token}`);
    // 128-bit hex, the same shape and discipline as the tracking token.
    expect(created.token).toMatch(/^[a-f0-9]{32}$/);
    expect(created.reference).toMatch(/^TOP-[0-9A-F]{6}$/);
    expect(created.amountKwd).toBe("25.000");
  });

  it("refuses a zero or negative amount", async () => {
    await expect(
      createTopUp({ tenantId: TENANT, vendorId: VENDOR, amountKwd: "0" }),
    ).rejects.toBeInstanceOf(TopUpError);
    await expect(
      createTopUp({ tenantId: TENANT, vendorId: VENDOR, amountKwd: "-5" }),
    ).rejects.toBeInstanceOf(TopUpError);
    expect(p.vendorTopUp.create).not.toHaveBeenCalled();
  });

  it("refuses another shop's vendorId", async () => {
    p.vendor.findFirst.mockResolvedValue(null);
    await expect(
      createTopUp({ tenantId: TENANT, vendorId: "v-elsewhere", amountKwd: "10" }),
    ).rejects.toBeInstanceOf(TopUpError);
  });

  it("uses the gateway's checkout when MyFatoorah answers", async () => {
    process.env.MYFATOORAH_API_KEY = "test-key";
    const fetchMock = jest.fn(async (_url: string, _init: any) => ({
      json: async () => ({
        IsSuccess: true,
        Data: { InvoiceURL: "https://portal.myfatoorah.com/pay/abc", InvoiceId: 991 },
      }),
    }));
    (global as any).fetch = fetchMock;

    const created = await createTopUp({ tenantId: TENANT, vendorId: VENDOR, amountKwd: "25.000" });

    expect(created.provider).toBe("MYFATOORAH");
    expect(created.paymentUrl).toBe("https://portal.myfatoorah.com/pay/abc");
    // The gateway's own id is persisted so a webhook can be matched to the row.
    expect(p.vendorTopUp.create.mock.calls[0][0].data).toMatchObject({
      provider: "MYFATOORAH",
      providerRef: "991",
    });
    // KWD, and the merchant's reference is what comes back on the callback.
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({ DisplayCurrencyIso: "KWD", InvoiceValue: 25 });
  });

  it("falls back to the hosted page when the gateway refuses, rather than a dead button", async () => {
    process.env.MYFATOORAH_API_KEY = "test-key";
    (global as any).fetch = jest.fn(async () => {
      throw new Error("network down");
    });

    const created = await createTopUp({ tenantId: TENANT, vendorId: VENDOR, amountKwd: "25.000" });

    expect(created.provider).toBe("MANUAL");
    expect(created.paymentUrl).toContain("/pay/");
  });
});

// ─── confirmTopUp ────────────────────────────────────────────────────────────

describe("confirmTopUp", () => {
  /** In-memory ledger double, same mechanics as walletService.test.ts. */
  function primeLedger() {
    const balances = new Map<string, Prisma.Decimal>();
    const tx = {
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
      walletTransaction: { create: jest.fn(async ({ data }: any) => ({ id: "wtx-1", ...data })) },
      walletEntry: { create: jest.fn(async ({ data }: any) => ({ id: "we-1", ...data })) },
    };
    p.$transaction = jest.fn(async (fn: any) => fn(tx));
    return { tx, balances };
  }

  it("credits VENDOR_PAYABLE and debits clearing, keyed so a replay cannot double-credit", async () => {
    const { tx, balances } = primeLedger();
    p.vendorTopUp.updateMany.mockResolvedValue({ count: 1 });
    p.vendorTopUp.findFirstOrThrow.mockResolvedValue({
      id: "tu-1",
      vendorId: VENDOR,
      amountKwd: D("25.000"),
      reference: "TOP-ABC123",
    });

    const result = await confirmTopUp({ tenantId: TENANT, topUpId: "tu-1" });

    expect(result).toEqual({ ok: true, alreadyPaid: false });
    // The compare-and-set: only a PENDING row can be claimed.
    expect(p.vendorTopUp.updateMany.mock.calls[0][0].where).toMatchObject({
      id: "tu-1",
      tenantId: TENANT,
      status: "PENDING",
    });
    // `topup:{id}` is the ledger's own replay guard.
    expect(tx.walletTransaction.create.mock.calls[0][0].data).toMatchObject({
      type: "TOP_UP",
      idempotencyKey: "topup:tu-1",
    });

    const entries = tx.walletEntry.create.mock.calls.map((c: any) => c[0].data);
    expect(entries).toHaveLength(2);
    const sum = (dir: string) =>
      entries
        .filter((e: any) => e.direction === dir)
        .reduce((acc: Prisma.Decimal, e: any) => acc.plus(e.amountKwd), D(0));
    expect(sum("DEBIT").equals(sum("CREDIT"))).toBe(true);

    // VENDOR_PAYABLE is liability-like: a CREDIT raises the balance, which is
    // what paying down a debt looks like.
    expect(balances.get(`acc:VENDOR:${VENDOR}`)!.toFixed(3)).toBe("25.000");
    expect(balances.get("acc:PLATFORM_CLEARING")!.toFixed(3)).toBe("25.000");
  });

  it("a replayed webhook is a no-op: the row is already PAID and nothing posts again", async () => {
    const { tx } = primeLedger();
    // The compare-and-set claims nothing the second time round.
    p.vendorTopUp.updateMany.mockResolvedValue({ count: 0 });
    p.vendorTopUp.findFirst.mockResolvedValue({ status: "PAID" });

    const result = await confirmTopUp({ tenantId: TENANT, topUpId: "tu-1" });

    expect(result).toEqual({ ok: true, alreadyPaid: true });
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("a cancelled top-up cannot be credited", async () => {
    const { tx } = primeLedger();
    p.vendorTopUp.updateMany.mockResolvedValue({ count: 0 });
    p.vendorTopUp.findFirst.mockResolvedValue({ status: "CANCELLED" });

    const result = await confirmTopUp({ tenantId: TENANT, topUpId: "tu-1" });

    expect(result).toEqual({ ok: false, alreadyPaid: false });
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });
});

// ─── cancelTopUp ─────────────────────────────────────────────────────────────

describe("cancelTopUp", () => {
  it("only ever cancels a PENDING row — a paid top-up is untouchable", async () => {
    p.vendorTopUp.updateMany.mockResolvedValue({ count: 0 });

    await expect(cancelTopUp(TENANT, "tu-paid")).resolves.toBe(false);
    expect(p.vendorTopUp.updateMany.mock.calls[0][0].where).toMatchObject({ status: "PENDING" });
  });

  it("returns true when it claimed the row", async () => {
    p.vendorTopUp.updateMany.mockResolvedValue({ count: 1 });
    await expect(cancelTopUp(TENANT, "tu-1")).resolves.toBe(true);
  });
});
