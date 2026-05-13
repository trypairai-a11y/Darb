// Phase 8 Wave 0 RED test — turned GREEN by Wave 1 (createTrainingTask +
// TrainingTask Prisma model). Do not skip.
//
// Behavior contract (REQ-agent-action-tools):
//   1. Zod requires driverId, trainingType (enum: GENERIC | LATE_CLOCKIN |
//      GPS | CASH_HANDLING | ORDER_REJECTION); rejects unknown values.
//   2. execute creates TrainingTask {tenantId, driverId, trainingType,
//      status:'ASSIGNED', sourceViolationId: input.sourceViolationId ??
//      null, dueDate: now+7d}.
//   3. execute loads Driver tenant-scoped; throws on cross-tenant.
//   4. Returns { ok:true, trainingTaskId, dueDate }.

import { prisma } from "../../../mocks/config";
import { createTrainingTask } from "../../../../agent/tools/action/createTrainingTask";

const TENANT_A = "tenant-A";

const ctx = {
  tenantId: TENANT_A,
  agentId: "monitor",
  runId: "run-1",
  actorRole: "ADMIN" as const,
  userId: "approver-1",
};

const validInput = {
  driverId: "drv_xy12",
  trainingType: "GPS" as const,
  sourceViolationId: undefined as string | undefined,
};

describe("Phase 8 / REQ-agent-action-tools: createTrainingTask", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_A,
      name: "Mohamed",
    });
    (prisma as any).trainingTask = {
      create: jest.fn().mockResolvedValue({
        id: "tt-1",
        dueDate: new Date("2026-05-20T10:00:00Z"),
      }),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );
  });

  test("Zod rejects unknown trainingType value", () => {
    expect(
      createTrainingTask.inputValidator.safeParse({
        ...validInput,
        trainingType: "UNKNOWN" as unknown as "GPS",
      }).success,
    ).toBe(false);
    expect(
      createTrainingTask.inputValidator.safeParse(validInput).success,
    ).toBe(true);
  });

  test("execute creates TrainingTask {tenantId, driverId, trainingType, status:'ASSIGNED', sourceViolationId, dueDate=now+7d}", async () => {
    const before = Date.now();
    await createTrainingTask.execute(ctx, {
      ...validInput,
      sourceViolationId: "v-9",
    });
    const after = Date.now();
    const call = (prisma as any).trainingTask.create.mock.calls[0][0];
    expect(call.data).toEqual(
      expect.objectContaining({
        tenantId: TENANT_A,
        driverId: "drv_xy12",
        trainingType: "GPS",
        status: "ASSIGNED",
        sourceViolationId: "v-9",
      }),
    );
    const dueTs = +new Date(call.data.dueDate);
    expect(dueTs - before).toBeGreaterThanOrEqual(7 * 86400000 - 1000);
    expect(dueTs - after).toBeLessThanOrEqual(7 * 86400000 + 1000);
  });

  test("sourceViolationId omitted -> stored as null", async () => {
    await createTrainingTask.execute(ctx, validInput);
    const call = (prisma as any).trainingTask.create.mock.calls[0][0];
    expect(call.data.sourceViolationId).toBeNull();
  });

  test("execute loads Driver tenant-scoped; throws / returns error on cross-tenant", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await createTrainingTask.execute(ctx, validInput);
    expect(prisma.driver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "drv_xy12",
          tenantId: TENANT_A,
        }),
      }),
    );
    expect((result as any).ok).toBe(false);
  });
});

// RED — turned GREEN by Wave 1 (createTrainingTask.ts + TrainingTask migration).
