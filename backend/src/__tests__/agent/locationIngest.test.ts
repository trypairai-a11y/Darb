/**
 * Wave 0 RED test — turns GREEN in Wave 2 when:
 *   1. POST /api/agent/location persists batched GPS into LocationLog
 *   2. The same handler upserts CourierOnlineSession with lastGpsAt/lat/lng
 *   3. A server-side dedup window (5 min) rejects duplicate idempotencyKey
 *   4. agentLocationRateLimit middleware blocks the 201st POST in 5 min
 *   5. Unknown deviceId → 404
 *
 * The Wave 2 implementation will import the real router from `src/routes/agent.ts`.
 * Today the agent router has a stub /location endpoint that does NOT batch-insert
 * + does NOT upsert sessions + has no dedup window. That is the RED state.
 */

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

const agentRouter = require("../../routes/agent").default;

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

describe("/api/agent/location — Wave 0 RED scaffolding", () => {
  beforeEach(() => resetAllMocks());

  test("walking skeleton: 5 GPS POSTs → 5 LocationLog rows + CourierOnlineSession upsert with fresh lastGpsAt", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });
    prisma.locationLog.createMany.mockResolvedValue({ count: 5 });
    // CourierOnlineSession has no @@unique → no prisma.upsert available. The
    // handler uses findFirst + (update if exists OR create). Returning null
    // here forces the create branch.
    prisma.courierOnlineSession.findFirst.mockResolvedValue(null);
    prisma.courierOnlineSession.create.mockResolvedValue({});
    prisma.device.update.mockResolvedValue({});

    const t0 = Date.parse("2026-05-13T10:00:00.000Z");

    const res = await request(app).post("/api/agent/location").send({
      deviceId: "dev1",
      driverId: "drv1",
      locations: Array.from({ length: 5 }).map((_, i) => ({
        latitude: 29.3759 + i * 0.0001,
        longitude: 47.9774,
        accuracy: 10,
        capturedAt: new Date(t0 + i * 6000).toISOString(),
        idempotencyKey: `t0+${i}`,
      })),
    });

    expect(res.status).toBe(200);
    expect(prisma.locationLog.createMany).toHaveBeenCalledTimes(1);
    // Confirms tenantId is scoped on the session lookup AND that lastGpsAt
    // is a fresh Date sourced from the GPS payload.
    expect(prisma.courierOnlineSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenA", driverId: "drv1", isOnline: true }),
      }),
    );
    expect(prisma.courierOnlineSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenA",
          driverId: "drv1",
          isOnline: true,
          lastGpsAt: expect.any(Date),
        }),
      }),
    );
  });

  test("server-side dedup: same idempotencyKey within 5min window inserts only once", async () => {
    // RED: Wave 2 implementation must dedup by (deviceId, idempotencyKey) within a 5 min window.
    // Until then, the route blindly persists every POST.
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

    const point = {
      latitude: 29.3759,
      longitude: 47.9774,
      accuracy: 10,
      capturedAt: "2026-05-13T10:00:00.000Z",
      idempotencyKey: "dup-key-1",
    };

    await request(app)
      .post("/api/agent/location")
      .send({ deviceId: "dev1", driverId: "drv1", locations: [point] });

    // Second POST with same idempotencyKey within window → must dedup.
    await request(app)
      .post("/api/agent/location")
      .send({ deviceId: "dev1", driverId: "drv1", locations: [point] });

    // RED: today both POSTs createMany. Wave 2: second call passes 0 fresh rows.
    expect(prisma.locationLog.createMany).toHaveBeenCalledTimes(1);
  });

  test("rate limit: 201st location POST in 5min window returns 429", async () => {
    // RED until Wave 2 attaches agentLocationRateLimit to /api/agent/location.
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

    let blocked = false;
    for (let i = 0; i < 201; i++) {
      const res = await request(app)
        .post("/api/agent/location")
        .send({
          deviceId: "dev1",
          driverId: "drv1",
          locations: [{
            latitude: 29.3759,
            longitude: 47.9774,
            accuracy: 10,
            capturedAt: new Date(Date.now() + i).toISOString(),
            idempotencyKey: `k-${i}`,
          }],
        });
      if (i === 200 && res.status === 429) blocked = true;
    }

    expect(blocked).toBe(true);
  }, 30000);

  test("rejects 404 when device not found", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/agent/location")
      .send({ deviceId: "unknown", driverId: "x", locations: [] });
    expect(res.status).toBe(404);
  });
});
