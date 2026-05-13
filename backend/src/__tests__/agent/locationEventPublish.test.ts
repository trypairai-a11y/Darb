/**
 * Phase 7 Wave 0 RED test — turns GREEN by Wave 1.
 *
 * POST /api/agent/location MUST fan out to the event bus so the Live
 * Floor map updates in real time. Wave 1 adds:
 *   1. publishEvent({type:"gps_point", ...}) for the last point in
 *      every non-empty batch, scoped to the tenantId derived from
 *      prisma.device.findUnique -> driver.tenantId (NEVER the request
 *      body — defense against a tampered client claiming another
 *      tenant's deviceId).
 *   2. publishEvent({type:"online_session_update", ...}) whenever
 *      the session.upsert flips isOnline from false -> true.
 *   3. publishEvent failure is best-effort — the GPS write already
 *      succeeded, so the response stays 200.
 *
 * Pitfall 6 (cross-tenant SSE leak): the event bus is single-tenant
 * by channel construction (events:{tenantId}). The vulnerability is
 * passing a wrong tenantId at publish time — that's what the
 * "tenantId derived from prisma.device" assertion guards.
 *
 * REQ-floor-live-map.
 */

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

// Wave 1 will import { publishEvent } in routes/agent.ts. The Jest
// mock here captures the call signature so the RED tests can assert
// against it. Today the route does NOT call publishEvent at all, so
// the assertion that "publishEvent was called" fails — that IS the
// RED state.
jest.mock("../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockReturnValue(() => {}),
}));

const { publishEvent } = require("../../services/eventBus") as {
  publishEvent: jest.Mock;
};

const agentRouter = require("../../routes/agent").default;

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

describe("Phase 7 / REQ-floor-live-map: POST /api/agent/location publishes gps_point + online_session_update", () => {
  beforeEach(() => {
    resetAllMocks();
    publishEvent.mockClear();
  });

  test("POST with 3 locations -> publishEvent called once with gps_point payload using the LAST point in the batch", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });
    prisma.locationLog.createMany.mockResolvedValue({ count: 3 });
    prisma.courierOnlineSession.findFirst.mockResolvedValue(null);
    prisma.courierOnlineSession.create.mockResolvedValue({});
    prisma.device.update.mockResolvedValue({});

    const t0 = Date.parse("2026-05-13T10:00:00.000Z");
    await request(app)
      .post("/api/agent/location")
      .send({
        deviceId: "dev1",
        driverId: "drv1",
        locations: [
          { latitude: 29.371, longitude: 47.971, accuracy: 10, capturedAt: new Date(t0).toISOString(), idempotencyKey: "p1" },
          { latitude: 29.372, longitude: 47.972, accuracy: 10, capturedAt: new Date(t0 + 6000).toISOString(), idempotencyKey: "p2" },
          { latitude: 29.373, longitude: 47.973, accuracy: 10, capturedAt: new Date(t0 + 12000).toISOString(), idempotencyKey: "p3" },
        ],
      });

    const gpsCalls = publishEvent.mock.calls.filter(
      (c) => c[0]?.type === "gps_point",
    );
    expect(gpsCalls.length).toBe(1);
    expect(gpsCalls[0][0]).toEqual(
      expect.objectContaining({
        type: "gps_point",
        tenantId: "tenA",
        payload: expect.objectContaining({
          driverId: "drv1",
          lat: 29.373,
          lng: 47.973,
        }),
      }),
    );
  });

  test("publishEvent tenantId is derived from prisma.device -> driver.tenantId, NEVER from the request body", async () => {
    const prisma = getMockPrisma();
    // Device + driver belong to tenA, but a tampered client sends
    // tenantId: "tenB" in the request body. Wave 1 must IGNORE the
    // body field and pull tenantId from the Device join.
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });
    prisma.locationLog.createMany.mockResolvedValue({ count: 1 });
    prisma.courierOnlineSession.findFirst.mockResolvedValue(null);
    prisma.courierOnlineSession.create.mockResolvedValue({});
    prisma.device.update.mockResolvedValue({});

    await request(app).post("/api/agent/location").send({
      deviceId: "dev1",
      driverId: "drv1",
      tenantId: "tenB", // attacker-supplied — must be ignored
      locations: [{ latitude: 29.4, longitude: 48.0, accuracy: 10, capturedAt: new Date().toISOString(), idempotencyKey: "k1" }],
    });

    const gpsCalls = publishEvent.mock.calls.filter(
      (c) => c[0]?.type === "gps_point",
    );
    expect(gpsCalls.length).toBe(1);
    expect(gpsCalls[0][0].tenantId).toBe("tenA");
    expect(gpsCalls[0][0].tenantId).not.toBe("tenB");
  });

  test("POST with empty locations array -> publishEvent NOT called", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });

    await request(app)
      .post("/api/agent/location")
      .send({ deviceId: "dev1", driverId: "drv1", locations: [] });

    const gpsCalls = publishEvent.mock.calls.filter(
      (c) => c[0]?.type === "gps_point",
    );
    expect(gpsCalls.length).toBe(0);
  });

  test("isOnline transition (offline -> online) publishes online_session_update", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });
    prisma.locationLog.createMany.mockResolvedValue({ count: 1 });
    // Wave 1 creates a fresh session row -> handler should detect the
    // transition and publish online_session_update.
    prisma.courierOnlineSession.findFirst.mockResolvedValue(null);
    prisma.courierOnlineSession.create.mockResolvedValue({
      id: "sess-1",
      driverId: "drv1",
      tenantId: "tenA",
      isOnline: true,
      area: "Hawally",
    });
    prisma.device.update.mockResolvedValue({});

    await request(app)
      .post("/api/agent/location")
      .send({
        deviceId: "dev1",
        driverId: "drv1",
        area: "Hawally",
        locations: [{ latitude: 29.4, longitude: 48.0, accuracy: 10, capturedAt: new Date().toISOString(), idempotencyKey: "k2" }],
      });

    const sessionCalls = publishEvent.mock.calls.filter(
      (c) => c[0]?.type === "online_session_update",
    );
    expect(sessionCalls.length).toBe(1);
    expect(sessionCalls[0][0]).toEqual(
      expect.objectContaining({
        type: "online_session_update",
        tenantId: "tenA",
        payload: expect.objectContaining({
          driverId: "drv1",
          isOnline: true,
        }),
      }),
    );
  });

  test("publishEvent failure does NOT 500 the response — fan-out is best effort", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });
    prisma.locationLog.createMany.mockResolvedValue({ count: 1 });
    prisma.courierOnlineSession.findFirst.mockResolvedValue(null);
    prisma.courierOnlineSession.create.mockResolvedValue({});
    prisma.device.update.mockResolvedValue({});

    publishEvent.mockRejectedValueOnce(new Error("redis down"));

    const res = await request(app)
      .post("/api/agent/location")
      .send({
        deviceId: "dev1",
        driverId: "drv1",
        locations: [{ latitude: 29.4, longitude: 48.0, accuracy: 10, capturedAt: new Date().toISOString(), idempotencyKey: "k3" }],
      });

    expect(res.status).toBe(200);
  });
});

// RED — turned GREEN by Wave 1
