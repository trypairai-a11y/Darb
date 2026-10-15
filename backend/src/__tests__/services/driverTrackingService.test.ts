/**
 * Revision 21 (#1) — the two columns the client asked for on Driver tracking.
 *
 * Rejections count offers DECLINED and EXPIRED, not just the button: a driver
 * who never presses Decline and lets the 15 seconds run out has refused the
 * order just the same. Violations are the fleet issues Darb's sweep raised
 * about the driver in the window, with the still-open ones counted beside.
 */
import { getMockPrisma, resetAllMocks } from "../setup";
import {
  bulkSetDriverOperationalState,
  clearTerminatedDriver,
  driverTracking,
  setDriverOperationalState,
} from "../../services/driverTrackingService";

jest.mock("../../services/training/driverTrainingService", () => ({
  createTrainingSession: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createTrainingSession } = require("../../services/training/driverTrainingService");

const prisma = getMockPrisma();

function attachDelegates() {
  const p = prisma as any;
  p.deliveryOrder = { ...(p.deliveryOrder ?? {}), groupBy: jest.fn(), findMany: jest.fn() };
  p.dispatchOffer = { ...(p.dispatchOffer ?? {}), groupBy: jest.fn() };
  p.orderRating = { ...(p.orderRating ?? {}), groupBy: jest.fn() };
  p.courierOnlineSession = { ...(p.courierOnlineSession ?? {}), findMany: jest.fn() };
  p.driverTrainingSession = { ...(p.driverTrainingSession ?? {}), findMany: jest.fn() };
  p.fleetIssue = { ...(p.fleetIssue ?? {}), groupBy: jest.fn() };
  p.auditLog = { create: jest.fn().mockResolvedValue({}) };
  p.platformInventory = { findFirst: jest.fn(), update: jest.fn() };
  p.driverInventory = { ...(p.driverInventory ?? {}), findMany: jest.fn(), update: jest.fn() };
}

beforeEach(() => {
  resetAllMocks();
  attachDelegates();
  const p = prisma as any;
  p.driver.findMany.mockResolvedValue([
    {
      id: "d1",
      name: "Anil",
      driverCode: "DRB-1",
      phone: null,
      status: "ACTIVE",
      isFrozen: false,
      inTraining: false,
      complianceFreezeReason: null,
      vehicleType: null,
      fleetPartnerId: "f1",
      fleetPartner: { id: "f1", name: "Sidra" },
      assignedZoneId: null,
      assignedZone: null,
    },
  ]);
  p.deliveryOrder.groupBy.mockResolvedValue([]);
  p.deliveryOrder.findMany.mockResolvedValue([]);
  p.orderRating.groupBy.mockResolvedValue([]);
  p.courierOnlineSession.findMany.mockResolvedValue([]);
  p.driverTrainingSession.findMany.mockResolvedValue([]);
});

describe("driverTracking rejections and violations", () => {
  it("counts declined AND expired offers as rejections, and keeps declined apart", async () => {
    const p = prisma as any;
    p.dispatchOffer.groupBy.mockResolvedValue([
      { driverId: "d1", status: "ACCEPTED", _count: { _all: 6 } },
      { driverId: "d1", status: "DECLINED", _count: { _all: 2 } },
      { driverId: "d1", status: "EXPIRED", _count: { _all: 3 } },
    ]);
    p.fleetIssue.groupBy.mockResolvedValue([]);

    const { rows } = await driverTracking({ tenantId: "t1" });

    expect(rows[0]).toMatchObject({ rejections: 5, declined: 2, violations: 0, violationsOpen: 0 });
    // Acceptance is over every offer, so the two numbers agree with each other.
    expect(rows[0]!.acceptanceRate).toBeCloseTo(6 / 11);
  });

  it("counts every issue raised in the window and the ones still open", async () => {
    const p = prisma as any;
    p.dispatchOffer.groupBy.mockResolvedValue([]);
    p.fleetIssue.groupBy.mockResolvedValue([
      { driverId: "d1", status: "OPEN", _count: { _all: 1 } },
      { driverId: "d1", status: "ESCALATED", _count: { _all: 1 } },
      { driverId: "d1", status: "RESOLVED", _count: { _all: 4 } },
    ]);

    const { rows } = await driverTracking({ tenantId: "t1" });

    expect(rows[0]).toMatchObject({ violations: 6, violationsOpen: 2, rejections: 0 });
  });
});

describe("setDriverOperationalState ACTIVATE while flagged in training", () => {
  // Revision 21c: "I deactivated the driver account but I can't activate it
  // again". The refusal is for an OPEN window only; a lapsed flag is cleared.
  it("refuses with IN_TRAINING while a window is open", async () => {
    const p = prisma as any;
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1", inTraining: true });
    p.driverTrainingSession.findFirst = jest.fn().mockResolvedValue({ id: "s1" });

    await expect(
      setDriverOperationalState({ tenantId: "t1", driverId: "d1", action: "ACTIVATE" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "IN_TRAINING" });
    expect(p.driver.updateMany).not.toHaveBeenCalled();
  });

  it("clears a lapsed flag and activates when no window is open", async () => {
    const p = prisma as any;
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1", inTraining: true });
    p.driverTrainingSession.findFirst = jest.fn().mockResolvedValue(null);
    p.driver.updateMany.mockResolvedValue({ count: 1 });
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1", name: "Anil", status: "ACTIVE" });

    await setDriverOperationalState({ tenantId: "t1", driverId: "d1", action: "ACTIVATE" });

    expect(p.driver.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tenantId: "t1" },
      data: expect.objectContaining({ status: "ACTIVE", inTraining: false, isFrozen: false }),
    });
  });
});

describe("setDriverOperationalState TERMINATE", () => {
  // Revision 21c: a trainee who did not pass can be let go from the training
  // screen. TERMINATED is what every roster and candidate pool already
  // excludes, and the training flag must come off with it.
  it("sets TERMINATED and clears inTraining, leaving the freeze untouched", async () => {
    const p = prisma as any;
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1", inTraining: false, status: "ACTIVE" });
    p.driver.updateMany.mockResolvedValue({ count: 1 });
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1", name: "Anil", status: "TERMINATED" });

    await setDriverOperationalState({ tenantId: "t1", driverId: "d1", action: "TERMINATE", actorUserId: "u1" });

    // Revision 24 #16: the first of two steps. Clearance pending, audited.
    expect(p.driver.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tenantId: "t1" },
      data: {
        status: "TERMINATED",
        inTraining: false,
        terminatedAt: expect.any(Date),
        terminationClearedAt: null,
        terminationClearedById: null,
        terminationClearanceNote: null,
      },
    });
    expect(p.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "DRIVER_TERMINATED", entityId: "d1", userId: "u1" }),
    });
  });

  it("does not restamp or re-audit a driver who is already terminated", async () => {
    const p = prisma as any;
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1", inTraining: false, status: "TERMINATED" });
    p.driver.updateMany.mockResolvedValue({ count: 1 });
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1" });

    await setDriverOperationalState({ tenantId: "t1", driverId: "d1", action: "TERMINATE" });

    expect(p.driver.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tenantId: "t1" },
      data: { status: "TERMINATED", inTraining: false },
    });
    expect(p.auditLog.create).not.toHaveBeenCalled();
  });

  it("taking a terminated driver back on clears the clearance record", async () => {
    const p = prisma as any;
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1", inTraining: false, status: "TERMINATED" });
    p.driver.updateMany.mockResolvedValue({ count: 1 });
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1" });

    await setDriverOperationalState({ tenantId: "t1", driverId: "d1", action: "ACTIVATE" });

    expect(p.driver.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tenantId: "t1" },
      data: expect.objectContaining({ status: "ACTIVE", terminatedAt: null, terminationClearedAt: null }),
    });
  });
});

