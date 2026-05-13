/**
 * Phase 7 Wave 0 RED test — GET /api/floor/counters.
 *
 * Returns the three pill counts powering the Live Floor header:
 *   {
 *     scheduledNotOnline: number,
 *     gpsStale: number,
 *     orderRejection: number,
 *   }
 *
 * scheduledNotOnline + gpsStale pull from the existing liveFleetStatus
 * read tool. orderRejection pulls from the new orderRejectionToday
 * aggregate (Wave 1).
 *
 * RBAC: same allow-list as /snapshot — ADMIN, OPS_MANAGER, SUPERVISOR.
 *
 * REQ-floor-live-map, CON-tenant-scope-everywhere.
 */

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

let floorRouter: express.Router | null = null;
try {
  floorRouter = require("../../routes/floor").default;
} catch {
  floorRouter = null;
}

function makeApp(role: string = "OPS_MANAGER", tenantId = "tenA") {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: "u-1", tenantId, role, email: "test@darb.com" };
    next();
  });
  if (floorRouter) app.use("/api/floor", floorRouter);
  return app;
}

describe("Phase 7 / REQ-floor-live-map: GET /api/floor/counters", () => {
  beforeEach(() => {
    resetAllMocks();
    const prisma = getMockPrisma();
    (prisma.courierOnlineSession as any).findMany = jest.fn().mockResolvedValue([]);
    (prisma.shift as any).findMany = jest.fn().mockResolvedValue([]);
    (prisma as any).keetaDailyMetrics = {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn(),
    };
  });

  test("router exists at backend/src/routes/floor.ts", () => {
    expect(floorRouter).not.toBeNull();
  });

  test("returns {scheduledNotOnline, gpsStale, orderRejection} aggregate shape", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/floor/counters");
    expect(res.status).toBe(200);
    const body = res.body.data ?? res.body;
    expect(body).toEqual(
      expect.objectContaining({
        scheduledNotOnline: expect.any(Number),
        gpsStale: expect.any(Number),
        orderRejection: expect.any(Number),
      }),
    );
  });

  test("scheduledNotOnline+gpsStale from liveFleetStatus; orderRejection from keetaDailyMetrics", async () => {
    const prisma = getMockPrisma();
    (prisma.courierOnlineSession as any).findMany = jest.fn().mockResolvedValue([
      // 2 stale sessions
      { driverId: "d1", area: "Hawally", lastGpsAt: new Date(Date.now() - 15 * 60 * 1000), driver: { platform: "KEETA" } },
      { driverId: "d2", area: "Salmiya", lastGpsAt: new Date(Date.now() - 15 * 60 * 1000), driver: { platform: "TALABAT" } },
      // 1 fresh
      { driverId: "d3", area: "Avenues", lastGpsAt: new Date(), driver: { platform: "DELIVEROO" } },
    ]);
    (prisma.shift as any).findMany = jest.fn().mockResolvedValue([
      // 1 scheduled shift whose driver is NOT in the online session list
      { driverId: "d4" },
      // 3 sessions overlap with d1..d3 -> not scheduled-not-online
      { driverId: "d1" },
      { driverId: "d2" },
      { driverId: "d3" },
    ]);
    (prisma as any).keetaDailyMetrics.groupBy.mockResolvedValue([
      { driverId: "d5", _sum: { rejectedAuto: 5 } },
    ]);
    (prisma as any).keetaDailyMetrics.findMany.mockResolvedValue([
      { driverId: "d5", rejectedAuto: 5, tenantId: "tenA", date: new Date() },
    ]);

    const app = makeApp();
    const res = await request(app).get("/api/floor/counters");
    expect(res.status).toBe(200);
    const body = res.body.data ?? res.body;
    expect(body.gpsStale).toBe(2);
    expect(body.scheduledNotOnline).toBe(1);
    expect(body.orderRejection).toBe(1);
  });

  test("tenant-scoped — cross-tenant data does not bleed", async () => {
    const prisma = getMockPrisma();
    const findMany = jest.fn().mockResolvedValue([]);
    (prisma.courierOnlineSession as any).findMany = findMany;

    const app = makeApp("OPS_MANAGER", "tenB");
    await request(app).get("/api/floor/counters");
    const call = findMany.mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({ tenantId: "tenB" }),
    );
  });

  test("RBAC: 403 for VIEWER; 200 for OPS_MANAGER/ADMIN/SUPERVISOR", async () => {
    const viewerApp = makeApp("VIEWER", "tenA");
    const v = await request(viewerApp).get("/api/floor/counters");
    expect(v.status).toBe(403);

    for (const role of ["OPS_MANAGER", "ADMIN", "SUPERVISOR"]) {
      const app = makeApp(role, "tenA");
      const res = await request(app).get("/api/floor/counters");
      expect(res.status).toBe(200);
    }
  });
});

// RED — turned GREEN by Wave 1
