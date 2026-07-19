// Reconciliation service unit tests (plan §A5). The headline case: a
// corrupted cached balance (WalletAccount.balanceKwd disagreeing with the
// Σ of its entries) must produce a MISMATCH run + CRITICAL Alert +
// ADMIN/ACCOUNTANT notifications.

import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../mocks/config";
import { runReconciliation } from "../../../services/wallet/reconciliationService";

const D = (v: string | number) => new Prisma.Decimal(v);

// The shared mock's typed surface has no wallet delegates — augment via an
// any-typed alias (same object instance the service resolves through the
// jest moduleNameMapper).
const p = prisma as any;

/**
 * Wire the read-side mocks for one scenario. groupBy dispatches on `by`,
 * walletTransaction.findMany dispatches on the presence of `where.type`
 * (COD invariant) vs `where.entries` (orphan sweep).
 */
function primeScenario(opts: { cachedBalanceKwd: string; entryDebitKwd: string }) {
  p.walletAccount = {
    findMany: jest.fn(async () => [
      {
        id: "acc-1",
        ownerType: "DRIVER_CASH",
        ownerKey: "DRIVER:drv-1",
        balanceKwd: D(opts.cachedBalanceKwd),
      },
    ]),
  };
  p.walletEntry = {
    groupBy: jest.fn(async ({ by }: any) => {
      if (by.includes("accountId")) {
        return [
          { accountId: "acc-1", direction: "DEBIT", _sum: { amountKwd: D(opts.entryDebitKwd) } },
        ];
      }
      // per-transaction sums — one balanced transaction
      return [
        { transactionId: "t1", direction: "DEBIT", _sum: { amountKwd: D(opts.entryDebitKwd) } },
        { transactionId: "t1", direction: "CREDIT", _sum: { amountKwd: D(opts.entryDebitKwd) } },
      ];
    }),
    findMany: jest.fn(async () => []), // cross-tenant orphan sweep
  };
  p.walletTransaction = {
    findMany: jest.fn(async ({ where }: any) => {
      if (where.type === "COD_SETTLEMENT") return []; // day's settlements
      return []; // headers with no entries
    }),
  };
  p.deliveryOrder = { findMany: jest.fn(async () => []) };
  p.walletReconciliationRun = {
    upsert: jest.fn(async ({ create }: any) => ({ id: "run-1", ...create })),
  };
  p.alert.create.mockReset();
  p.alert.create.mockResolvedValue({ id: "alert-1" });
  p.user = {
    findMany: jest.fn(async () => [{ id: "admin-1" }, { id: "accountant-1" }]),
  };
  p.notification.createMany = jest.fn(async ({ data }: any) => ({ count: data.length }));
}

describe("runReconciliation", () => {
  const runDate = new Date("2026-07-18T00:00:00");

  it("catches a corrupted cached balance → MISMATCH + CRITICAL alert + notifications", async () => {
    // Cache says 10.000 but the ledger entries only sum to 5.000.
    primeScenario({ cachedBalanceKwd: "10.000", entryDebitKwd: "5.000" });

    const run = await runReconciliation("test-tenant-id", runDate);

    expect(run.status).toBe("MISMATCH");
    const balanceCheck = run.checks.find((c) => c.name === "cached-balance")!;
    expect(balanceCheck.ok).toBe(false);
    expect(balanceCheck.details.mismatches).toEqual([
      expect.objectContaining({
        accountId: "acc-1",
        ownerKey: "DRIVER:drv-1",
        cachedKwd: "10.000",
        computedKwd: "5.000",
      }),
    ]);
    // The other three checks stay green.
    for (const name of ["per-transaction-balance", "cod-invariant", "orphans"]) {
      expect(run.checks.find((c) => c.name === name)!.ok).toBe(true);
    }

    // Run row upserted on the [tenantId, runDate] unique with MISMATCH.
    expect(p.walletReconciliationRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_runDate: expect.objectContaining({ tenantId: "test-tenant-id" }),
        },
        create: expect.objectContaining({ status: "MISMATCH" }),
        update: expect.objectContaining({ status: "MISMATCH" }),
      })
    );

    // CRITICAL alert raised.
    expect(p.alert.create).toHaveBeenCalledTimes(1);
    expect(p.alert.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "test-tenant-id",
      type: "WALLET_RECONCILIATION_MISMATCH",
      severity: "CRITICAL",
    });

    // In-app notification per ADMIN/ACCOUNTANT user.
    expect(p.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "test-tenant-id",
          role: { in: ["ADMIN", "ACCOUNTANT"] },
        }),
      })
    );
    expect(p.notification.createMany).toHaveBeenCalledTimes(1);
    const rows = (p.notification.createMany as jest.Mock).mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      userId: "admin-1",
      severity: "CRITICAL",
      type: "WALLET_RECONCILIATION_MISMATCH",
    });
  });

  it("returns OK and raises no alarms when cache and entries agree", async () => {
    primeScenario({ cachedBalanceKwd: "5.000", entryDebitKwd: "5.000" });

    const run = await runReconciliation("test-tenant-id", runDate);

    expect(run.status).toBe("OK");
    expect(run.checks.every((c) => c.ok)).toBe(true);
    expect(p.walletReconciliationRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: "OK" }) })
    );
    expect(p.alert.create).not.toHaveBeenCalled();
    expect(p.notification.createMany).not.toHaveBeenCalled();
  });
});
