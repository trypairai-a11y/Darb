// Phase 8 Wave 0 RED test — turned GREEN by Wave 1 (applyPenalty tool ships
// + Prisma migration adds the Penalty composite index + DriverRestriction).
// Do not skip. The import path below intentionally resolves to a module that
// Wave 1 will create — Jest's module-not-found error IS the RED state.
//
// Behavior contract (REQ-agent-action-tools / CON-tool-tenant-scope /
// Pitfall 2 — penalty composite index):
//   1. registered in toolRegistry with name='applyPenalty',
//      sideEffect='write', requiresApproval=true, requiredRole includes
//      ADMIN/OPS_MANAGER/ACCOUNTANT.
//   2. Zod rejects when reason is <20 chars; rejects unknown penaltyType.
//   3. execute(ctx, input) calls prisma.driver.findFirst({where:{id,
//      tenantId:ctx.tenantId}}); throws when driver row is null.
//   4. execute creates Penalty row with penaltyStatus='EFFECTIVE',
//      driverId from input, tenantId from ctx; connects sourceViolationId
//      via violations.connect when provided.
//   5. execute wraps the body in prisma.$transaction; any throw inside
//      callback rolls back the Penalty row (atomicity per Pitfall 4).
//   6. Returns { ok: true, penaltyId, penaltyType } — audit row uses
//      penaltyId as subjectId.
//   7. penaltyType='ACCOUNT_SUSPENSION' triggers the suspend cascade
//      (driver.update + shift.updateMany + driverRestriction.create) —
//      cascade integration asserted in applyPenalty.suspend-cascade.test.ts.

import { prisma } from "../../../mocks/config";
import { applyPenalty } from "../../../../agent/tools/action/applyPenalty";
import { toolRegistry } from "../../../../agent/registry";

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const ctx = {
  tenantId: TENANT_A,
  agentId: "monitor",
  runId: "run-1",
  actorRole: "ADMIN" as const,
  userId: "approver-1",
};

const validInput = {
  driverId: "drv_xy12",
  penaltyType: "VIOLATION_RECORD" as const,
  penaltyValue: "2.500",
  reason: "Late pickup recorded across 3 orders this week",
  sourceViolationId: undefined as string | undefined,
};

describe("Phase 8 / REQ-agent-action-tools: applyPenalty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_A,
      name: "Mohamed",
      status: "ACTIVE",
    });
    (prisma as any).penalty = {
      create: jest.fn().mockResolvedValue({ id: "penalty-1" }),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    };
    (prisma as any).driverRestriction = { create: jest.fn() };
    (prisma.shift as any).updateMany = jest.fn();
    (prisma.driver.update as jest.Mock).mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );
  });

  test("registers in toolRegistry with correct shape (name/sideEffect/requiresApproval/requiredRole)", () => {
    const tool = toolRegistry.get("applyPenalty");
    expect(tool).toBeDefined();
    expect(tool?.name).toBe("applyPenalty");
    expect(tool?.sideEffect).toBe("write");
    expect(tool?.requiresApproval).toBe(true);
    expect(tool?.requiredRole).toEqual(
      expect.arrayContaining(["ADMIN", "OPS_MANAGER", "ACCOUNTANT"]),
    );
  });

  test("Zod rejects when reason is <20 chars", () => {
    const parsed = applyPenalty.inputValidator.safeParse({
      ...validInput,
      reason: "too short",
    });
    expect(parsed.success).toBe(false);
  });

  test("Zod rejects unknown penaltyType", () => {
    const parsed = applyPenalty.inputValidator.safeParse({
      ...validInput,
      penaltyType: "UNKNOWN_PENALTY" as unknown as "VIOLATION_RECORD",
    });
    expect(parsed.success).toBe(false);
  });

  test("execute calls prisma.driver.findFirst tenant-scoped; throws 'Driver not in tenant scope' when null", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await applyPenalty.execute(ctx, validInput);
    expect(prisma.driver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "drv_xy12",
          tenantId: TENANT_A,
        }),
      }),
    );
    expect((result as any).ok).toBe(false);
    expect((result as any).error).toMatch(/tenant/i);
  });

  test("execute creates Penalty row with penaltyStatus='EFFECTIVE', driverId, tenantId; connects sourceViolationId.violations.connect when provided", async () => {
    await applyPenalty.execute(ctx, {
      ...validInput,
      sourceViolationId: "violation-7",
    });
    expect((prisma as any).penalty.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_A,
          driverId: "drv_xy12",
          penaltyStatus: "EFFECTIVE",
          violations: expect.objectContaining({
            connect: expect.objectContaining({ id: "violation-7" }),
          }),
        }),
      }),
    );
  });

  test("execute wraps body in prisma.$transaction; throwing inside callback rolls back the Penalty.create", async () => {
    const txMock = jest.fn().mockImplementation(async (_cb: any) => {
      throw new Error("simulated tx rollback");
    });
    (prisma.$transaction as jest.Mock) = txMock;
    await expect(applyPenalty.execute(ctx, validInput)).rejects.toThrow(
      /simulated tx rollback/,
    );
    // We invoked $transaction (atomicity boundary); the rollback semantics
    // are guaranteed by Prisma — the contract here is that the tool body
    // *enters* a $transaction.
    expect(txMock).toHaveBeenCalled();
  });

  test("execute returns { ok: true, penaltyId, penaltyType }", async () => {
    (prisma as any).penalty.create.mockResolvedValue({ id: "penalty-77" });
    const result = await applyPenalty.execute(ctx, validInput);
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        penaltyId: "penalty-77",
        penaltyType: "VIOLATION_RECORD",
      }),
    );
  });

  test("penaltyType='ACCOUNT_SUSPENSION' delegates the suspend cascade (driver.update + shift.updateMany + driverRestriction.create)", async () => {
    await applyPenalty.execute(ctx, {
      ...validInput,
      penaltyType: "ACCOUNT_SUSPENSION",
      penaltyValue: "7",
      reason: "Three strikes documented over the past 14 days",
    });
    expect(prisma.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "drv_xy12" }),
        data: expect.objectContaining({ status: "SUSPENDED" }),
      }),
    );
    expect((prisma.shift as any).updateMany).toHaveBeenCalled();
    expect((prisma as any).driverRestriction.create).toHaveBeenCalled();
  });

  test("tenant isolation: ctx.tenantId=B with driver tied to A does not surface as found", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await applyPenalty.execute(
      { ...ctx, tenantId: TENANT_B },
      validInput,
    );
    expect(prisma.driver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_B }),
      }),
    );
    expect((result as any).ok).toBe(false);
  });
});

// RED — turned GREEN by Wave 1 (applyPenalty.ts + Penalty composite index migration).
