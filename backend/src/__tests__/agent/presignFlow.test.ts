/**
 * Wave 0 RED test — turns GREEN in Wave 2 when:
 *   1. POST /api/agent/upload-url issues a presigned URL with key prefix
 *      tenantId/orderId/deviceId/<ts>.jpg (R2 client wrapped in r2Service.ts)
 *   2. The endpoint validates contentType ∈ {image/jpeg, image/png}
 *   3. agentUploadRateLimit middleware caps 30 requests / 10 min by deviceId
 *
 * Today there is NO /upload-url endpoint on the agent router — that's the RED.
 */

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

// Mock R2 so the test does not need real AWS SDK creds. We assert the URL is
// returned to the client and that the key prefix follows the documented
// `{tenantId}/{orderId}/{deviceId}/<ts>.jpg` shape; we don't unit-test the
// AWS SDK itself.
jest.mock("../../services/r2Service", () => ({
  presignPutUrl: jest.fn(
    async (key: string) => `https://r2.test.invalid/${key}?signature=stub`,
  ),
  presignGetUrl: jest.fn(
    async (key: string) => `https://r2.test.invalid/${key}?get=stub`,
  ),
}));

const agentRouter = require("../../routes/agent").default;

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

describe("/api/agent/upload-url — Wave 0 RED scaffolding", () => {
  beforeEach(() => resetAllMocks());

  test("issues a presigned URL with key prefix tenantId/orderId/deviceId/<ts>.jpg", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });

    const res = await request(app).post("/api/agent/upload-url").send({
      deviceId: "dev1",
      orderId: "order1",
      contentType: "image/jpeg",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        url: expect.stringContaining("http"),
        key: expect.stringMatching(/^tenA\/order1\/dev1\/\d+\.jpg$/),
        expiresInSec: 300,
      }),
    );
  });

  test("rejects 400 when contentType is not image/jpeg or image/png", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });
    const res = await request(app).post("/api/agent/upload-url").send({
      deviceId: "dev1",
      orderId: "order1",
      contentType: "application/x-sh",
    });
    expect(res.status).toBe(400);
  });

  test("rejects 404 when device not found", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/api/agent/upload-url").send({
      deviceId: "ghost",
      orderId: "order1",
      contentType: "image/jpeg",
    });
    expect(res.status).toBe(404);
  });

  test("rate limit: 31st upload-url POST in 10min returns 429", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });

    let blocked = false;
    for (let i = 0; i < 31; i++) {
      const res = await request(app).post("/api/agent/upload-url").send({
        deviceId: "dev1",
        orderId: `o-${i}`,
        contentType: "image/jpeg",
      });
      if (i === 30 && res.status === 429) blocked = true;
    }
    expect(blocked).toBe(true);
  }, 30000);
});
