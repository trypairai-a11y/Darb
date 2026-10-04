/**
 * Revision 20 — driver training.
 *
 * The tests that earn their place here are the two decisions that cost
 * something if they are ever quietly undone:
 *
 *   1. Closing a window resolves what it does to the DRIVER. Passing activates
 *      the account and clears `inTraining`; failing clears the flag but leaves
 *      them INACTIVE. A driver left with `inTraining` set and status ACTIVE
 *      reads as working on every screen and is skipped by dispatch forever.
 *   2. The scorecard is SNAPSHOTTED at completion. Practice orders can still be
 *      cancelled afterwards, and a verdict that recomputed itself would stop
 *      matching the numbers the coach actually saw.
 */
import { getMockPrisma, resetAllMocks } from "../../setup";
import {
  completeTrainingSession,
  createTrainingSession,
  trainingScorecard,
  MAX_PERIOD_DAYS,
} from "../../../services/training/driverTrainingService";

const prisma = getMockPrisma();

/**
 * Per-suite delegates. Deliberately not in __tests__/mocks/config.ts: a partial
 * entry in the shared stub shadows the richer delegate other suites attach for
 * themselves, which that file's own comment records as having broken
 * vendors.test.ts. `deliveryOrder` is restored to whatever the stub had after
 * each test for the same reason.
 */
function attachTrainingDelegates() {
  const p = prisma as any;
  p.driverTrainingSession = {
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    findFirstOrThrow: jest.fn(),
  };
  p.deliveryOrder = { ...(p.deliveryOrder ?? {}), findMany: jest.fn() };
}

beforeEach(() => {
  resetAllMocks();
  attachTrainingDelegates();
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
});

