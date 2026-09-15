/**
 * Revision 20 — the weekly shift proposal.
 *
 * Two things are worth pinning down here, and neither is the arithmetic.
 *
 * The first is that the week boundary is LOCAL. Kuwait's Sunday starts at
 * 21:00Z the previous Saturday, so a UTC-based week start lands on the wrong
 * week for the first three hours of every day, and the plan would be keyed to
 * a Saturday nobody asked to plan.
 *
 * The second is the approval gate: `approveShiftPlan` is the only thing in the
 * platform that writes `ShiftCapacity`, it takes `approvedDrivers` and never
 * `proposedDrivers`, and it replaces the grid wholesale.
 */
import { getMockPrisma, resetAllMocks } from "../setup";
import {
  approveShiftPlan,
  updateShiftPlanEntries,
  weekStartOf,
  MAX_COVER,
} from "../../services/shiftPlanService";

const prisma = getMockPrisma();

/**
 * Attach the delegates this suite needs, per-suite.
 *
 * NOT added to __tests__/mocks/config.ts: that file's own comment records what
 * happens when a partial entry lands in the shared stub — suites that attach
 * their own richer delegate have it silently shadowed, which is how
 * vendors.test.ts broke in 2026-08-06. Revision 20's models are needed by this
 * suite and no other, so they belong here.
 */
function attachPlanDelegates() {
  const p = prisma as any;
  p.shiftPlan = {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    findFirstOrThrow: jest.fn(),
  };
  p.shiftPlanEntry = {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  };
  p.shiftCapacity = {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  };
}

describe("weekStartOf", () => {
  it("returns the Sunday of the week containing the date, at local midnight", () => {
    // 2026-09-15 is a Tuesday; its week starts Sunday 2026-09-13.
    const start = weekStartOf(new Date(2026, 8, 15, 14, 30));
    expect(start.getDay()).toBe(0);
    expect(start.getDate()).toBe(13);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("leaves a Sunday on its own day rather than walking back a week", () => {
    const start = weekStartOf(new Date(2026, 8, 13, 23, 59));
    expect(start.getDate()).toBe(13);
  });

  it("is idempotent, so re-deriving a stored week start cannot drift", () => {
    const once = weekStartOf(new Date(2026, 8, 15, 14, 30));
    expect(weekStartOf(once).getTime()).toBe(once.getTime());
  });
});

describe("approveShiftPlan", () => {
  beforeEach(() => {
    resetAllMocks();
    attachPlanDelegates();
    // The house transaction shim: run the callback against the same mock.
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  });

  it("writes the capacity grid from approvedDrivers, not from the proposal", () => {
    prisma.shiftPlan.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftPlanEntry.findMany.mockResolvedValue([
      { zoneId: "z1", dayOfWeek: 0, startTime: "10:00", approvedDrivers: 5 },
      { zoneId: "z1", dayOfWeek: 0, startTime: "13:00", approvedDrivers: 0 },
    ]);
    prisma.shiftCapacity.deleteMany.mockResolvedValue({ count: 3 });
    prisma.shiftCapacity.createMany.mockResolvedValue({ count: 2 });

    return approveShiftPlan({ tenantId: "t1", planId: "p1", approvedById: "u1" }).then(
      (result) => {
        expect(result).toEqual({ planId: "p1", windows: 2 });
        // Replaced wholesale — a per-cell write can drop halfway and leave a
        // week half on the new plan with nothing on screen able to say which.
        expect(prisma.shiftCapacity.deleteMany).toHaveBeenCalledWith({
          where: { tenantId: "t1" },
        });
        const written = prisma.shiftCapacity.createMany.mock.calls[0][0].data;
        expect(written).toEqual([
          { tenantId: "t1", zoneId: "z1", dayOfWeek: 0, startTime: "10:00", maxDrivers: 5 },
          // 0 is a real answer and closes the window; it is not dropped.
          { tenantId: "t1", zoneId: "z1", dayOfWeek: 0, startTime: "13:00", maxDrivers: 0 },
        ]);
      },
    );
  });

  it("refuses a plan that is not a draft, and writes no capacity", async () => {
    // The status-guarded claim: count 0 means somebody approved it first.
    prisma.shiftPlan.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      approveShiftPlan({ tenantId: "t1", planId: "p1", approvedById: "u1" }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.shiftCapacity.deleteMany).not.toHaveBeenCalled();
    expect(prisma.shiftCapacity.createMany).not.toHaveBeenCalled();
  });
});

describe("updateShiftPlanEntries", () => {
  beforeEach(() => {
    resetAllMocks();
    attachPlanDelegates();
    prisma.$transaction.mockImplementation(async (ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(prisma),
    );
  });

  it("refuses to edit a plan that has already been approved", async () => {
    prisma.shiftPlan.findFirst.mockResolvedValue({ id: "p1", status: "APPROVED" });
    await expect(
      updateShiftPlanEntries({
        tenantId: "t1",
        planId: "p1",
        entries: [{ zoneId: "z1", dayOfWeek: 0, startTime: "10:00", approvedDrivers: 2 }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses a cover figure outside the sane range", async () => {
    prisma.shiftPlan.findFirst.mockResolvedValue({ id: "p1", status: "DRAFT" });
    await expect(
      updateShiftPlanEntries({
        tenantId: "t1",
        planId: "p1",
        entries: [
          { zoneId: "z1", dayOfWeek: 0, startTime: "10:00", approvedDrivers: MAX_COVER + 1 },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.shiftPlanEntry.updateMany).not.toHaveBeenCalled();
  });
});
