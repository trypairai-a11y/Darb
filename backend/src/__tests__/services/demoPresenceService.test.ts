// Demo presence upkeep — the fixture-breathing pass the dispatch sweep calls.
//
// The whole point of these tests is the guard. This writes synthetic GPS
// against courier rows, so a tenant that did not ask for it must never be
// touched, no matter what else is in the database.

import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.courierOnlineSession = prisma.courierOnlineSession ?? {};
for (const fn of ["findMany", "count", "update", "create"]) {
  prisma.courierOnlineSession[fn] = prisma.courierOnlineSession[fn] ?? jest.fn();
}
prisma.driver = prisma.driver ?? {};
prisma.driver.count = prisma.driver.count ?? jest.fn();
prisma.driver.findMany = prisma.driver.findMany ?? jest.fn();
prisma.deliveryZone = prisma.deliveryZone ?? {};
prisma.deliveryZone.findMany = prisma.deliveryZone.findMany ?? jest.fn();

const { refreshDemoPresence } = require("../../services/demoPresenceService");

const TENANT = "demo-tenant";

describe("refreshDemoPresence", () => {
  const savedEnv = process.env.DEMO_PRESENCE_TENANTS;

  beforeEach(() => {
    resetAllMocks();
    jest.clearAllMocks();
    delete process.env.DEMO_PRESENCE_TENANTS;
  });

  afterAll(() => {
    if (savedEnv === undefined) delete process.env.DEMO_PRESENCE_TENANTS;
    else process.env.DEMO_PRESENCE_TENANTS = savedEnv;
  });

  test("unset env writes nothing at all — real tenants are never touched", async () => {
    const result = await refreshDemoPresence();

    expect(result).toEqual({ tenants: 0, refreshed: 0, woken: 0 });
    // Not one read, let alone a write. The guard short-circuits first.
    expect(prisma.courierOnlineSession.findMany).not.toHaveBeenCalled();
    expect(prisma.courierOnlineSession.update).not.toHaveBeenCalled();
    expect(prisma.courierOnlineSession.create).not.toHaveBeenCalled();
    expect(prisma.driver.count).not.toHaveBeenCalled();
  });

  test("only the named tenant is touched, never its neighbours", async () => {
    process.env.DEMO_PRESENCE_TENANTS = TENANT;
    prisma.driver.count.mockResolvedValue(10);
    prisma.courierOnlineSession.count.mockResolvedValue(10); // roster full, no waking
    prisma.courierOnlineSession.findMany.mockResolvedValue([
      { id: "s-1", lastGpsLat: 29.3, lastGpsLng: 48.0 },
    ]);
    prisma.courierOnlineSession.update.mockResolvedValue({});

    const result = await refreshDemoPresence();

    expect(result.tenants).toBe(1);
    expect(result.refreshed).toBe(1);
    // Every query carried the allow-listed tenant id.
    for (const call of prisma.courierOnlineSession.findMany.mock.calls) {
      expect(call[0].where.tenantId).toBe(TENANT);
    }
  });

  test("refreshing stamps GPS to now so the stale sweep leaves them online", async () => {
    process.env.DEMO_PRESENCE_TENANTS = TENANT;
    prisma.driver.count.mockResolvedValue(2);
    prisma.courierOnlineSession.count.mockResolvedValue(2);
    prisma.courierOnlineSession.findMany.mockResolvedValue([
      { id: "s-1", lastGpsLat: 29.3, lastGpsLng: 48.0 },
    ]);
    prisma.courierOnlineSession.update.mockResolvedValue({});

    const before = Date.now();
    await refreshDemoPresence();

    const data = prisma.courierOnlineSession.update.mock.calls[0][0].data;
    expect(data.lastGpsAt.getTime()).toBeGreaterThanOrEqual(before);
    // Drifted, but still recognisably in the same place.
    expect(Math.abs(data.lastGpsLat - 29.3)).toBeLessThan(0.01);
    expect(Math.abs(data.lastGpsLng - 48.0)).toBeLessThan(0.01);
  });

  test("a thin roster is topped back up from active drivers", async () => {
    process.env.DEMO_PRESENCE_TENANTS = TENANT;
    prisma.driver.count.mockResolvedValue(10); // wanted = round(10 * 0.45) = 5
    prisma.courierOnlineSession.count.mockResolvedValue(0); // nobody on shift
    prisma.deliveryZone.findMany.mockResolvedValue([
      { centroidLat: 29.3, centroidLng: 48.0 },
    ]);
    prisma.driver.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `drv-${i}` })),
    );
    prisma.courierOnlineSession.findMany.mockResolvedValue([]); // no open sessions
    prisma.courierOnlineSession.create.mockResolvedValue({});

    const result = await refreshDemoPresence();

    expect(result.woken).toBe(5);
    const created = prisma.courierOnlineSession.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ tenantId: TENANT, availability: "ONLINE", isOnline: true });
    expect(created.endTime).toBeNull();
  });

  test("one tenant failing does not stop the next, and never throws", async () => {
    process.env.DEMO_PRESENCE_TENANTS = `${TENANT},other-tenant`;
    prisma.driver.count
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValue(0);
    prisma.courierOnlineSession.count.mockResolvedValue(0);
    prisma.courierOnlineSession.findMany.mockResolvedValue([]);

    // The sweep that follows this call is what actually moves orders, so
    // upkeep failing has to stay a warning rather than an exception.
    await expect(refreshDemoPresence()).resolves.toMatchObject({ tenants: 2 });
  });
});
