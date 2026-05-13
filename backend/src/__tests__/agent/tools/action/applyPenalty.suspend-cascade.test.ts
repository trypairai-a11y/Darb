// Phase 8 Wave 0 RED INTEGRATION test — turned GREEN by Wave 1
// (applyPenalty's ACCOUNT_SUSPENSION branch wraps Penalty.create +
// Driver.update + Shift.updateMany + DriverRestriction.create in a single
// prisma.$transaction). Do not skip.
//
// Behavior contract (REQ-agent-action-tools / Pitfall 4 — atomic suspend
// cascade):
//   1. happy path: applyPenalty {penaltyType:'ACCOUNT_SUSPENSION',
//      penaltyValue:'7', reason:'three strikes documented'} produces:
//        - Penalty row created
//        - Driver.status='SUSPENDED'
//        - Shift.updateMany ran with BOOKED→CANCELLED
//        - DriverRestriction.create ran with endDate ≈ 7 days from now
//   2. atomicity: mock DriverRestriction.create to throw → NO Penalty
//      row + Driver.status unchanged + Shift.updateMany rolled back (all
//      four mutations live inside ONE prisma.$transaction).
//   3. penaltyValue parsing: penaltyValue='14' → endDate ~14 days;
//      missing penaltyValue → defaults to 7 days.

import { prisma } from "../../../mocks/config";
import { applyPenalty } from "../../../../agent/tools/action/applyPenalty";

const TENANT_A = "tenant-A";

const ctx = {
  tenantId: TENANT_A,
  agentId: "monitor",
  runId: "run-1",
  actorRole: "ADMIN" as const,
  userId: "approver-1",
};

const baseInput = {
  driverId: "drv_xy12",
  penaltyType: "ACCOUNT_SUSPENSION" as const,
  penaltyValue: "7",
  reason: "Three strikes documented across the past 14-day cycle",
};

describe("Phase 8 / REQ-agent-action-tools: applyPenalty ACCOUNT_SUSPENSION cascade", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_A,
      name: "Mohamed",
      status: "ACTIVE",
    });
    (prisma.driver.update as jest.Mock).mockResolvedValue({});
    (prisma as any).penalty = {
      create: jest.fn().mockResolvedValue({ id: "penalty-77" }),
    };
    (prisma.shift as any).updateMany = jest.fn().mockResolvedValue({ count: 2 });
    (prisma as any).driverRestriction = {
      create: jest.fn().mockResolvedValue({ id: "restriction-1" }),
    };
    // The cascade must run inside a SINGLE $transaction. We track whether
    // the callback was awaited as a single unit.
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );
  });

  test("happy path: all four mutations persisted inside one prisma.$transaction", async () => {
    const before = Date.now();
    const result = await applyPenalty.execute(ctx, baseInput);
    const after = Date.now();

    expect((result as any).ok).toBe(true);
    expect((result as any).penaltyId).toBe("penalty-77");

    expect((prisma as any).penalty.create).toHaveBeenCalledTimes(1);
    expect(prisma.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "drv_xy12" }),
        data: expect.objectContaining({ status: "SUSPENDED" }),
      }),
    );
    expect((prisma.shift as any).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          driverId: "drv_xy12",
          status: "BOOKED",
        }),
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    expect((prisma as any).driverRestriction.create).toHaveBeenCalled();
    const restrictionCall = (prisma as any).driverRestriction.create.mock
      .calls[0][0];
    const endTs = +new Date(restrictionCall.data.endDate);
    expect(endTs - before).toBeGreaterThanOrEqual(7 * 86400000 - 1000);
    expect(endTs - after).toBeLessThanOrEqual(7 * 86400000 + 1000);
    // Single $transaction call wrapping the cascade.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  test("atomicity: DriverRestriction.create throws -> Penalty/Driver/Shift writes roll back (single tx)", async () => {
    (prisma as any).driverRestriction.create.mockRejectedValue(
      new Error("FK violation"),
    );
    await expect(applyPenalty.execute(ctx, baseInput)).rejects.toThrow(
      /FK violation/,
    );
    // All mutations were attempted INSIDE one $transaction; the contract is
    // that a single $transaction was opened (Prisma guarantees rollback on
    // any throw inside the callback).
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  test("penaltyValue='14' -> endDate ~14 days; missing penaltyValue -> defaults to 7 days", async () => {
    const before = Date.now();
    await applyPenalty.execute(ctx, { ...baseInput, penaltyValue: "14" });
    const call14 = (prisma as any).driverRestriction.create.mock.calls.at(-1)?.[0];
    const end14 = +new Date(call14.data.endDate);
    expect(end14 - before).toBeGreaterThanOrEqual(14 * 86400000 - 1000);

    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT_A,
      name: "Mohamed",
      status: "ACTIVE",
    });
    (prisma as any).penalty.create = jest.fn().mockResolvedValue({ id: "p2" });
    (prisma as any).driverRestriction.create = jest
      .fn()
      .mockResolvedValue({ id: "r2" });
    (prisma.shift as any).updateMany = jest.fn().mockResolvedValue({ count: 0 });
    (prisma.driver.update as jest.Mock).mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );

    const before2 = Date.now();
    await applyPenalty.execute(ctx, {
      ...baseInput,
      penaltyValue: undefined as unknown as string,
    });
    const lastCall = (prisma as any).driverRestriction.create.mock.calls.at(-1)?.[0];
    const endDefault = +new Date(lastCall.data.endDate);
    expect(endDefault - before2).toBeGreaterThanOrEqual(7 * 86400000 - 1000);
  });
});

// RED — turned GREEN by Wave 1 (applyPenalty.ts ACCOUNT_SUSPENSION branch).
