/**
 * Phase 7 Wave 0 RED test — Live Floor walking skeleton.
 *
 * The thinnest end-to-end proof that the Phase 7 floor stack works:
 *
 *   1. GET /api/floor/snapshot returns the fixture's 9 online couriers
 *      (10 minus drv-scheduled-1, who has no CourierOnlineSession row).
 *   2. GET /api/floor/counters returns
 *      {scheduledNotOnline:1, gpsStale:2, orderRejection:1}.
 *   3. publishEvent({type:'gps_point', ...}) on tenA reaches the
 *      tenA subscriber within the bus's local-listener window.
 *   4. POST /api/floor/ping/:driverId stages a PendingAgentAction.
 *   5. POST /api/decisions/:id/approve (Phase 2 path) wires through
 *      draftCourierMessage.execute() to create the Notification.
 *
 * If any step regresses, the walking skeleton snaps. Wave 1 lights it
 * up; Wave 4 hardens edge cases.
 *
 * REQ-floor-live-map.
 */

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";
import { publishEvent, subscribe } from "../../services/eventBus";
import { buildOnlineSessionRows } from "../fixtures/floorCouriers";

let floorRouter: express.Router | null = null;
try {
  floorRouter = require("../../routes/floor").default;
} catch {
  floorRouter = null;
}

let decisionsRouter: express.Router | null = null;
try {
  decisionsRouter = require("../../routes/decisions").default;
} catch {
  decisionsRouter = null;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: "u-1", tenantId: "tenA", role: "OPS_MANAGER", email: "test@darb.com" };
    next();
  });
  if (floorRouter) app.use("/api/floor", floorRouter);
  if (decisionsRouter) app.use("/api/decisions", decisionsRouter);
  return app;
}

describe("Phase 7 / REQ-floor-live-map: walking skeleton end-to-end", () => {
  beforeEach(() => {
    resetAllMocks();
    const prisma = getMockPrisma();
    // Snapshot
    (prisma.courierOnlineSession as any).findMany = jest
      .fn()
      .mockResolvedValue(buildOnlineSessionRows("tenA"));
    // Counters
    (prisma.shift as any).findMany = jest.fn().mockResolvedValue([
      // 1 scheduled driver NOT in online sessions (drv-scheduled-1)
      { driverId: "drv-scheduled-1" },
      // Add online sessions' driver ids so they're NOT scheduled-not-online
      { driverId: "drv-keeta-1" },
      { driverId: "drv-talabat-1" },
      { driverId: "drv-deliveroo-1" },
      { driverId: "drv-americana-1" },
      { driverId: "drv-stale-1" },
      { driverId: "drv-stale-2" },
      { driverId: "drv-reject-1" },
      { driverId: "drv-idle-1" },
      { driverId: "drv-idle-2" },
    ]);
    (prisma as any).keetaDailyMetrics = {
      findMany: jest.fn().mockResolvedValue([
        { driverId: "drv-reject-1", rejectedAuto: 5, tenantId: "tenA", date: new Date() },
      ]),
      groupBy: jest.fn().mockResolvedValue([
        { driverId: "drv-reject-1", _sum: { rejectedAuto: 5 } },
      ]),
      count: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn(),
    };
    // Ping -> PendingAgentAction
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv-stale-1",
      tenantId: "tenA",
      name: "Abdullah Z",
      phone: "+96599000005",
    });
    (prisma.pendingAgentAction.create as jest.Mock).mockResolvedValue({
      id: "pa-walking-1",
      status: "PENDING",
      tenantId: "tenA",
      toolName: "draftCourierMessage",
      params: {
        driverId: "drv-stale-1",
        intent: "WARN_GPS_STALE",
        bodyEnglish:
          "Hi Abdullah, your GPS hasn't updated in 15 minutes. Please reopen Darb.",
      },
    });
    (prisma as any).pendingAgentAction.findFirst = jest.fn().mockResolvedValue({
      id: "pa-walking-1",
      status: "PENDING",
      tenantId: "tenA",
      toolName: "draftCourierMessage",
      params: {
        driverId: "drv-stale-1",
        intent: "WARN_GPS_STALE",
        bodyEnglish:
          "Hi Abdullah, your GPS hasn't updated in 15 minutes. Please reopen Darb.",
      },
    });
    (prisma as any).pendingAgentAction.update = jest.fn().mockResolvedValue({
      id: "pa-walking-1",
      status: "APPROVED",
    });
    (prisma as any).notification = {
      create: jest.fn().mockResolvedValue({ id: "notif-1", type: "AGENT_DRAFT_WARN_GPS_STALE" }),
    };
  });

  test("end-to-end happy path: snapshot -> counters -> publishEvent -> ping -> approve", async () => {
    expect(floorRouter).not.toBeNull();
    expect(decisionsRouter).not.toBeNull();
    const app = makeApp();

    // 1. Snapshot
    const snap = await request(app).get("/api/floor/snapshot");
    expect(snap.status).toBe(200);
    const data = snap.body.data ?? snap.body;
    expect(data.length).toBe(9); // 10 fixture minus the scheduled-not-online row

    // 2. Counters
    const cts = await request(app).get("/api/floor/counters");
    expect(cts.status).toBe(200);
    const body = cts.body.data ?? cts.body;
    expect(body).toEqual(
      expect.objectContaining({
        scheduledNotOnline: 1,
        gpsStale: 2,
        orderRejection: 1,
      }),
    );

    // 3. publishEvent reaches the local listener
    const received: any[] = [];
    const unsub = subscribe("tenA", (e) => received.push(e));
    try {
      // RED: TS2322 — "gps_point" not in DarbEventType union yet.
      // Wave 1 widens the union and this compiles cleanly.
      await publishEvent({
        type: "gps_point",
        tenantId: "tenA",
        payload: {
          driverId: "drv-stale-1",
          lat: 29.331,
          lng: 48.030,
          capturedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
      await new Promise((r) => setTimeout(r, 50));
      const gps = received.filter((e) => e.type === "gps_point");
      expect(gps.length).toBe(1);
      expect(gps[0].payload.driverId).toBe("drv-stale-1");
    } finally {
      unsub();
    }

    // 4. Ping stages PendingAgentAction
    const ping = await request(app)
      .post("/api/floor/ping/drv-stale-1")
      .send({
        intent: "WARN_GPS_STALE",
        bodyEnglish:
          "Hi Abdullah, your GPS hasn't updated in 15 minutes. Please reopen Darb.",
      });
    expect(ping.status).toBe(200);
    expect(ping.body.pendingActionId).toBeDefined();
    const pendingActionId = ping.body.pendingActionId;

    // 5. Approve -> Notification.create called by draftCourierMessage.execute
    const approve = await request(app)
      .post(`/api/decisions/${pendingActionId}/approve`)
      .send({ source: "floor" });
    // Whether the approve route returns 200 or 201, the side effect we
    // care about is the Notification row.
    expect([200, 201]).toContain(approve.status);
    const prisma = getMockPrisma();
    expect((prisma as any).notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenA",
          type: "AGENT_DRAFT_WARN_GPS_STALE",
        }),
      }),
    );
  });
});

// RED — turned GREEN by Wave 1 (every step is wired)
