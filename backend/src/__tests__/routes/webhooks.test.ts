// /api/webhooks/foodics/:secret — public webhook intake (plan §A6).
// Contract under test: unknown secret ⇒ 401; idempotent P2002 ⇒ 200
// {duplicate:true} with NO enqueue; success ⇒ WebhookEvent envelope stored +
// foodics-ingest enqueued; optional HMAC verification.

import crypto from "crypto";
import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
prisma.foodicsConnection = prisma.foodicsConnection ?? {};
for (const fn of ["findFirst", "updateMany"]) {
  prisma.foodicsConnection[fn] = prisma.foodicsConnection[fn] ?? jest.fn();
}
prisma.webhookEvent = prisma.webhookEvent ?? {};
for (const fn of ["create", "update", "findUnique"]) {
  prisma.webhookEvent[fn] = prisma.webhookEvent[fn] ?? jest.fn();
}

jest.mock("../../queues/foodicsWorker", () => ({
  enqueueFoodicsIngest: jest.fn().mockResolvedValue("queued"),
}));

import webhooksRouter, { computeFoodicsEventKey } from "../../routes/webhooks";
import codFixture from "../fixtures/foodics/order.delivery.created.cod.json";

const { enqueueFoodicsIngest } = require("../../queues/foodicsWorker");

const CONNECTION = { id: "conn-1", tenantId: "t-1", vendorId: "v-1" };
const SECRET = "abc123secret";

function makeApp(withRawBody = false) {
  const app = express();
  app.use(
    express.json(
      withRawBody
        ? { verify: (req: any, _res, buf) => { req.rawBody = buf; } }
        : {},
    ),
  );
  app.use("/api/webhooks", webhooksRouter);
  return app;
}

describe("POST /api/webhooks/foodics/:secret", () => {
  beforeEach(() => {
    resetAllMocks();
    (enqueueFoodicsIngest as jest.Mock).mockClear();
    (enqueueFoodicsIngest as jest.Mock).mockResolvedValue("queued");
    delete process.env.FOODICS_WEBHOOK_HMAC_SECRET;
  });

  test("unknown secret → 401, nothing stored", async () => {
    prisma.foodicsConnection.findFirst.mockResolvedValue(null);
    const res = await request(makeApp())
      .post(`/api/webhooks/foodics/wrong`)
      .send(codFixture);
    expect(res.status).toBe(401);
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(enqueueFoodicsIngest).not.toHaveBeenCalled();
  });

  test("valid secret → 200, envelope stored, ingest enqueued", async () => {
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
    prisma.webhookEvent.create.mockResolvedValue({ id: "we-1" });
    prisma.foodicsConnection.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(makeApp())
      .post(`/api/webhooks/foodics/${SECRET}`)
      .send(codFixture);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    // Secret resolved the connection.
    expect(prisma.foodicsConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ webhookSecret: SECRET }),
      }),
    );
    // Envelope carries identity + raw body for the worker.
    const createArg = prisma.webhookEvent.create.mock.calls[0][0];
    expect(createArg.data.provider).toBe("foodics");
    expect(createArg.data.eventKey).toBe(computeFoodicsEventKey(codFixture));
    expect(createArg.data.payload).toMatchObject({
      connectionId: "conn-1",
      tenantId: "t-1",
      vendorId: "v-1",
    });
    expect(createArg.data.payload.body.event).toBe("order.delivery.created");

    expect(enqueueFoodicsIngest).toHaveBeenCalledWith("we-1");
  });

  test("duplicate delivery (P2002) → 200 {duplicate:true}, NO enqueue", async () => {
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
    prisma.webhookEvent.create.mockRejectedValue({ code: "P2002" });

    const res = await request(makeApp())
      .post(`/api/webhooks/foodics/${SECRET}`)
      .send(codFixture);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(enqueueFoodicsIngest).not.toHaveBeenCalled();
  });

  test("enqueue failure still answers 200 (row stays RECEIVED)", async () => {
    prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
    prisma.webhookEvent.create.mockResolvedValue({ id: "we-2" });
    prisma.foodicsConnection.updateMany.mockResolvedValue({ count: 1 });
    (enqueueFoodicsIngest as jest.Mock).mockRejectedValue(new Error("redis down"));

    const res = await request(makeApp())
      .post(`/api/webhooks/foodics/${SECRET}`)
      .send(codFixture);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test("eventKey is stable for the same delivery, distinct across events", () => {
    const again = JSON.parse(JSON.stringify(codFixture));
    expect(computeFoodicsEventKey(again)).toBe(computeFoodicsEventKey(codFixture));
    const updated = JSON.parse(JSON.stringify(codFixture));
    updated.event = "order.delivery.updated";
    expect(computeFoodicsEventKey(updated)).not.toBe(computeFoodicsEventKey(codFixture));
  });

  describe("HMAC verification (FOODICS_WEBHOOK_HMAC_SECRET set)", () => {
    const HMAC_SECRET = "hmac-test-secret";

    beforeEach(() => {
      process.env.FOODICS_WEBHOOK_HMAC_SECRET = HMAC_SECRET;
      prisma.foodicsConnection.findFirst.mockResolvedValue(CONNECTION);
      prisma.webhookEvent.create.mockResolvedValue({ id: "we-3" });
      prisma.foodicsConnection.updateMany.mockResolvedValue({ count: 1 });
    });

    afterAll(() => {
      delete process.env.FOODICS_WEBHOOK_HMAC_SECRET;
    });

    test("valid signature over the raw body → 200", async () => {
      const raw = JSON.stringify(codFixture);
      const signature = crypto.createHmac("sha256", HMAC_SECRET).update(raw).digest("hex");
      const res = await request(makeApp(true))
        .post(`/api/webhooks/foodics/${SECRET}`)
        .set("Content-Type", "application/json")
        .set("X-Foodics-Signature", signature)
        .send(raw);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    test("bad signature → 401, nothing stored", async () => {
      const res = await request(makeApp(true))
        .post(`/api/webhooks/foodics/${SECRET}`)
        .set("Content-Type", "application/json")
        .set("X-Foodics-Signature", "deadbeef")
        .send(JSON.stringify(codFixture));
      expect(res.status).toBe(401);
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });

    test("rawBody not captured (server.ts integration pending) → warn + accept", async () => {
      const res = await request(makeApp(false)) // no verify hook
        .post(`/api/webhooks/foodics/${SECRET}`)
        .send(codFixture);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });
  });
});
