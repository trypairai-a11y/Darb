// /api/track — PRD §12 public tracking surface. No auth: the trackingToken
// is the credential, so the tests focus on (a) no enumeration signal,
// (b) the strict safe-subset response, (c) cancel-request semantics.

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
prisma.deliveryOrder.findUnique = prisma.deliveryOrder.findUnique ?? jest.fn();
prisma.courierOnlineSession = prisma.courierOnlineSession ?? {};
prisma.courierOnlineSession.findFirst = prisma.courierOnlineSession.findFirst ?? jest.fn();
prisma.user = prisma.user ?? {};
prisma.user.findMany = prisma.user.findMany ?? jest.fn();
prisma.notification = prisma.notification ?? {};
prisma.notification.createMany = prisma.notification.createMany ?? jest.fn();

import trackRouter from "../../routes/track";

const TOKEN = "abcdefghijklmnopqrstuv"; // 22 chars, base64url-shaped

const BASE_ORDER = {
  id: "ord-1",
  tenantId: "t-1",
  orderNumber: "DRB-ROYL-0001",
  vendorId: "v-1",
  status: "PICKED_UP",
  trackingToken: TOKEN,
  podPin: "1234",
  customerPhone: "+96550000001",
  dropoffLat: 29.34,
  dropoffLng: 48.09,
  scheduledAt: null,
  slaDeadline: new Date("2026-07-20T11:00:00Z"),
  assignedAt: new Date("2026-07-20T10:05:00Z"),
  pickedUpAt: new Date("2026-07-20T10:15:00Z"),
  deliveredAt: null,
  cancelledAt: null,
  tipKwd: null,
  vendor: { name: "Royal Pharmacy", nameAr: "صيدلية رويال" },
  driver: { id: "drv-1", name: "Muhammad Iqbal", phone: "+96551111111" },
  rating: null,
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/track", trackRouter);
  return app;
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.deliveryOrder.findUnique.mockResolvedValue(BASE_ORDER);
  prisma.courierOnlineSession.findFirst.mockResolvedValue({
    lastGpsLat: 29.33,
    lastGpsLng: 48.07,
    lastGpsAt: new Date(),
  });
  prisma.user.findMany.mockResolvedValue([{ id: "u-1" }, { id: "u-2" }]);
  prisma.notification.createMany.mockResolvedValue({ count: 2 });
});

describe("GET /api/track/:token", () => {
  test("unknown token → plain 404, no enumeration signal", async () => {
    prisma.deliveryOrder.findUnique.mockResolvedValue(null);
    const res = await request(makeApp()).get(`/api/track/${TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  test("too-short token is rejected without a DB round-trip", async () => {
    const res = await request(makeApp()).get("/api/track/short");
    expect(res.status).toBe(404);
    expect(prisma.deliveryOrder.findUnique).not.toHaveBeenCalled();
  });

  test("co-branded safe subset: vendor brand + driver first name + ETA, never podPin/customerPhone", async () => {
    const res = await request(makeApp()).get(`/api/track/${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      orderNumber: "DRB-ROYL-0001",
      status: "PICKED_UP",
      vendor: { name: "Royal Pharmacy", nameAr: "صيدلية رويال" },
      driver: { firstName: "Muhammad", phone: "+96551111111" },
    });
    expect(res.body.driverPosition).toEqual({ lat: 29.33, lng: 48.07 });
    expect(typeof res.body.etaMin).toBe("number");
    expect(res.body.etaMin).toBeGreaterThanOrEqual(1);
    // The two fields that must NEVER cross this surface:
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("1234");
    expect(raw).not.toContain("+96550000001");
  });

  test("pre-assignment (DISPATCHING) exposes no driver block and no position", async () => {
    prisma.deliveryOrder.findUnique.mockResolvedValue({
      ...BASE_ORDER,
      status: "DISPATCHING",
      driver: null,
    });
    const res = await request(makeApp()).get(`/api/track/${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.driver).toBeNull();
    expect(res.body.driverPosition).toBeNull();
    expect(res.body.canCancel).toBe(true);
  });

  test("DELIVERED exposes rated/tip flags and canCancel=false", async () => {
    prisma.deliveryOrder.findUnique.mockResolvedValue({
      ...BASE_ORDER,
      status: "DELIVERED",
      deliveredAt: new Date(),
      tipKwd: { toFixed: () => "0.500" },
      rating: { id: "r-1" },
    });
    const res = await request(makeApp()).get(`/api/track/${TOKEN}`);
    expect(res.body).toMatchObject({
      status: "DELIVERED",
      tipKwd: "0.500",
      rated: true,
      canCancel: false,
    });
    // Driver phone is withdrawn after delivery.
    expect(res.body.driver).toBeNull();
  });
});

describe("POST /api/track/:token/cancel", () => {
  test("pre-pickup: raises an OPS_TODO notification for supervisors, does NOT cancel the order", async () => {
    prisma.deliveryOrder.findUnique.mockResolvedValue({ ...BASE_ORDER, status: "ASSIGNED" });

    const res = await request(makeApp())
      .post(`/api/track/${TOKEN}/cancel`)
      .send({ reason: "ordered by mistake" });

    expect(res.status).toBe(200);
    const rows = prisma.notification.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      tenantId: "t-1",
      type: "CUSTOMER_CANCEL_REQUEST",
      category: "OPS_TODO",
      severity: "HIGH",
    });
    // The order row itself is untouched.
    expect(prisma.deliveryOrder.updateMany ?? jest.fn()).not.toHaveBeenCalled();
  });

  test("409 after pickup — the customer can no longer request cancellation here", async () => {
    prisma.deliveryOrder.findUnique.mockResolvedValue({ ...BASE_ORDER, status: "PICKED_UP" });
    const res = await request(makeApp()).post(`/api/track/${TOKEN}/cancel`).send({});
    expect(res.status).toBe(409);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  test("unknown token → 404, nothing raised", async () => {
    prisma.deliveryOrder.findUnique.mockResolvedValue(null);
    const res = await request(makeApp()).post(`/api/track/${TOKEN}/cancel`).send({});
    expect(res.status).toBe(404);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