describe("driverTracking terminationPending", () => {
  it("flags a terminated driver with no clearance", async () => {
    const p = prisma as any;
    p.driver.findMany.mockResolvedValue([
      { id: "d1", name: "A", status: "TERMINATED", terminationClearedAt: null },
      { id: "d2", name: "B", status: "TERMINATED", terminationClearedAt: new Date() },
      { id: "d3", name: "C", status: "ACTIVE", terminationClearedAt: null },
    ]);
    p.dispatchOffer.groupBy.mockResolvedValue([]);
    p.fleetIssue.groupBy.mockResolvedValue([]);

    const { rows } = await driverTracking({ tenantId: "t1", status: "TERMINATED" });

    expect(rows.map((r) => r.terminationPending)).toEqual([true, false, false]);
  });
});

describe("bulkSetDriverOperationalState (revision 24 #6)", () => {
  it("applies the verb to every driver and reports a refusal without stopping the batch", async () => {
    const p = prisma as any;
    p.driver.findMany.mockResolvedValue([
      { id: "d1", name: "Anil" },
      { id: "d2", name: "Badr" },
    ]);
    // d1: in training with an open window -> IN_TRAINING; d2: activates.
    p.driver.findFirst
      .mockResolvedValueOnce({ id: "d1", inTraining: true, status: "INACTIVE" })
      .mockResolvedValueOnce({ id: "d2", inTraining: false, status: "INACTIVE" })
      .mockResolvedValueOnce({ id: "d2", status: "ACTIVE" });
    p.driverTrainingSession.findFirst = jest.fn().mockResolvedValue({ id: "s1" });
    p.driver.updateMany.mockResolvedValue({ count: 1 });

    const out = await bulkSetDriverOperationalState({
      tenantId: "t1",
      driverIds: ["d1", "d2", "ghost"],
      action: "ACTIVATE",
    });

    expect(out.succeeded).toBe(1);
    expect(out.failed).toBe(2);
    expect(out.results).toEqual([
      expect.objectContaining({ driverId: "d1", ok: false, code: "IN_TRAINING" }),
      { driverId: "d2", name: "Badr", ok: true },
      expect.objectContaining({ driverId: "ghost", ok: false, code: "NOT_FOUND" }),
    ]);
    expect(p.driver.updateMany).toHaveBeenCalledTimes(1);
  });

  it("refuses a bulk freeze with no reason before touching anyone", async () => {
    const p = prisma as any;
    await expect(
      bulkSetDriverOperationalState({ tenantId: "t1", driverIds: ["d1"], action: "FREEZE" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(p.driver.updateMany).not.toHaveBeenCalled();
  });

  it("sends each selected driver to training through the training service", async () => {
    const p = prisma as any;
    p.driver.findMany.mockResolvedValue([{ id: "d1", name: "Anil" }, { id: "d2", name: "Badr" }]);
    (createTrainingSession as jest.Mock)
      .mockResolvedValueOnce({ id: "s1" })
      .mockRejectedValueOnce(Object.assign(new Error("That driver already has an open training window"), { statusCode: 409 }));

    const out = await bulkSetDriverOperationalState({
      tenantId: "t1",
      driverIds: ["d1", "d2"],
      action: "TRAIN",
      periodDays: 2,
      actorUserId: "u1",
    });

    expect(createTrainingSession).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", driverId: "d1", periodDays: 2, coachId: "u1" }),
    );
    expect(out).toMatchObject({ succeeded: 1, failed: 1 });
    expect(out.results[1]).toMatchObject({ driverId: "d2", ok: false });
  });
});

describe("clearTerminatedDriver (revision 24 #16)", () => {
  beforeEach(() => {
    const p = prisma as any;
    p.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(p));
  });

  it("marks every issued item returned, restocks the pool and audits", async () => {
    const p = prisma as any;
    p.driver.findFirst.mockResolvedValueOnce({
      id: "d1",
      status: "TERMINATED",
      terminatedAt: null,
      terminationClearedAt: null,
    });
    p.driver.updateMany.mockResolvedValue({ count: 1 });
    p.driverInventory.findMany.mockResolvedValue([
      { id: "i1", itemType: "BIG_BAG", quantity: 1 },
      { id: "i2", itemType: "HELMET", quantity: 2 },
    ]);
    p.platformInventory.findFirst
      .mockResolvedValueOnce({ id: "pool-bag", issued: 5 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "pool-helmet", issued: 1 });

    const out = await clearTerminatedDriver({ tenantId: "t1", driverId: "d1", actorUserId: "u1", note: " all back " });

    expect(p.driver.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tenantId: "t1", status: "TERMINATED", terminationClearedAt: null },
      data: expect.objectContaining({
        terminationClearedById: "u1",
        terminationClearanceNote: "all back",
        terminatedAt: expect.any(Date),
      }),
    });
    expect(p.driverInventory.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { issued: false, returnedDate: expect.any(Date) },
    });
    expect(p.platformInventory.update).toHaveBeenCalledWith({
      where: { id: "pool-bag" },
      data: { issued: 4, available: { increment: 1 } },
    });
    // Issued never goes negative.
    expect(p.platformInventory.update).toHaveBeenCalledWith({
      where: { id: "pool-helmet" },
      data: { issued: 0, available: { increment: 2 } },
    });
    expect(p.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "DRIVER_TERMINATION_CLEARED", entityId: "d1" }),
    });
    expect(out.returned).toEqual([
      { itemType: "BIG_BAG", quantity: 1 },
      { itemType: "HELMET", quantity: 2 },
    ]);
    // One CLEARED line per item on the driver's equipment log.
    expect(p.driverEquipmentEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ driverId: "d1", itemType: "BIG_BAG", action: "CLEARED", quantity: 1, note: "all back", actorUserId: "u1" }),
        expect.objectContaining({ driverId: "d1", itemType: "HELMET", action: "CLEARED", quantity: 2 }),
      ],
    });
  });

  it("refuses a driver who is not terminated", async () => {
    const p = prisma as any;
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1", status: "ACTIVE", terminationClearedAt: null });
    await expect(
      clearTerminatedDriver({ tenantId: "t1", driverId: "d1", actorUserId: "u1" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "NOT_TERMINATED" });
  });

  it("answers 409 when somebody else cleared the driver first", async () => {
    const p = prisma as any;
    p.driver.findFirst.mockResolvedValueOnce({
      id: "d1",
      status: "TERMINATED",
      terminatedAt: new Date(),
      terminationClearedAt: null,
    });
    p.driver.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      clearTerminatedDriver({ tenantId: "t1", driverId: "d1", actorUserId: "u1" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_CLEARED" });
    expect(p.driverInventory.update).not.toHaveBeenCalled();
  });
});
