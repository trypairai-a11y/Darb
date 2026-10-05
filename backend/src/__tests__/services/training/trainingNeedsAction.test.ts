/**
 * Client note of 2026-10-05: the training tab "must show only the drivers that
 * are currently training and the ones that finished but still we did not take
 * an action on them". Every window ever run stayed on the list, so a driver
 * already terminated still sat there under "Did not pass".
 */
import { getMockPrisma, resetAllMocks } from "../../setup";
import { failedWindowAwaitsAction, listTrainingSessions } from "../../../services/training/driverTrainingService";

const prisma = getMockPrisma();

const created = new Date("2026-10-01T10:00:00Z");

function session(id: string, status: string, driver: { id: string; status: string; inTraining?: boolean }) {
  return {
    id,
    status,
    createdAt: created,
    scorecard: null,
    driver: { inTraining: false, ...driver },
  };
}

describe("failedWindowAwaitsAction", () => {
  it("keeps a failed window nobody has acted on", () => {
    expect(failedWindowAwaitsAction({ createdAt: created, driver: { status: "INACTIVE", inTraining: false } }, created)).toBe(true);
  });
  it("drops it once the driver is terminated", () => {
    expect(failedWindowAwaitsAction({ createdAt: created, driver: { status: "TERMINATED", inTraining: false } }, created)).toBe(false);
  });
  it("drops it once the driver has been reactivated", () => {
    expect(failedWindowAwaitsAction({ createdAt: created, driver: { status: "ACTIVE", inTraining: false } }, created)).toBe(false);
  });
  it("drops it once a newer window exists for the driver", () => {
    const later = new Date(created.getTime() + 3_600_000);
    expect(failedWindowAwaitsAction({ createdAt: created, driver: { status: "INACTIVE", inTraining: false } }, later)).toBe(false);
  });
});

describe("listTrainingSessions needsAction", () => {
  beforeEach(() => {
    resetAllMocks();
    (prisma as any).driverTrainingSession = {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    };
  });

  it("asks only for live and failed windows, and filters out the decided failures", async () => {
    (prisma as any).driverTrainingSession.findMany.mockResolvedValue([
      session("s-failed-open", "FAILED", { id: "d1", status: "INACTIVE" }),
      session("s-failed-terminated", "FAILED", { id: "d2", status: "TERMINATED" }),
    ]);
    (prisma as any).driverTrainingSession.groupBy.mockResolvedValue([
      { driverId: "d1", _max: { createdAt: created } },
      { driverId: "d2", _max: { createdAt: created } },
    ]);

    const out = await listTrainingSessions({ tenantId: "t1", needsAction: true });

    expect((prisma as any).driverTrainingSession.findMany.mock.calls[0][0].where.status).toEqual({
      in: ["SCHEDULED", "IN_PROGRESS", "FAILED"],
    });
    expect(out.map((s) => s.id)).toEqual(["s-failed-open"]);
  });
});
