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
          // An entry from before revision 24 carries no length and lands as
          // the three-hour window it always was.
          { tenantId: "t1", zoneId: "z1", dayOfWeek: 0, startTime: "10:00", durationMinutes: 180, maxDrivers: 5 },
          // 0 is a real answer and closes the window; it is not dropped.
          { tenantId: "t1", zoneId: "z1", dayOfWeek: 0, startTime: "13:00", durationMinutes: 180, maxDrivers: 0 },
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
      { tenantId: "t1", zoneId: "z1", dayOfWeek: 0, startTime: "10:00", durationMinutes: 180, maxDrivers: 2 },
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
    // The proposal is replaced wholesale. With no history every hour needs
    // the floor of one driver, which tiles as six four-hour slots a day.
    expect(prisma.shiftPlanEntry.deleteMany).toHaveBeenCalledWith({ where: { planId: "p1" } });
    expect(prisma.shiftPlanEntry.createMany.mock.calls[0][0].data).toHaveLength(42);
    // Drivers keep booking against the last approved grid until the new draft is approved.
    expect(prisma.shiftCapacity.deleteMany).not.toHaveBeenCalled();
    expect(prisma.shiftCapacity.createMany).not.toHaveBeenCalled();
  });
});

describe("generateShiftPlan in 2, 3 and 4-hour slots aimed at the peaks", () => {
  // Revision 24 (#3): "Shifts must be either 2, 3, or 4-hour slots ... the
  // system should optimize the shifts to handle the peak hours, so more
  // drivers would be online at these times." The proposal used to size two
  // fixed 12-hour duties for their busiest window, which put the same number
  // of drivers on at 04:00 as at the lunch peak.
  beforeEach(() => {
    resetAllMocks();
    attachPlanDelegates();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.shiftPlan.findFirst.mockResolvedValue(null);
    (prisma as any).shiftPlan.create = jest.fn().mockResolvedValue({ id: "p2", status: "DRAFT" });
    prisma.deliveryZone.findMany.mockResolvedValue([{ id: "z1", code: "Z1", name: "Zone" }]);
    // Sunday lunch in Kuwait, 12:00 to 14:59, over four weeks: 64 orders an
    // hour-week across three hours, i.e. 16 a week each hour, eight drivers'
    // worth at two an hour. Stamped in +03:00 so the test means the same thing
    // on any machine.
    const lunch: any[] = [];
    for (const hour of ["12", "13", "14"]) {
      for (let i = 0; i < 64; i++) {
        lunch.push({
          pickupZoneId: "z1",
          deliveredAt: new Date(`2026-09-13T${hour}:15:00+03:00`),
          driverId: ["d-a", "d-b", "d-c"][i % 3],
        });
      }
    }
    prisma.deliveryOrder.findMany.mockResolvedValue(lunch);
    prisma.driver.findMany.mockResolvedValue(
      ["d-a", "d-b", "d-c", "d-d", "d-e", "d-f", "d-g", "d-h", "d-i", "d-j"].map((id) => ({
        id,
        assignedZoneId: "z1",
      })),
    );
    prisma.shiftPlanEntry.createMany.mockResolvedValue({ count: 1 });
  });

  type Row = {
    dayOfWeek: number;
    startTime: string;
    durationMinutes: number;
    proposedDrivers: number;
    approvedDrivers: number;
    suggestedDriverIds: string[];
  };
  async function generate() {
    const result = await generateShiftPlan({ tenantId: "t1", weekStart: new Date("2026-09-20T00:00:00") });
    const data = (prisma as any).shiftPlanEntry.createMany.mock.calls[0][0].data as Row[];
    return { data, basis: result.basis as any };
  }
  function cover(rows: Row[], day: number): number[] {
    const out = Array.from({ length: 24 }, () => 0);
    for (const r of rows.filter((x) => x.dayOfWeek === day)) {
      const h = Number(r.startTime.slice(0, 2));
      for (let j = h; j < h + r.durationMinutes / 60 && j < 24; j++) out[j] += r.proposedDrivers;
    }
    return out;
  }

  it("only ever proposes 2, 3 or 4-hour slots, starting on the hour", async () => {
    const { data } = await generate();
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((r) => [120, 180, 240].includes(r.durationMinutes))).toBe(true);
    expect(data.every((r) => /^\d{2}:00$/.test(r.startTime))).toBe(true);
  });

  it("puts more drivers on at the lunch peak than in the small hours", async () => {
    const { data } = await generate();
    const sunday = cover(data, 0);
    expect(sunday[13]).toBeGreaterThanOrEqual(8);
    expect(sunday[4]).toBe(1);
    // Not the same number spread over the day: the peak is staffed on its own.
    expect(sunday[13]).toBeGreaterThan(sunday[9]!);
    expect(sunday[13]).toBeGreaterThan(sunday[17]!);
  });

  it("covers every hour of every day, so no area is ever dark", async () => {
    const { data } = await generate();
    for (let day = 0; day < 7; day++) {
      expect(cover(data, day).every((n) => n >= 1)).toBe(true);
    }
  });

  it("buckets demand in Kuwait time and keeps the curve on the plan for the screen", async () => {
    const { basis } = await generate();
    expect(basis.demandByHour.z1[0][13]).toBe(16);
    expect(basis.needByHour.z1[0][13]).toBe(8);
    expect(basis.needByHour.z1[0][4]).toBe(1);
    expect(basis.ordersPerDriverPerHour).toBe(2);
  });

  it("suggests drivers as stacked duties: no overlaps and nobody past 12 hours", async () => {
    const { data } = await generate();
    const sunday = data.filter((r) => r.dayOfWeek === 0);
    const byDriver = new Map<string, Array<[number, number]>>();
    for (const r of sunday) {
      const h = Number(r.startTime.slice(0, 2));
      for (const id of r.suggestedDriverIds) {
        byDriver.set(id, [...(byDriver.get(id) ?? []), [h, h + r.durationMinutes / 60]]);
      }
    }
    for (const spans of byDriver.values()) {
      const hours = spans.reduce((sum, [a, b]) => sum + (b - a), 0);
      expect(hours).toBeLessThanOrEqual(12);
      const sorted = [...spans].sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]![0]).toBeGreaterThanOrEqual(sorted[i - 1]![1]);
    }
  });
});

