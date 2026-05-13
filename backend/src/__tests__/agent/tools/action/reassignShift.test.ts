// Phase 8 Wave 0 RED test — turned GREEN by Wave 1 (reassignShift tool).
// Do not skip.
//
// Behavior contract (REQ-agent-action-tools / CON-tenant-scope):
//   1. Zod requires shiftId, newDriverId, reason; rejects when
//      newDriverId === currentDriverId.
//   2. execute loads Shift tenant-scoped + captures previousDriverId in
//      tool output (rollback dispatcher reads it from originalProposal).
//   3. Refuses when newDriver has an overlapping BOOKED Shift — returns
//      { ok:false, error:'Driver already booked at that time' }.
//   4. Shift.update {driverId: newDriverId} inside prisma.$transaction.
//   5. Returns { ok:true, shiftId, previousDriverId, newDriverId }.

import { prisma } from "../../../mocks/config";
import { reassignShift } from "../../../../agent/tools/action/reassignShift";

const TENANT_A = "tenant-A";

const ctx = {
  tenantId: TENANT_A,
  agentId: "monitor",
  runId: "run-1",
  actorRole: "OPS_MANAGER" as const,
  userId: "approver-1",
};

const baseShift = {
  id: "shift-1",
  tenantId: TENANT_A,
  driverId: "drv_old",
  status: "BOOKED",
  scheduledStart: new Date("2026-05-14T09:00:00Z"),
  scheduledEnd: new Date("2026-05-14T13:00:00Z"),
};

const validInput = {
  shiftId: "shift-1",
  newDriverId: "drv_new",
  reason: "Original driver called in sick; coverage required for Hawally zone",
};

describe("Phase 8 / REQ-agent-action-tools: reassignShift", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.shift.findFirst as jest.Mock).mockResolvedValue(baseShift);
    (prisma.shift as any).findMany = jest.fn().mockResolvedValue([]);
    (prisma.shift as any).update = jest
      .fn()
      .mockResolvedValue({ ...baseShift, driverId: "drv_new" });
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(prisma),
    );
  });

  test("Zod rejects when newDriverId === currentDriverId not enforced at schema level; rejects empty fields", () => {
    expect(
      reassignShift.inputValidator.safeParse({
        shiftId: "",
        newDriverId: "drv_new",
        reason: validInput.reason,
      }).success,
    ).toBe(false);
    expect(
      reassignShift.inputValidator.safeParse({
        shiftId: "shift-1",
        newDriverId: "",
        reason: validInput.reason,
      }).success,
    ).toBe(false);
    expect(
      reassignShift.inputValidator.safeParse({
        shiftId: "shift-1",
        newDriverId: "drv_new",
        reason: "x",
      }).success,
    ).toBe(false);
  });

  test("execute loads Shift tenant-scoped + captures previousDriverId in output", async () => {
    const result = await reassignShift.execute(ctx, validInput);
    expect(prisma.shift.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "shift-1",
          tenantId: TENANT_A,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        shiftId: "shift-1",
        previousDriverId: "drv_old",
        newDriverId: "drv_new",
      }),
    );
  });

  test("refuses when newDriver has an overlapping BOOKED Shift", async () => {
    (prisma.shift as any).findMany.mockResolvedValue([
      {
        id: "shift-conflict",
        driverId: "drv_new",
        status: "BOOKED",
        scheduledStart: new Date("2026-05-14T10:00:00Z"),
        scheduledEnd: new Date("2026-05-14T14:00:00Z"),
      },
    ]);
    const result = await reassignShift.execute(ctx, validInput);
    expect((result as any).ok).toBe(false);
    expect((result as any).error).toMatch(/already booked/i);
  });

  test("execute Shift.update {driverId:newDriverId} inside prisma.$transaction", async () => {
    await reassignShift.execute(ctx, validInput);
    expect((prisma.shift as any).update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "shift-1" }),
        data: expect.objectContaining({ driverId: "drv_new" }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  test("returns { ok:true, shiftId, previousDriverId, newDriverId } shape — REVERSERS.reassignShift reads previousDriverId from originalProposal", async () => {
    const result = await reassignShift.execute(ctx, validInput);
    expect((result as any).previousDriverId).toBe("drv_old");
    expect((result as any).newDriverId).toBe("drv_new");
  });
});

// RED — turned GREEN by Wave 1 (reassignShift.ts).
