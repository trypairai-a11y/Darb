// /api/partner — PRD §2 merchant order intake (API-key auth boundary +
// idempotency contract). Mounted pre-auth, so the key check is the only
// thing between it and the internet — tested directly like cron.test.ts.

import express from "express";
import request from "supertest";
import { createHash } from "crypto";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
prisma.apiKey = prisma.apiKey ?? {};
for (const fn of ["findUnique", "update"]) {
  prisma.apiKey[fn] = prisma.apiKey[fn] ?? jest.fn();
}
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
for (const fn of ["findFirst"]) {
  prisma.deliveryOrder[fn] = prisma.deliveryOrder[fn] ?? jest.fn();
}
prisma.vendorBranch = prisma.vendorBranch ?? {};
prisma.vendorBranch.findFirst = prisma.vendorBranch.findFirst ?? jest.fn();

jest.mock("../../services/orderService", () => ({
  createDeliveryOrder: jest.fn(),
}));
const { createDeliveryOrder } = require("../../services/orderService");

import partnerRouter from "../../routes/partner";

const RAW_KEY = "dpk_test-raw-key-1234567890abcdef";
const KEY_ROW = {
  id: "key-1",
  tenantId: "t-1",
  vendorId: "v-1",
  keyHash: createHash("sha256").update(RAW_KEY, "utf8").digest("hex"),
  isActive: true,
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/partner", partnerRouter);
  return app;
}

const GOOD_BODY = {
  externalRef: "ROYAL-1001",
  branchId: "b-1",
  paymentMethod: "COD",
  orderTotalKwd: "5.000",
  customer: { name: "Abdullah", phone: "+96550000001" },
  dropoff: { lat: 29.33, lng: 48.07, address: "Salmiya, block 2" },
};

const CREATED_ORDER = {
  id: "ord-1",
  orderNumber: "DRB-ROYL-0001",
  externalRef: "ROYAL-1001",
  status: "DISPATCHING",
  rejectionReason: null,
  cancelReason: null,
  failureReason: null,
  deliveryFeeKwd: { toFixed: () => "1.250" },
  trackingToken: "tok_abc",
  scheduledAt: null,
  assignedAt: null,
  pickedUpAt: null,
  deliveredAt: null,
  createdAt: new Date("2026-07-20T10:00:00Z"),
};

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.apiKey.findUnique.mockResolvedValue(KEY_ROW);
  prisma.apiKey.update.mockResolvedValue(KEY_ROW);
  prisma.deliveryOrder.findFirst.mockResolvedValue(null);
  prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b-1" });
  createDeliveryOrder.mockResolvedValue(CREATED_ORDER);
});

describe("partner auth boundary", () => {
  test("401 with no key at all", async () => {
    const res = await request(makeApp()).post("/api/partner/orders").send(GOOD_BODY);
    expect(res.status).toBe(401);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("401 on an unknown key", async () => {
    prisma.apiKey.findUnique.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/partner/orders")
      .set("X-Api-Key", "dpk_wrong")
      .send(GOOD_BODY);
    expect(res.status).toBe(401);
  });

  test("401 on a revoked (isActive=false) key", async () => {
    prisma.apiKey.findUnique.mockResolvedValue({ ...KEY_ROW, isActive: false });
    const res = await request(makeApp())
      .post("/api/partner/orders")
      .set("X-Api-Key", RAW_KEY)
      .send(GOOD_BODY);
    expect(res.status).toBe(401);
  });

  test("the key is looked up by sha256 hash, never raw", async () => {
    await request(makeApp())
      .post("/api/partner/orders")
      .set("X-Api-Key", RAW_KEY)
      .send(GOOD_BODY);
    const where = prisma.apiKey.findUnique.mock.calls[0][0].where;
    expect(where.keyHash).toBe(KEY_ROW.keyHash);
    expect(JSON.stringify(where)).not.toContain(RAW_KEY);
  });

  test("Authorization: Bearer <key> is accepted as an alternative header", async () => {
    const res = await request(makeApp())
      .post("/api/partner/orders")
      .set("Authorization", `Bearer ${RAW_KEY}`)
      .send(GOOD_BODY);
    expect(res.status).toBe(201);
  });
});

describe("order intake", () => {
  test("201 create: vendor/tenant come from the KEY, never the body", async () => {
    const res = await request(makeApp())
      .post("/api/partner/orders")
      .set("X-Api-Key", RAW_KEY)
      .send({ ...GOOD_BODY, vendorId: "v-EVIL", tenantId: "t-EVIL" });

    expect(res.status).toBe(201);
    expect(createDeliveryOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        vendorId: "v-1",
        source: "PARTNER_API",
        externalRef: "ROYAL-1001",
      }),
    );
    expect(res.body).toMatchObject({
      orderNumber: "DRB-ROYL-0001",
      status: "DISPATCHING",
      trackingToken: "tok_abc",
    });
    // podPin must never leak to the partner.
    expect(res.body.podPin).toBeUndefined();
  });

  test("idempotent replay: same externalRef returns the existing order with 200", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(CREATED_ORDER);
    const res = await request(makeApp())
      .post("/api/partner/orders")
      .set("X-Api-Key", RAW_KEY)
      .send(GOOD_BODY);
    expect(res.status).toBe(200);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("422 when the branch does not belong to the key's merchant", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/partner/orders")
      .set("X-Api-Key", RAW_KEY)
      .send(GOOD_BODY);
    expect(res.status).toBe(422);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("a REJECTED order still returns 201 with the reason (contract: inspect status)", async () => {
    createDeliveryOrder.mockResolvedValue({
      ...CREATED_ORDER,
      status: "REJECTED",
      rejectionReason: "OUT_OF_ZONE_DROPOFF",
    });
    const res = await request(makeApp())
      .post("/api/partner/orders")
      .set("X-Api-Key", RAW_KEY)
      .send(GOOD_BODY);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "REJECTED", rejectionReason: "OUT_OF_ZONE_DROPOFF" });
  });

  test("externalRef unique race: create throws P2002-ish, the existing row is fetched and returned 200", async () => {
    createDeliveryOrder.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce(null) // pre-check missed
      .mockResolvedValueOnce(CREATED_ORDER); // post-race fetch
    const res = await request(makeApp())
      .post("/api/partner/orders")
      .set("X-Api-Key", RAW_KEY)
      .send(GOOD_BODY);
    expect(res.status).toBe(200);
    expect(res.body.orderNumber).toBe("DRB-ROYL-0001");
  });
});

describe("order status lookup", () => {
  test("GET by externalRef scoped to the key's vendor", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(CREATED_ORDER);
    const res = await request(makeApp())
      .get("/api/partner/orders/ROYAL-1001")
      .set("X-Api-Key", RAW_KEY);
    expect(res.status).toBe(200);
    const where = prisma.deliveryOrder.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "t-1", vendorId: "v-1" });
  });

  test("404 for an order outside the key's scope", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(null);
    const res = await request(makeApp())
      .get("/api/partner/orders/someone-elses-order")
      .set("X-Api-Key", RAW_KEY);
    expect(res.status).toBe(404);
  });
});
