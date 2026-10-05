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
  generateShiftPlan,
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
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirstOrThrow: jest.fn(),
  };
  p.shiftPlanEntry = {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  };
  p.deliveryZone = { findMany: jest.fn() };
  p.deliveryOrder = { findMany: jest.fn() };
  p.driver = { findMany: jest.fn() };
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

  it("amends an approved plan AND rewrites the capacity grid in the same transaction", async () => {
    // Revision 21b: "must give the option to adjust the plan after approving".
    prisma.shiftPlan.findFirst.mockResolvedValue({ id: "p1", status: "APPROVED" });
    prisma.shiftPlanEntry.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftPlanEntry.findMany.mockResolvedValue([
      { zoneId: "z1", dayOfWeek: 0, startTime: "10:00", approvedDrivers: 2 },
    ]);
    prisma.shiftCapacity.deleteMany.mockResolvedValue({ count: 1 });
    prisma.shiftCapacity.createMany.mockResolvedValue({ count: 1 });

    await updateShiftPlanEntries({
      tenantId: "t1",
      planId: "p1",
      entries: [{ zoneId: "z1", dayOfWeek: 0, startTime: "10:00", approvedDrivers: 2 }],
    });

    expect(prisma.shiftPlanEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.shiftCapacity.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "t1" } });
    expect(prisma.shiftCapacity.createMany.mock.calls[0][0].data).toEqual([
      { tenantId: "t1", zoneId: "z1", dayOfWeek: 0, startTime: "10:00", maxDrivers: 2 },
    ]);
  });

  it("edits a draft without touching the capacity grid", async () => {
    prisma.shiftPlan.findFirst.mockResolvedValue({ id: "p1", status: "DRAFT" });
    prisma.shiftPlanEntry.updateMany.mockResolvedValue({ count: 1 });

    await updateShiftPlanEntries({
      tenantId: "t1",
      planId: "p1",
      entries: [{ zoneId: "z1", dayOfWeek: 0, startTime: "10:00", approvedDrivers: 2 }],
    });

    expect(prisma.shiftCapacity.deleteMany).not.toHaveBeenCalled();
    expect(prisma.shiftCapacity.createMany).not.toHaveBeenCalled();
  });

  it("refuses to edit a discarded plan", async () => {
    prisma.shiftPlan.findFirst.mockResolvedValue({ id: "p1", status: "DISCARDED" });
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

describe("generateShiftPlan on an approved week", () => {
  // Revision 21c: "still I can't change the plan, need to be able to reset
  // the plan". Build it again used to answer 409 on an approved week with no
  // way through; now it goes through behind an explicit flag, and what the
  // flag must NOT do is touch the grid the driver app books against.
  beforeEach(() => {
    resetAllMocks();
    attachPlanDelegates();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.shiftPlan.findFirst.mockResolvedValue({ id: "p1", status: "APPROVED" });
    prisma.deliveryZone.findMany.mockResolvedValue([{ id: "z1", code: "Z1", name: "Zone" }]);
    prisma.deliveryOrder.findMany.mockResolvedValue([]);
    prisma.driver.findMany.mockResolvedValue([]);
    prisma.shiftPlanEntry.deleteMany.mockResolvedValue({ count: 56 });
    prisma.shiftPlanEntry.createMany.mockResolvedValue({ count: 56 });
    prisma.shiftPlan.update.mockResolvedValue({ id: "p1", status: "DRAFT" });
  });

  it("still refuses without the flag, so a stale client cannot un-approve a week", async () => {
    await expect(
      generateShiftPlan({ tenantId: "t1", weekStart: new Date("2026-09-20T00:00:00") }),
    ).rejects.toMatchObject({ statusCode: 409, code: "WEEK_APPROVED" });
    expect(prisma.shiftPlan.update).not.toHaveBeenCalled();
    expect(prisma.shiftPlanEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("rebuilds as a DRAFT with the approval cleared, and leaves the capacity grid alone", async () => {
    const result = await generateShiftPlan({
      tenantId: "t1",
      weekStart: new Date("2026-09-20T00:00:00"),
      replaceApproved: true,
    });

    expect(result.planId).toBe("p1");
    expect(prisma.shiftPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ status: "DRAFT", approvedAt: null, approvedById: null }),
      }),
    );
    // The proposal is replaced wholesale, one zone times seven days times eight windows.
    expect(prisma.shiftPlanEntry.deleteMany).toHaveBeenCalledWith({ where: { planId: "p1" } });
    expect(prisma.shiftPlanEntry.createMany.mock.calls[0][0].data).toHaveLength(56);
    // Drivers keep booking against the last approved grid until the new draft is approved.
    expect(prisma.shiftCapacity.deleteMany).not.toHaveBeenCalled();
    expect(prisma.shiftCapacity.createMany).not.toHaveBeenCalled();
  });
});

describe("generateShiftPlan in 12-hour duties", () => {
  // Client note of 2026-10-05: "the drivers are working 12 hours per day ...
  // we are trying to put enough drivers 24/7, it is managing the timing of
  // duty". The proposal used to size every three-hour window on its own, so
  // cover rose and fell all day and no 12-hour roster could staff it.
  beforeEach(() => {
    resetAllMocks();
    attachPlanDelegates();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.shiftPlan.findFirst.mockResolvedValue(null);
    (prisma as any).shiftPlan.create = jest.fn().mockResolvedValue({ id: "p2", status: "DRAFT" });
    prisma.deliveryZone.findMany.mockResolvedValue([{ id: "z1", code: "Z1", name: "Zone" }]);
    // 48 deliveries in the Sunday 10:00 window over four weeks: 12 a week,
    // two drivers' worth at six an hour-window.
    prisma.deliveryOrder.findMany.mockResolvedValue(
      Array.from({ length: 48 }, (_, i) => ({
        pickupZoneId: "z1",
        deliveredAt: new Date("2026-09-13T11:00:00"),
        driverId: i % 2 === 0 ? "d-a" : "d-b",
      })),
    );
    prisma.driver.findMany.mockResolvedValue([
      { id: "d-a", assignedZoneId: "z1" },
      { id: "d-b", assignedZoneId: "z1" },
      { id: "d-c", assignedZoneId: "z1" },
    ]);
    prisma.shiftPlanEntry.createMany.mockResolvedValue({ count: 56 });
  });

  async function rows() {
    await generateShiftPlan({ tenantId: "t1", weekStart: new Date("2026-09-20T00:00:00") });
    return (prisma as any).shiftPlanEntry.createMany.mock.calls[0][0].data as Array<{
      dayOfWeek: number;
      startTime: string;
      proposedDrivers: number;
      suggestedDriverIds: string[];
    }>;
  }

  it("holds the busiest window's cover across the whole day duty", async () => {
    const data = await rows();
    const sundayDay = data.filter(
      (r) => r.dayOfWeek === 0 && ["07:00", "10:00", "13:00", "16:00"].includes(r.startTime),
    );
    expect(sundayDay.map((r) => r.proposedDrivers)).toEqual([2, 2, 2, 2]);
  });

  it("covers every window of every day exactly once, so the area is never dark", async () => {
    const data = await rows();
    expect(data).toHaveLength(56);
    expect(new Set(data.map((r) => `${r.dayOfWeek}|${r.startTime}`)).size).toBe(56);
    expect(data.every((r) => r.proposedDrivers >= 1)).toBe(true);
  });

  it("runs Sunday's night duty into Monday's 01:00 and 04:00 windows", async () => {
    const data = await rows();
    const sundayNight = data.filter(
      (r) =>
        (r.dayOfWeek === 0 && ["19:00", "22:00"].includes(r.startTime)) ||
        (r.dayOfWeek === 1 && ["01:00", "04:00"].includes(r.startTime)),
    );
    expect(sundayNight).toHaveLength(4);
    const ids = new Set(sundayNight.map((r) => r.suggestedDriverIds.join(",")));
    expect(ids.size).toBe(1);
  });

  it("does not suggest the same driver for both duties of a day while someone else is free", async () => {
    const data = await rows();
    const day = data.find((r) => r.dayOfWeek === 0 && r.startTime === "07:00")!;
    const night = data.find((r) => r.dayOfWeek === 0 && r.startTime === "19:00")!;
    expect(day.suggestedDriverIds).toEqual(["d-a", "d-b"]);
    expect(night.suggestedDriverIds).toEqual(["d-c"]);
  });
});
