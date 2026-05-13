// Phase 8 Wave 0 RED test — turned GREEN by Wave 1 (suspendDriver tool +
// DriverRestriction model). Do not skip.
//
// Behavior contract (REQ-agent-action-tools / CON-tenant-scope + Pitfall 4 —
// atomic suspend cascade):
//   1. registered with sideEffect='write', requiresApproval=true,
//      requiredRole=['ADMIN','OPS_MANAGER'].
//   2. Zod rejects durationDays<1 or >365; rejects reason<20 chars.
//   3. execute flips Driver.status='SUSPENDED' tenant-scoped.
//   4. execute calls Shift.updateMany where {driverId, scheduledStart:
//      {gte:now}, status:'BOOKED'} → {status:'CANCELLED'} (future shifts only).
//   5. execute creates DriverRestriction with type='TEMPORARY',
//      startDate=now, endDate=now+durationDays*86400000, reason=input.reason.
//   6. Throws when Driver not in tenant scope; prisma.$transaction wrapper
//      guarantees all three writes commit or none do.

import { prisma } from "../../../mocks/config";
import { suspendDriver } from "../../../../agent/tools/action/suspendDriver";
import { toolRegistry } from "../../../../agent/registry";

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
  durationDays: 7,
  reason: "Repeated GPS-stale events across three consecutive shifts",
};

describe("Phase 8 / REQ-agent-action-tools: suspendDriver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_A,
      name: "Mohamed",
      status: "ACTIVE",
    });
    (prisma.driver.update as jest.Mock).mockResolvedValue({});
    (prisma.shift as any).updateMany = jest.fn().mockResolvedValue({ count: 2 });
    (prisma as any).driverRestriction = {
      create: jest.fn().mockResolvedValue({ id: "restriction-1" }),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );
  });

  test("registers with sideEffect='write', requiresApproval=true, requiredRole=['ADMIN','OPS_MANAGER']", () => {
    const tool = toolRegistry.get("suspendDriver");
    expect(tool).toBeDefined();
    expect(tool?.sideEffect).toBe("write");
    expect(tool?.requiresApproval).toBe(true);
    expect(tool?.requiredRole).toEqual(
      expect.arrayContaining(["ADMIN", "OPS_MANAGER"]),
    );
  });

  test("Zod rejects durationDays<1 or >365; rejects reason<20 chars", () => {
    expect(
      suspendDriver.inputValidator.safeParse({ ...validInput, durationDays: 0 })
        .success,
    ).toBe(false);
    expect(
      suspendDriver.inputValidator.safeParse({ ...validInput, durationDays: 366 })
        .success,
    ).toBe(false);
    expect(
      suspendDriver.inputValidator.safeParse({ ...validInput, reason: "short" })
        .success,
    ).toBe(false);
  });

  test("execute flips Driver.status='SUSPENDED' tenant-scoped", async () => {
    await suspendDriver.execute(ctx, validInput);
    expect(prisma.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "drv_xy12" }),
        data: expect.objectContaining({ status: "SUSPENDED" }),
      }),
    );
  });

  test("execute calls Shift.updateMany {driverId, scheduledStart:{gte:now}, status:'BOOKED'} -> {status:'CANCELLED'}", async () => {
    await suspendDriver.execute(ctx, validInput);
    expect((prisma.shift as any).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          driverId: "drv_xy12",
          tenantId: TENANT_A,
          status: "BOOKED",
        }),
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    // assert scheduledStart filter is a future-only gate
    const call = (prisma.shift as any).updateMany.mock.calls[0][0];
    expect(call.where.scheduledStart).toBeDefined();
  });

  test("execute creates DriverRestriction with type='TEMPORARY', startDate=now, endDate ~+durationDays", async () => {
    const before = Date.now();
    await suspendDriver.execute(ctx, validInput);
    const after = Date.now();
    const call = (prisma as any).driverRestriction.create.mock.calls[0][0];
    expect(call.data.type).toBe("TEMPORARY");
    expect(call.data.tenantId).toBe(TENANT_A);
    expect(call.data.driverId).toBe("drv_xy12");
    expect(call.data.reason).toContain("GPS-stale");
    const startTs = +new Date(call.data.startDate);
    const endTs = +new Date(call.data.endDate);
    expect(startTs).toBeGreaterThanOrEqual(before);
    expect(startTs).toBeLessThanOrEqual(after);
    expect(endTs - startTs).toBeGreaterThanOrEqual(
      7 * 86400000 - 1000 /* slack */,
    );
    expect(endTs - startTs).toBeLessThanOrEqual(7 * 86400000 + 1000);
  });

  test("throws / returns error when Driver not in tenant scope", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await suspendDriver.execute(ctx, validInput);
    expect((result as any).ok).toBe(false);
    expect((result as any).error).toMatch(/tenant/i);
  });

  test("prisma.$transaction wraps the three writes; rollback if any one throws", async () => {
    // Simulate driverRestriction.create throwing inside the tx callback.
    (prisma as any).driverRestriction.create.mockRejectedValue(
      new Error("FK violation"),
    );
    await expect(suspendDriver.execute(ctx, validInput)).rejects.toThrow(
      /FK violation/,
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

// RED — turned GREEN by Wave 1 (suspendDriver.ts + DriverRestriction Prisma model).
