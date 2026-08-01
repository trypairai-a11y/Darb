// Darb 2.0 revision 14 — the delivery company's prepaid cash account.
//
// Contract under test, in the order it matters:
//   1. Confirming a deposit credits FLEET_CASH once. A replay credits nothing.
//   2. A row that reads CONFIRMED with no posting behind it is REPAIRED, not
//      shrugged at. That is the bug confirmTopUp shipped with, and this account
//      must not learn it a second time.
//   3. Rejecting posts nothing and needs a reason.
//   4. Settling refuses when the batch total exceeds the deposit balance, and
//      refuses a line above what that driver is carrying — and in both cases
//      creates NOTHING. A half-applied settlement is the one outcome neither
//      side can reconcile.
//   5. A driver on somebody else's roster cannot be settled from this account.

import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.fleetCashDeposit = prisma.fleetCashDeposit ?? {
  create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(),
  updateMany: jest.fn(), count: jest.fn(), aggregate: jest.fn(),
};
prisma.walletAccount = prisma.walletAccount ?? {
  upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
  findFirst: jest.fn(), findMany: jest.fn(),
};
prisma.walletTransaction = prisma.walletTransaction ?? {
  create: jest.fn(), findFirst: jest.fn(),
};
prisma.walletEntry = prisma.walletEntry ?? { create: jest.fn() };
prisma.remittance = prisma.remittance ?? { create: jest.fn(), findMany: jest.fn() };
prisma.driver = prisma.driver ?? { findMany: jest.fn(), findFirst: jest.fn() };

jest.mock("../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import { Prisma } from "../../generated/prisma";
import {
  confirmFleetDeposit,
  FleetCashConflict,
  FleetCashError,
  rejectFleetDeposit,
  settleDriverCash,
} from "../../services/wallet/fleetCashService";

const D = (n: number | string) => new Prisma.Decimal(n);

const FLEET_ACCOUNT = { id: "acc-fleet", balanceKwd: D(500) };
const CLEARING = { id: "acc-clearing", balanceKwd: D(0) };

/** ensureAccount is an upsert; route each owner key to its account. */
function accountsByKey(extra: Record<string, { id: string; balanceKwd: Prisma.Decimal }> = {}) {
  const table: Record<string, { id: string; balanceKwd: Prisma.Decimal }> = {
    "FLEET:f-1": FLEET_ACCOUNT,
    PLATFORM_CLEARING: CLEARING,
    ...extra,
  };
  prisma.walletAccount.upsert.mockImplementation(async ({ where }: any) => {
    const key = where.tenantId_ownerKey.ownerKey;
    return table[key] ?? { id: `acc-${key}`, balanceKwd: D(0) };
  });
}

beforeEach(() => {
  resetAllMocks();
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  // postLedgerTransaction: header create, then per-leg balance update + entry.
  prisma.walletTransaction.create.mockResolvedValue({ id: "tx-1" });
  prisma.walletAccount.update.mockImplementation(async ({ where }: any) => ({
    id: where.id,
    balanceKwd: D(0),
  }));
  prisma.walletEntry.create.mockResolvedValue({ id: "we-1" });
});

// ─── Deposits ────────────────────────────────────────────────────────────────

describe("confirmFleetDeposit", () => {
  const DEPOSIT = {
    id: "dep-1",
    fleetPartnerId: "f-1",
    amountKwd: D(500),
    reference: "DEP-ABC123",
    status: "PENDING",
  };

  test("credits FLEET_CASH and debits clearing, under a PENDING-only claim", async () => {
    accountsByKey();
    prisma.fleetCashDeposit.updateMany.mockResolvedValue({ count: 1 });
    prisma.fleetCashDeposit.findFirst.mockResolvedValue({ ...DEPOSIT, status: "CONFIRMED" });

    const res = await confirmFleetDeposit({
      tenantId: "t-1", depositId: "dep-1", actorId: "u-acct",
    });

    expect(res.ok).toBe(true);
    expect(res.alreadyConfirmed).toBe(false);
    // The claim is the compare-and-set: only a PENDING row may be confirmed.
    expect(prisma.fleetCashDeposit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "dep-1", tenantId: "t-1", status: "PENDING" }),
        data: expect.objectContaining({ status: "CONFIRMED", confirmedById: "u-acct" }),
      }),
    );
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "FLEET_DEPOSIT",
          idempotencyKey: "fleet-deposit:dep-1",
        }),
      }),
    );
  });

  test("a replay posts nothing: the claim fails and the posting is already there", async () => {
    accountsByKey();
    prisma.fleetCashDeposit.updateMany.mockResolvedValue({ count: 0 });
    prisma.fleetCashDeposit.findFirst.mockResolvedValue({ ...DEPOSIT, status: "CONFIRMED" });
    prisma.walletTransaction.findFirst.mockResolvedValue({ id: "tx-existing" });
    prisma.walletAccount.findFirst.mockResolvedValue({ balanceKwd: D(500) });

    const res = await confirmFleetDeposit({
      tenantId: "t-1", depositId: "dep-1", actorId: "u-acct",
    });

    expect(res.alreadyConfirmed).toBe(true);
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
  });

  test("a CONFIRMED row with no posting behind it is repaired", async () => {
    // The failure this guards: flip the row, die before posting. Every retry
    // then takes the already-confirmed path and the company's money is nowhere.
    accountsByKey();
    prisma.fleetCashDeposit.updateMany.mockResolvedValue({ count: 0 });
    prisma.fleetCashDeposit.findFirst.mockResolvedValue({ ...DEPOSIT, status: "CONFIRMED" });
    prisma.walletTransaction.findFirst.mockResolvedValue(null);

    const res = await confirmFleetDeposit({
      tenantId: "t-1", depositId: "dep-1", actorId: "u-acct",
    });

    expect(res.alreadyConfirmed).toBe(true);
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: "fleet-deposit:dep-1" }),
      }),
    );
  });

  test("a rejected deposit cannot be confirmed", async () => {
    accountsByKey();
    prisma.fleetCashDeposit.updateMany.mockResolvedValue({ count: 0 });
    prisma.fleetCashDeposit.findFirst.mockResolvedValue({ ...DEPOSIT, status: "REJECTED" });

    await expect(
      confirmFleetDeposit({ tenantId: "t-1", depositId: "dep-1", actorId: "u-acct" }),
    ).rejects.toBeInstanceOf(FleetCashConflict);
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
  });
});