describe("createTrainingSession", () => {
  it("refuses a second open window for the same driver", async () => {
    prisma.driver.findFirst.mockResolvedValue({ id: "d1", name: "Anil", status: "INACTIVE" });
    prisma.driverTrainingSession.findFirst.mockResolvedValue({ id: "existing" });

    await expect(
      createTrainingSession({ tenantId: "t1", driverId: "d1", periodDays: 1 }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.driverTrainingSession.create).not.toHaveBeenCalled();
  });

  it("refuses a period outside the sane range", async () => {
    await expect(
      createTrainingSession({ tenantId: "t1", driverId: "d1", periodDays: MAX_PERIOD_DAYS + 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      createTrainingSession({ tenantId: "t1", driverId: "d1", periodDays: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("sets inTraining when the window is BOOKED, not when it starts", async () => {
    // A driver scheduled for tomorrow must not win a real order tonight and be
    // mid-delivery when the coach arrives.
    prisma.driver.findFirst.mockResolvedValue({ id: "d1", name: "Anil", status: "INACTIVE" });
    prisma.driverTrainingSession.findFirst.mockResolvedValue(null);
    prisma.driverTrainingSession.create.mockResolvedValue({ id: "s1" });
    prisma.driver.update.mockResolvedValue({});

    const tomorrow = new Date(Date.now() + 86_400_000);
    await createTrainingSession({
      tenantId: "t1",
      driverId: "d1",
      periodDays: 2,
      startsAt: tomorrow,
    });

    expect(prisma.driver.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { inTraining: true },
    });
    const created = prisma.driverTrainingSession.create.mock.calls[0][0].data;
    expect(created.status).toBe("SCHEDULED");
    // endsAt is always startsAt + periodDays.
    expect(created.endsAt.getTime() - created.startsAt.getTime()).toBe(2 * 86_400_000);
  });
});

describe("trainingScorecard", () => {
  it("reads only this window's practice orders", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([]);
    await trainingScorecard("t1", "s1");
    expect(prisma.deliveryOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", trainingSessionId: "s1", isTraining: true },
      }),
    );
  });

  it("scores on-time against the SLA and leaves nothing-delivered as null", async () => {
    const assignedAt = new Date("2026-09-15T10:00:00.000Z");
    prisma.deliveryOrder.findMany.mockResolvedValue([
      {
        status: "DELIVERED",
        assignedAt,
        deliveredAt: new Date("2026-09-15T10:30:00.000Z"),
        slaDeadline: new Date("2026-09-15T10:45:00.000Z"),
        proofPhotoUrl: "k",
      },
      {
        status: "DELIVERED",
        assignedAt,
        deliveredAt: new Date("2026-09-15T11:30:00.000Z"),
        slaDeadline: new Date("2026-09-15T10:45:00.000Z"),
        proofPhotoUrl: null,
      },
      { status: "FAILED", assignedAt, deliveredAt: null, slaDeadline: null, proofPhotoUrl: null },
      { status: "ASSIGNED", assignedAt, deliveredAt: null, slaDeadline: null, proofPhotoUrl: null },
    ]);

    const card = await trainingScorecard("t1", "s1");
    expect(card.assigned).toBe(4);
    expect(card.delivered).toBe(2);
    expect(card.failed).toBe(1);
    expect(card.inFlight).toBe(1);
    expect(card.onTimeRate).toBe(0.5);
    expect(card.podRate).toBe(0.5);
    expect(card.avgMinutes).toBe(60); // 30 and 90
  });

  it("returns null rates rather than zero when nothing was delivered", async () => {
    // A new joiner with no deliveries must not read as 0% on time, which is a
    // judgement the data does not support.
    prisma.deliveryOrder.findMany.mockResolvedValue([
      { status: "ASSIGNED", assignedAt: new Date(), deliveredAt: null, slaDeadline: null, proofPhotoUrl: null },
    ]);
    const card = await trainingScorecard("t1", "s1");
    expect(card.onTimeRate).toBeNull();
    expect(card.avgMinutes).toBeNull();
    expect(card.podRate).toBeNull();
  });
});

describe("completeTrainingSession", () => {
  beforeEach(() => {
    prisma.deliveryOrder.findMany.mockResolvedValue([]);
    prisma.driverTrainingSession.findFirstOrThrow.mockResolvedValue({
      id: "s1",
      driverId: "d1",
    });
    prisma.driver.update.mockResolvedValue({});
  });

  it("PASSED activates the driver and clears the training flag", async () => {
    prisma.driverTrainingSession.updateMany.mockResolvedValue({ count: 1 });

    await completeTrainingSession({ tenantId: "t1", sessionId: "s1", outcome: "PASSED" });

    expect(prisma.driver.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { inTraining: false, status: "ACTIVE" },
    });
  });

  it("FAILED clears the flag but leaves the driver inactive", async () => {
    // A trainee who is neither in training nor active is a driver nobody is
    // responsible for, which is why the flag is always cleared.
    prisma.driverTrainingSession.updateMany.mockResolvedValue({ count: 1 });

    await completeTrainingSession({ tenantId: "t1", sessionId: "s1", outcome: "FAILED" });

    expect(prisma.driver.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { inTraining: false, status: "INACTIVE" },
    });
  });

  it("snapshots the scorecard onto the session", async () => {
    prisma.driverTrainingSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.deliveryOrder.findMany.mockResolvedValue([
      {
        status: "DELIVERED",
        assignedAt: new Date("2026-09-15T10:00:00.000Z"),
        deliveredAt: new Date("2026-09-15T10:20:00.000Z"),
        slaDeadline: new Date("2026-09-15T10:45:00.000Z"),
        proofPhotoUrl: "k",
      },
    ]);

    await completeTrainingSession({ tenantId: "t1", sessionId: "s1", outcome: "PASSED" });

    const written = prisma.driverTrainingSession.updateMany.mock.calls[0][0].data;
    expect(written.scorecard).toMatchObject({ assigned: 1, delivered: 1, onTimeRate: 1 });
    expect(written.completedAt).toBeInstanceOf(Date);
  });

  it("refuses a window that has already closed, and touches no driver", async () => {
    prisma.driverTrainingSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      completeTrainingSession({ tenantId: "t1", sessionId: "s1", outcome: "PASSED" }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.driver.update).not.toHaveBeenCalled();
  });
});

// ─── Revision 21 (#3): keeping the trainee busy ─────────────────────────────
//
// "orders should be sent automatically, with the option to send manual orders,
// keep the driver busy". The one property worth locking down is idempotence
// on what is in flight: the order ending, the minute sweep and a coach's click
// can all fire within the same second, and the trainee must get ONE order.

import { autoIssuePracticeOrder } from "../../../services/training/driverTrainingService";

describe("autoIssuePracticeOrder", () => {
  const running = {
    id: "s1",
    status: "IN_PROGRESS",
    autoIssue: true,
    endsAt: new Date(Date.now() + 86_400_000),
    driver: { id: "d1", assignedZoneId: "z1" },
  };

  function attachAutoIssueDelegates() {
    const p = prisma as any;
    p.deliveryOrder = {
      ...(p.deliveryOrder ?? {}),
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    };
    p.vendorBranch = { ...(p.vendorBranch ?? {}), findMany: jest.fn() };
  }

  beforeEach(attachAutoIssueDelegates);

  it("does nothing while a practice order is still in the trainee's hands", async () => {
    prisma.driverTrainingSession.findFirst.mockResolvedValue(running);
    (prisma as any).deliveryOrder.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    (prisma as any).deliveryOrder.findFirst.mockResolvedValue(null);

    const r = await autoIssuePracticeOrder("t1", "s1");

    expect(r).toEqual({ issued: null, reason: "IN_FLIGHT" });
    expect((prisma as any).vendorBranch.findMany).not.toHaveBeenCalled();
  });

  it("does nothing when the switch is off, or the window is over", async () => {
    prisma.driverTrainingSession.findFirst.mockResolvedValueOnce({ ...running, autoIssue: false });
    expect(await autoIssuePracticeOrder("t1", "s1")).toMatchObject({ reason: "AUTO_OFF" });

    prisma.driverTrainingSession.findFirst.mockResolvedValueOnce({
      ...running,
      endsAt: new Date(Date.now() - 1000),
    });
    expect(await autoIssuePracticeOrder("t1", "s1")).toMatchObject({ reason: "WINDOW_OVER" });
  });

  it("waits a minute between two orders, so a failing app cannot loop", async () => {
    prisma.driverTrainingSession.findFirst.mockResolvedValue(running);
    (prisma as any).deliveryOrder.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    (prisma as any).deliveryOrder.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 5_000),
      branchId: "b1",
    });

    expect(await autoIssuePracticeOrder("t1", "s1")).toMatchObject({ reason: "TOO_SOON" });
  });

  it("reports when the network has no branch with coordinates to collect from", async () => {
    prisma.driverTrainingSession.findFirst.mockResolvedValue(running);
    (prisma as any).deliveryOrder.count.mockResolvedValue(0);
    (prisma as any).deliveryOrder.findFirst.mockResolvedValue(null);
    (prisma as any).vendorBranch.findMany.mockResolvedValue([]);

    expect(await autoIssuePracticeOrder("t1", "s1")).toMatchObject({ reason: "NO_PICKUP_POINTS" });
  });
});
