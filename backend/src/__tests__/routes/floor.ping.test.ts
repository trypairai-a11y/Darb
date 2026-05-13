/**
 * Phase 7 Wave 0 RED test — POST /api/floor/ping/:driverId.
 *
 * The Live Floor pill counters offer a one-click "Ping" affordance:
 * the operator selects a courier card, hits Ping, the route invokes
 * the existing Phase 2 draftCourierMessage tool, which stages a
 * PendingAgentAction. NO Notification row is created until the
 * Phase 2 approve route fires (propose-and-confirm boundary).
 *
 * Contract:
 *   - POST {intent, bodyEnglish[, channel]} -> {pendingActionId, requiresApproval:true}
 *   - intent enum (Phase 7 only): WARN_GPS_STALE | WARN_ORDER_REJECTIONS | WARN_LATE_CLOCKIN
 *   - bodyEnglish: 20..500 chars (mirrors draftCourierMessage Zod
 *     schema)
 *   - Cross-tenant driverId -> 404
 *   - prisma.notification.create is NOT called until /approve fires
 *
 * REQ-floor-live-map.
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

describe("Phase 7 / REQ-floor-live-map: POST /api/floor/ping/:driverId", () => {
  beforeEach(() => {
    resetAllMocks();
    const prisma = getMockPrisma();
    (prisma as any).notification = { create: jest.fn() };
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv-stale-1",
      tenantId: "tenA",
      name: "Abdullah Z",
      phone: "+96599000005",
    });
    (prisma.pendingAgentAction.create as jest.Mock).mockResolvedValue({
      id: "pa-1",
      status: "PENDING",
      tenantId: "tenA",
    });
  });

  test("router exists at backend/src/routes/floor.ts", () => {
    expect(floorRouter).not.toBeNull();
  });

  test("WARN_GPS_STALE -> stages PendingAgentAction, returns {pendingActionId, requiresApproval:true}", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/floor/ping/drv-stale-1")
      .send({
        intent: "WARN_GPS_STALE",
        bodyEnglish:
          "Hi Abdullah, your GPS hasn't updated in 15 minutes. Please open the Darb agent and check connectivity.",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        pendingActionId: expect.any(String),
        requiresApproval: true,
      }),
    );
  });

  test("NO Notification row created before /api/decisions/:id/approve fires", async () => {
    const prisma = getMockPrisma();
    const app = makeApp();
    await request(app)
      .post("/api/floor/ping/drv-stale-1")
      .send({
        intent: "WARN_GPS_STALE",
        bodyEnglish:
          "Hi Abdullah, your GPS hasn't updated in 15 minutes. Please reopen the Darb agent.",
      });

    expect(((prisma as any).notification?.create ?? jest.fn())).not.toHaveBeenCalled();
  });

  test("invalid intent (not in {WARN_LATE_CLOCKIN, WARN_ORDER_REJECTIONS, WARN_GPS_STALE}) -> 400", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/floor/ping/drv-stale-1")
      .send({
        intent: "PROMOTE_TOP_PERFORMER", // outside Phase 7 pill enum
        bodyEnglish:
          "Hey Abdullah, you crushed it yesterday. Keep up the great work!",
      });
    expect(res.status).toBe(400);
  });

  test("bodyEnglish missing or too short (<20 chars) -> 400 (mirrors draftCourierMessage Zod schema)", async () => {
    const app = makeApp();
    const tooShort = await request(app)
      .post("/api/floor/ping/drv-stale-1")
      .send({ intent: "WARN_GPS_STALE", bodyEnglish: "too short" });
    expect(tooShort.status).toBe(400);

    const missing = await request(app)
      .post("/api/floor/ping/drv-stale-1")
      .send({ intent: "WARN_GPS_STALE" });
    expect(missing.status).toBe(400);
  });

  test("cross-tenant driverId -> 404 (driver not found in tenant scope)", async () => {
    const prisma = getMockPrisma();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null);

    const app = makeApp("OPS_MANAGER", "tenA");
    const res = await request(app)
      .post("/api/floor/ping/drv-tenB-courier")
      .send({
        intent: "WARN_GPS_STALE",
        bodyEnglish:
          "Hi, your GPS appears stale. Please reopen the Darb agent and check signal.",
      });
    expect(res.status).toBe(404);
  });
});

// RED — turned GREEN by Wave 1
