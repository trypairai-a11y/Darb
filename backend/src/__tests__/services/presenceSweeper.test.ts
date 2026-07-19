/**
 * Darb 2.0 presence sweeper (plan §A10) — unit tests.
 *
 * Contract: every sweep, CourierOnlineSession rows with availability !=
 * "OFFLINE" AND lastGpsAt older than 5 minutes are forced OFFLINE
 * (availability "OFFLINE", isOnline false) and a `driver.offline` event is
 * published on the session's tenant channel. Sessions with lastGpsAt=null
 * are intentionally NOT swept (fresh toggles that haven't uploaded a fix
 * yet; dispatch excludes them via its own freshness check).
 */
import { prisma } from "../mocks/config";
import { publishEvent } from "../../services/eventBus";
import { sweepStalePresence } from "../../services/gpsMonitorService";

jest.mock("../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

const mockedPublish = publishEvent as jest.Mock;
const sessionModel = prisma.courierOnlineSession as unknown as {
  findMany: jest.Mock;
  updateMany: jest.Mock;
};

describe("sweepStalePresence", () => {
  const NOW = new Date("2026-07-19T12:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    sessionModel.updateMany.mockResolvedValue({ count: 0 });
  });

  test("queries only non-OFFLINE sessions with GPS older than 5 minutes", async () => {
    sessionModel.findMany.mockResolvedValue([]);

    await sweepStalePresence(NOW);

    expect(sessionModel.findMany).toHaveBeenCalledTimes(1);
    const where = sessionModel.findMany.mock.calls[0][0].where;
    expect(where.availability).toEqual({ not: "OFFLINE" });
    expect(where.lastGpsAt).toEqual({ lt: new Date(NOW.getTime() - 5 * 60 * 1000) });
  });

  test("no stale sessions → no writes, no events, returns 0", async () => {
    sessionModel.findMany.mockResolvedValue([]);

    const swept = await sweepStalePresence(NOW);

    expect(swept).toBe(0);
    expect(sessionModel.updateMany).not.toHaveBeenCalled();
    expect(mockedPublish).not.toHaveBeenCalled();
  });

  test("stale sessions are forced OFFLINE and driver.offline is published per driver", async () => {
    const staleAt = new Date(NOW.getTime() - 10 * 60 * 1000);
    sessionModel.findMany.mockResolvedValue([
      { id: "sess-1", tenantId: "tenA", driverId: "drv-1", lastGpsAt: staleAt },
      { id: "sess-2", tenantId: "tenB", driverId: "drv-2", lastGpsAt: staleAt },
    ]);
    sessionModel.updateMany.mockResolvedValue({ count: 2 });

    const swept = await sweepStalePresence(NOW);

    expect(swept).toBe(2);
    expect(sessionModel.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["sess-1", "sess-2"] } },
      data: { availability: "OFFLINE", isOnline: false },
    });

    expect(mockedPublish).toHaveBeenCalledTimes(2);
    const events = mockedPublish.mock.calls.map((c) => c[0]);
    expect(events[0]).toMatchObject({
      type: "driver.offline",
      tenantId: "tenA",
      payload: { driverId: "drv-1", reason: "GPS_STALE" },
    });
    expect(events[1]).toMatchObject({
      type: "driver.offline",
      tenantId: "tenB",
      payload: { driverId: "drv-2", reason: "GPS_STALE" },
    });
  });

  test("publish failure does not abort the sweep", async () => {
    const staleAt = new Date(NOW.getTime() - 6 * 60 * 1000);
    sessionModel.findMany.mockResolvedValue([
      { id: "sess-1", tenantId: "tenA", driverId: "drv-1", lastGpsAt: staleAt },
    ]);
    sessionModel.updateMany.mockResolvedValue({ count: 1 });
    mockedPublish.mockRejectedValueOnce(new Error("redis down"));

    await expect(sweepStalePresence(NOW)).resolves.toBe(1);
    expect(sessionModel.updateMany).toHaveBeenCalledTimes(1);
  });
});
