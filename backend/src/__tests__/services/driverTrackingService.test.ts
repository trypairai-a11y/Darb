/**
 * Revision 21 (#1) — the two columns the client asked for on Driver tracking.
 *
 * Rejections count offers DECLINED and EXPIRED, not just the button: a driver
 * who never presses Decline and lets the 15 seconds run out has refused the
 * order just the same. Violations are the fleet issues Darb's sweep raised
 * about the driver in the window, with the still-open ones counted beside.
 */
import { getMockPrisma, resetAllMocks } from "../setup";
import { driverTracking, setDriverOperationalState } from "../../services/driverTrackingService";

const prisma = getMockPrisma();

function attachDelegates() {
  const p = prisma as any;
  p.deliveryOrder = { ...(p.deliveryOrder ?? {}), groupBy: jest.fn(), findMany: jest.fn() };
  p.dispatchOffer = { ...(p.dispatchOffer ?? {}), groupBy: jest.fn() };
  p.orderRating = { ...(p.orderRating ?? {}), groupBy: jest.fn() };
  p.courierOnlineSession = { ...(p.courierOnlineSession ?? {}), findMany: jest.fn() };
  p.driverTrainingSession = { ...(p.driverTrainingSession ?? {}), findMany: jest.fn() };
  p.fleetIssue = { ...(p.fleetIssue ?? {}), groupBy: jest.fn() };
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
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1", inTraining: false });
    p.driver.updateMany.mockResolvedValue({ count: 1 });
    p.driver.findFirst.mockResolvedValueOnce({ id: "d1", name: "Anil", status: "TERMINATED" });

    await setDriverOperationalState({ tenantId: "t1", driverId: "d1", action: "TERMINATE" });

    expect(p.driver.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tenantId: "t1" },
      data: { status: "TERMINATED", inTraining: false },
    });
  });
});
