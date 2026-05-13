// Phase 8 Wave 0 RED test — turned GREEN by Wave 1 (recordCashSettlement +
// CashTransaction writes). Do not skip.
//
// Behavior contract (REQ-finance-cash-workbench / REQ-agent-action-tools /
// Pitfall 3 — cash rollback requires manual reversal):
//   1. Zod amountKd is Decimal-safe (zod number >=0.001); method in
//      {CASH, BANK_TRANSFER, MOBILE_WALLET}.
//   2. execute loads CashRecord tenant-scoped; throws 'Already settled'
//      when status='SETTLED'.
//   3. execute updates CashRecord {collectionAmount: input.amountKd,
//      pendingDues: max(0, salesAmount-amountKd), status:'SETTLED', notes}.
//   4. execute creates CashTransaction {tenantId, driverId,
//      type:'COLLECTION', amount, description: `Settled by ${userId} via
//      Workbench`}.
//   5. both writes happen inside prisma.$transaction; throwing inside
//      cashTransaction.create rolls back the cashRecord.update (atomic
//      books).
//   6. Decimal arithmetic: salesAmount=10.500 - amountKd=3.250 →
//      pendingDues=7.250 (string assertion to avoid float drift).

import { prisma } from "../../../mocks/config";
import { recordCashSettlement } from "../../../../agent/tools/action/recordCashSettlement";

const TENANT_A = "tenant-A";

const ctx = {
  tenantId: TENANT_A,
  agentId: "monitor",
  runId: "run-1",
  actorRole: "ACCOUNTANT" as const,
  userId: "accountant-1",
};

const baseRecord = {
  id: "cash-1",
  tenantId: TENANT_A,
  driverId: "drv_xy12",
  salesAmount: "10.500",
  collectionAmount: "0.000",
  pendingDues: "10.500",
  status: "PENDING",
  platform: "KEETA",
};

const validInput = {
  cashRecordId: "cash-1",
  amountKd: 3.25,
  method: "CASH" as const,
  note: "Cash handed to ops manager at 17:30",
};

describe("Phase 8 / REQ-agent-action-tools: recordCashSettlement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.cashRecord.findFirst as jest.Mock).mockResolvedValue(baseRecord);
    (prisma.cashRecord as any).update = jest.fn().mockResolvedValue({
      ...baseRecord,
      collectionAmount: "3.250",
      pendingDues: "7.250",
      status: "SETTLED",
    });
    (prisma as any).cashTransaction = {
      create: jest.fn().mockResolvedValue({ id: "tx-1" }),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );
  });

  test("Zod requires amountKd>=0.001 and method in enum", () => {
    expect(
      recordCashSettlement.inputValidator.safeParse({
        ...validInput,
        amountKd: 0,
      }).success,
    ).toBe(false);
    expect(
      recordCashSettlement.inputValidator.safeParse({
        ...validInput,
        method: "CRYPTO" as unknown as "CASH",
      }).success,
    ).toBe(false);
    expect(recordCashSettlement.inputValidator.safeParse(validInput).success).toBe(
      true,
    );
  });

  test("execute loads CashRecord tenant-scoped; throws 'Already settled' when status='SETTLED'", async () => {
    (prisma.cashRecord.findFirst as jest.Mock).mockResolvedValue({
      ...baseRecord,
      status: "SETTLED",
    });
    const result = await recordCashSettlement.execute(ctx, validInput);
    expect(prisma.cashRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "cash-1",
          tenantId: TENANT_A,
        }),
      }),
    );
    expect((result as any).ok).toBe(false);
    expect((result as any).error).toMatch(/already settled/i);
  });

  test("execute updates CashRecord {collectionAmount, pendingDues, status:'SETTLED', notes}", async () => {
    await recordCashSettlement.execute(ctx, validInput);
    const call = (prisma.cashRecord as any).update.mock.calls[0][0];
    expect(call.where).toEqual(expect.objectContaining({ id: "cash-1" }));
    expect(call.data.status).toBe("SETTLED");
    expect(call.data.collectionAmount).toBeDefined();
    expect(call.data.pendingDues).toBeDefined();
  });

  test("execute creates CashTransaction {tenantId, driverId, type:'COLLECTION', amount, description with ctx.userId}", async () => {
    await recordCashSettlement.execute(ctx, validInput);
    const call = (prisma as any).cashTransaction.create.mock.calls[0][0];
    expect(call.data.tenantId).toBe(TENANT_A);
    expect(call.data.driverId).toBe("drv_xy12");
    expect(call.data.type).toBe("COLLECTION");
    expect(String(call.data.description)).toContain("accountant-1");
    expect(String(call.data.description)).toContain("Workbench");
  });

  test("both writes happen inside prisma.$transaction; throw inside cashTransaction.create rolls back cashRecord.update", async () => {
    (prisma as any).cashTransaction.create.mockRejectedValue(
      new Error("simulated db error"),
    );
    await expect(recordCashSettlement.execute(ctx, validInput)).rejects.toThrow(
      /simulated db error/,
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  test("Decimal-safe arithmetic: salesAmount=10.500 - amountKd=3.250 -> pendingDues=7.250 (string compare)", async () => {
    await recordCashSettlement.execute(ctx, validInput);
    const call = (prisma.cashRecord as any).update.mock.calls[0][0];
    // Tool MUST use Decimal arithmetic (Prisma.Decimal or string ops) — not
    // raw float math. String-compare the resulting pendingDues against
    // '7.250' to catch float widening (10.5-3.25 = 7.249999... in JS float).
    expect(String(call.data.pendingDues)).toBe("7.250");
  });
});

// RED — turned GREEN by Wave 1 (recordCashSettlement.ts + CashTransaction model).