describe("updateShiftPlanEntries with slots", () => {
  beforeEach(() => {
    resetAllMocks();
    attachPlanDelegates();
    (prisma as any).shiftPlanEntry.create = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.shiftPlan.findFirst.mockResolvedValue({ id: "p1", status: "DRAFT" });
  });

  it("adds a slot the planner typed in, with nothing proposed for it", async () => {
    prisma.shiftPlanEntry.updateMany.mockResolvedValue({ count: 0 });
    await updateShiftPlanEntries({
      tenantId: "t1",
      planId: "p1",
      entries: [{ zoneId: "z1", dayOfWeek: 5, startTime: "18:00", durationMinutes: 120, approvedDrivers: 3 }],
    });
    expect((prisma as any).shiftPlanEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        zoneId: "z1",
        dayOfWeek: 5,
        startTime: "18:00",
        durationMinutes: 120,
        proposedDrivers: 0,
        approvedDrivers: 3,
      }),
    });
  });

  it("removes a slot outright rather than leaving a zero behind", async () => {
    prisma.shiftPlanEntry.deleteMany.mockResolvedValue({ count: 1 });
    await updateShiftPlanEntries({
      tenantId: "t1",
      planId: "p1",
      entries: [{ zoneId: "z1", dayOfWeek: 5, startTime: "18:00", remove: true }],
    });
    expect(prisma.shiftPlanEntry.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ zoneId: "z1", dayOfWeek: 5, startTime: "18:00" }),
    });
    expect(prisma.shiftPlanEntry.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a slot length that is not 2, 3 or 4 hours", async () => {
    await expect(
      updateShiftPlanEntries({
        tenantId: "t1",
        planId: "p1",
        entries: [{ zoneId: "z1", dayOfWeek: 5, startTime: "18:00", durationMinutes: 300, approvedDrivers: 1 }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