describe("rejectFleetDeposit", () => {
  test("needs a reason and posts nothing", async () => {
    await expect(
      rejectFleetDeposit({ tenantId: "t-1", depositId: "dep-1", actorId: "u", reason: "  " }),
    ).rejects.toBeInstanceOf(FleetCashError);
    expect(prisma.fleetCashDeposit.updateMany).not.toHaveBeenCalled();
  });

  test("claims a PENDING row and never a confirmed one", async () => {
    prisma.fleetCashDeposit.updateMany.mockResolvedValue({ count: 1 });
    prisma.fleetCashDeposit.findFirst.mockResolvedValue({
      id: "dep-1", fleetPartnerId: "f-1", amountKwd: D(500), reference: "DEP-ABC123",
    });

    await rejectFleetDeposit({
      tenantId: "t-1", depositId: "dep-1", actorId: "u", reason: "Short by KD 20",
    });

    expect(prisma.fleetCashDeposit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
        data: expect.objectContaining({ status: "REJECTED", rejectReason: "Short by KD 20" }),
      }),
    );
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
  });
});

// ─── Settlement ──────────────────────────────────────────────────────────────

describe("settleDriverCash", () => {
  const DRIVERS = [
    { id: "d-1", name: "Ahmed" },
    { id: "d-2", name: "Saleh" },
  ];

  function driverAccounts(balances: Record<string, number>) {
    accountsByKey(
      Object.fromEntries(
        Object.entries(balances).map(([id, v]) => [
          `DRIVER:${id}`,
          { id: `acc-${id}`, balanceKwd: D(v) },
        ]),
      ),
    );
  }

  test("clears each driver and debits the company's balance", async () => {
    driverAccounts({ "d-1": 120, "d-2": 200 });
    prisma.walletAccount.updateMany.mockResolvedValue({ count: 1 });
    prisma.driver.findMany.mockResolvedValue(DRIVERS);
    prisma.remittance.create.mockImplementation(async ({ data }: any) => ({
      id: `rem-${data.driverId}`,
      ...data,
    }));

    const res = await settleDriverCash({
      tenantId: "t-1",
      fleetPartnerId: "f-1",
      actorId: "u-fleet",
      lines: [
        { driverId: "d-1", amountKwd: "120.000" },
        { driverId: "d-2", amountKwd: "200.000" },
      ],
    });

    expect(res.totalKwd).toBe("320.000");
    expect(res.lines).toHaveLength(2);
    // Each line is a Remittance carrying the company, so a driver's cash
    // history stays one list whoever settled it.
    expect(prisma.remittance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          driverId: "d-1",
          fleetPartnerId: "f-1",
          method: "FLEET_ACCOUNT",
        }),
      }),
    );
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "REMITTANCE",
          idempotencyKey: "remit:rem-d-1",
        }),
      }),
    );
  });

  test("refuses and writes nothing when the total exceeds the deposit balance", async () => {
    driverAccounts({ "d-1": 400, "d-2": 400 });
    // The guarded claim on the fleet account is what fails here.
    prisma.walletAccount.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      settleDriverCash({
        tenantId: "t-1",
        fleetPartnerId: "f-1",
        actorId: "u-fleet",
        lines: [
          { driverId: "d-1", amountKwd: "400.000" },
          { driverId: "d-2", amountKwd: "400.000" },
        ],
      }),
    ).rejects.toBeInstanceOf(FleetCashError);

    expect(prisma.remittance.create).not.toHaveBeenCalled();
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
  });

  test("one line above that driver's cash settles NONE of them", async () => {
    driverAccounts({ "d-1": 120, "d-2": 10 });
    prisma.driver.findMany.mockResolvedValue(DRIVERS);
    prisma.remittance.create.mockImplementation(async ({ data }: any) => ({
      id: `rem-${data.driverId}`,
      ...data,
    }));
    // The fleet-level claim passes; the second driver's claim does not.
    prisma.walletAccount.updateMany
      .mockResolvedValueOnce({ count: 1 }) // fleet balance covers 130
      .mockResolvedValueOnce({ count: 1 }) // d-1 is carrying 120
      .mockResolvedValueOnce({ count: 0 }); // d-2 is only carrying 10

    await expect(
      settleDriverCash({
        tenantId: "t-1",
        fleetPartnerId: "f-1",
        actorId: "u-fleet",
        lines: [
          { driverId: "d-1", amountKwd: "120.000" },
          { driverId: "d-2", amountKwd: "10.001" },
        ],
      }),
    ).rejects.toBeInstanceOf(FleetCashError);

    // The whole call is one interactive transaction, so d-1's Remittance is
    // rolled back with it. What matters here is that the service threw rather
    // than skipping the bad line and reporting success on the other.
    expect(prisma.walletTransaction.create).toHaveBeenCalledTimes(1);
  });

  test("a driver on another company's roster is refused", async () => {
    driverAccounts({ "d-1": 120 });
    prisma.walletAccount.updateMany.mockResolvedValue({ count: 1 });
    // Only one of the two named drivers comes back scoped to this company.
    prisma.driver.findMany.mockResolvedValue([DRIVERS[0]]);

    await expect(
      settleDriverCash({
        tenantId: "t-1",
        fleetPartnerId: "f-1",
        actorId: "u-fleet",
        lines: [
          { driverId: "d-1", amountKwd: "10.000" },
          { driverId: "d-elsewhere", amountKwd: "10.000" },
        ],
      }),
    ).rejects.toBeInstanceOf(FleetCashError);

    expect(prisma.remittance.create).not.toHaveBeenCalled();
  });

  test("the same driver twice is refused rather than settled twice", async () => {
    await expect(
      settleDriverCash({
        tenantId: "t-1",
        fleetPartnerId: "f-1",
        actorId: "u-fleet",
        lines: [
          { driverId: "d-1", amountKwd: "10.000" },
          { driverId: "d-1", amountKwd: "10.000" },
        ],
      }),
    ).rejects.toBeInstanceOf(FleetCashError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("a zero or negative amount never reaches the ledger", async () => {
    await expect(
      settleDriverCash({
        tenantId: "t-1", fleetPartnerId: "f-1", actorId: "u",
        lines: [{ driverId: "d-1", amountKwd: "0" }],
      }),
    ).rejects.toBeInstanceOf(FleetCashError);
    await expect(
      settleDriverCash({
        tenantId: "t-1", fleetPartnerId: "f-1", actorId: "u",
        lines: [{ driverId: "d-1", amountKwd: "-5" }],
      }),
    ).rejects.toBeInstanceOf(FleetCashError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
