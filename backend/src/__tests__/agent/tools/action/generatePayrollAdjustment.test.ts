// Phase 8 Wave 0 RED test — turned GREEN by Wave 1 (generatePayrollAdjustment
// tool + PayrollRun/PayrollAdjustment Prisma models). Do not skip.
//
// Behavior contract (REQ-finance-payroll / REQ-agent-action-tools /
// Pitfall 3 — frozen-run refusal):
//   1. Zod requires driverId, period (YYYY-Www string),
//      items: array of {label, amountKd: Decimal-safe, kind:
//      'DEDUCTION'|'BONUS'}.
//   2. execute loads PayrollRun for {tenantId, period}; refuses when
//      PayrollRun.status='FROZEN' → {ok:false, error:'Run is frozen;
//      rollback via accountant counter-entry'}.
//   3. execute creates PayrollAdjustment {tenantId, driverId, runId,
//      items: Json} inside prisma.$transaction.
//   4. Computes sumDeductions - sumBonuses; asserts non-negative net
//      adjustment unless explicitly overridden.
//   5. Returns { ok:true, adjustmentId, netKd }.

import { prisma } from "../../../mocks/config";
import { generatePayrollAdjustment } from "../../../../agent/tools/action/generatePayrollAdjustment";

const TENANT_A = "tenant-A";

const ctx = {
  tenantId: TENANT_A,
  agentId: "monitor",
  runId: "run-1",
  actorRole: "ACCOUNTANT" as const,
  userId: "accountant-1",
};

const validInput = {
  driverId: "drv_xy12",
  period: "2026-W17",
  items: [
    { label: "Late pickup penalty", amountKd: 2.5, kind: "DEDUCTION" as const },
    { label: "Top performer bonus", amountKd: 1.0, kind: "BONUS" as const },
  ],
};

describe("Phase 8 / REQ-agent-action-tools: generatePayrollAdjustment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_A,
    });
    (prisma as any).payrollRun = {
      findFirst: jest.fn().mockResolvedValue({
        id: "run-w17",
        tenantId: TENANT_A,
        period: "2026-W17",
        status: "DRAFT",
      }),
      update: jest.fn(),
      create: jest.fn(),
    };
    (prisma as any).payrollAdjustment = {
      create: jest.fn().mockResolvedValue({ id: "adj-1" }),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );
  });

  test("Zod requires period in YYYY-Www format; rejects malformed", () => {
    expect(
      generatePayrollAdjustment.inputValidator.safeParse({
        ...validInput,
        period: "not-a-week",
      }).success,
    ).toBe(false);
    expect(
      generatePayrollAdjustment.inputValidator.safeParse(validInput).success,
    ).toBe(true);
  });

  test("Zod requires items[] with kind in {DEDUCTION,BONUS}", () => {
    expect(
      generatePayrollAdjustment.inputValidator.safeParse({
        ...validInput,
        items: [
          { label: "x", amountKd: 1, kind: "FOO" as unknown as "DEDUCTION" },
        ],
      }).success,
    ).toBe(false);
  });

  test("execute loads PayrollRun for {tenantId, period}; refuses when status='FROZEN'", async () => {
    (prisma as any).payrollRun.findFirst.mockResolvedValue({
      id: "run-w17",
      tenantId: TENANT_A,
      period: "2026-W17",
      status: "FROZEN",
    });
    const result = await generatePayrollAdjustment.execute(ctx, validInput);
    expect((result as any).ok).toBe(false);
    expect((result as any).error).toMatch(/frozen/i);
    expect((prisma as any).payrollAdjustment.create).not.toHaveBeenCalled();
  });

  test("execute creates PayrollAdjustment {tenantId, driverId, runId, items} inside prisma.$transaction", async () => {
    await generatePayrollAdjustment.execute(ctx, validInput);
    const call = (prisma as any).payrollAdjustment.create.mock.calls[0][0];
    expect(call.data).toEqual(
      expect.objectContaining({
        tenantId: TENANT_A,
        driverId: "drv_xy12",
        runId: "run-w17",
      }),
    );
    expect(call.data.items).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  test("returns { ok:true, adjustmentId, netKd } with net = sumDeductions - sumBonuses", async () => {
    const result = await generatePayrollAdjustment.execute(ctx, validInput);
    expect((result as any).ok).toBe(true);
    expect((result as any).adjustmentId).toBe("adj-1");
    // 2.500 deduction - 1.000 bonus = 1.500 net deduction
    expect(String((result as any).netKd)).toBe("1.500");
  });
});

// RED — turned GREEN by Wave 1 (generatePayrollAdjustment.ts + PayrollRun/PayrollAdjustment migrations).
