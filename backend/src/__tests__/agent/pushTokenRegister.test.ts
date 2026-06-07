/**
 * Phase 9 Wave 0 RED test — turns GREEN in Wave 1 when:
 *   1. POST /api/agent/push-token writes Driver.expoPushToken via Device.driverId join.
 *   2. Malformed tokens (not starting with `ExponentPushToken[`) → 400.
 *   3. Unknown deviceId → 404.
 *   4. Device without a driver → 404.
 *   5. Re-register with the same token is idempotent (200, no DB change).
 *
 * The Wave 1 implementation extends `src/routes/agent.ts` with POST /push-token.
 * Today that route doesn't exist so each `it` block fails with 404 — that IS the RED signal.
 */

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

const agentRouter = require("../../routes/agent").default;

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

describe("POST /api/agent/push-token — Wave 0 RED scaffolding", () => {
  beforeEach(() => resetAllMocks());

  test("writes Driver.expoPushToken via Device.driverId join", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });
    prisma.driver.update.mockResolvedValue({ id: "drv1" });

    const res = await request(app)
      .post("/api/agent/push-token")
      .send({ deviceId: "dev1", expoPushToken: "ExponentPushToken[abc-123]" });

    expect(res.status).toBe(200);
    expect(prisma.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "drv1" }),
        data: expect.objectContaining({ expoPushToken: "ExponentPushToken[abc-123]" }),
      }),
    );
  });

  test("rejects 400 on malformed token (must start with 'ExponentPushToken[')", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
    });

    const res = await request(app)
      .post("/api/agent/push-token")
      .send({ deviceId: "dev1", expoPushToken: "garbage-not-a-token" });

    expect(res.status).toBe(400);
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });

  test("returns 404 when deviceId doesn't exist", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/agent/push-token")
      .send({ deviceId: "unknown", expoPushToken: "ExponentPushToken[abc-123]" });

    expect(res.status).toBe(404);
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });

  test("returns 404 when device has no driver assigned", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: null,
    });

    const res = await request(app)
      .post("/api/agent/push-token")
      .send({ deviceId: "dev1", expoPushToken: "ExponentPushToken[abc-123]" });

    expect(res.status).toBe(404);
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });

  test("is idempotent — re-registering same token returns 200 with unchanged DB state", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
    });
    prisma.driver.findFirst.mockResolvedValue({
      id: "drv1",
      tenantId: "tenA",
      expoPushToken: "ExponentPushToken[same-token]",
    });
    prisma.driver.update.mockResolvedValue({ id: "drv1" });

    const res1 = await request(app)
      .post("/api/agent/push-token")
      .send({ deviceId: "dev1", expoPushToken: "ExponentPushToken[same-token]" });
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post("/api/agent/push-token")
      .send({ deviceId: "dev1", expoPushToken: "ExponentPushToken[same-token]" });
    expect(res2.status).toBe(200);
    // Wave 1: implementation MAY skip the update on no-change OR call it
    // with the same value — both shapes are acceptable. The contract is "200".
  });

  test("rejects 400 when expoPushToken missing entirely", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
    });

    const res = await request(app).post("/api/agent/push-token").send({ deviceId: "dev1" });
    expect(res.status).toBe(400);
  });
});
