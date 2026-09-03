// Darb 2.0 — driver agent API route tests (plan §A9).
//
// Device-token auth is primed through prisma.device.findUnique (the resolver
// in routes/agent.ts). Engine/order-service/wallet collaborators are mocked
// at the module boundary; the order state machine runs REAL for the
// PICKED_UP transition so the guarded updateMany is exercised.

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";
import { Prisma } from "../../generated/prisma";

const prisma = getMockPrisma();

// Attach Darb 2.0 delegates the shared mock doesn't know about yet.
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
for (const fn of ["findFirst", "findMany", "updateMany", "create"]) {
  prisma.deliveryOrder[fn] = prisma.deliveryOrder[fn] ?? jest.fn();
}
prisma.dispatchOffer = prisma.dispatchOffer ?? {};
for (const fn of ["findFirst", "updateMany", "create"]) {
  prisma.dispatchOffer[fn] = prisma.dispatchOffer[fn] ?? jest.fn();
}
prisma.incident = prisma.incident ?? {};
for (const fn of ["create", "findFirst"]) {
  prisma.incident[fn] = prisma.incident[fn] ?? jest.fn();
}

jest.mock("../../services/wallet/walletService", () => ({
  getDriverWalletSummary: jest.fn(),
  isDriverOverCeiling: jest.fn().mockResolvedValue(false),
}));
jest.mock("../../services/orderService", () => ({
  completeDelivery: jest.fn(),
  failDelivery: jest.fn(),
}));
jest.mock("../../services/dispatch/dispatchEngine", () => {
  const actual = jest.requireActual("../../services/dispatch/dispatchEngine");
  return {
    OfferGoneError: actual.OfferGoneError,
    acceptOffer: jest.fn(),
    declineOffer: jest.fn(),
  };
});
jest.mock("../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockReturnValue(() => {}),
}));
jest.mock("../../services/foodics/writebackHook", () => ({
  enqueueFoodicsWriteback: jest.fn().mockResolvedValue(undefined),
}));
// Revision 16 (#5): going ONLINE is checked against the driver's assigned area.
jest.mock("../../services/zoneService", () => ({
  resolveZone: jest.fn().mockResolvedValue(null),
  invalidateZoneCache: jest.fn(),
}));

const {
  getDriverWalletSummary,
  isDriverOverCeiling,
} = require("../../services/wallet/walletService");
const { completeDelivery, failDelivery } = require("../../services/orderService");
const {
  acceptOffer,
  declineOffer,
  OfferGoneError,
} = require("../../services/dispatch/dispatchEngine");
const { publishEvent } = require("../../services/eventBus") as { publishEvent: jest.Mock };
const { enqueueFoodicsWriteback } = require("../../services/foodics/writebackHook");

const agentDeliveryRouter = require("../../routes/agentDelivery").default;

const app = express();
app.use(express.json());
app.use("/api/agent", agentDeliveryRouter);

const TENANT = "t-1";
const DRIVER = {
  id: "drv-1",
  tenantId: TENANT,
  name: "Qadir Baloch",
  phone: "+96550000001",
  company: { id: "c-1", name: "Osama Fleet" },
  supervisor: null,
  assignedVehicle: null,
  sims: [],
  device: null,
};
const DEVICE = {
  id: "dev-1",
  sims: [],
  lastLatitude: 29.3759,
  lastLongitude: 47.9774,
  lastSeen: new Date(),
  driver: DRIVER,
};

const D = (v: string | number) => new Prisma.Decimal(v);

const ORDER_ROW = {
  id: "ord-1",
  tenantId: TENANT,
  orderNumber: "DRB-BRGB-0001",
  vendorId: "v-1",
  driverId: "drv-1",
  status: "ASSIGNED",
  paymentMethod: "COD",
  orderTotalKwd: D("5.000"),
  deliveryFeeKwd: D("1.750"),
  customerPhone: "+96551111111",
  dropoffAddress: "Block 4, Salmiya",
  dropoffLat: D("29.3330"),
  dropoffLng: D("48.0700"),
  slaDeadline: new Date("2026-07-19T12:00:00.000Z"),
  podPin: "1234",
  metadata: null as unknown,
  branch: {
    name: "BRGB Salmiya",
    address: "Salem Al Mubarak St",
    phone: "+96522223333",
    lat: D("29.3759"),
    lng: D("47.9774"),
  },
  pickupZone: { code: "KWC", name: "Kuwait City" },
  dropoffZone: { code: "SAL", name: "Salmiya" },
};

const WALLET_SUMMARY = {
  cashOnHandKwd: "12.500",
  ceilingKwd: "100.000",
  todayCollectedKwd: "5.000",
  blocked: false,
  remittances: [],
};

function auth(req: request.Test): request.Test {
  return req.set("Authorization", "Bearer dev-1");
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  prisma.device.findUnique.mockResolvedValue(DEVICE);
  (getDriverWalletSummary as jest.Mock).mockResolvedValue({ ...WALLET_SUMMARY });
  (isDriverOverCeiling as jest.Mock).mockResolvedValue(false);
  prisma.tenant.findUnique.mockResolvedValue({ settings: { supervisorPhone: "+96599990000" } });
  prisma.courierOnlineSession.findFirst.mockResolvedValue(null);
  prisma.dispatchOffer.findFirst.mockResolvedValue(null);
  prisma.deliveryOrder.findFirst.mockResolvedValue(null);
  prisma.orderEvent.findFirst.mockResolvedValue(null);
  prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
});

// ─── GET /state ─────────────────────────────────────────────────────────────

describe("GET /api/agent/state", () => {
  test("composes availability + activeOffer + wallet numbers + supervisorPhone", async () => {
    prisma.courierOnlineSession.findFirst.mockResolvedValue({ availability: "ONLINE" });
    const expiresAt = new Date(Date.now() + 12_000);
    prisma.dispatchOffer.findFirst.mockResolvedValue({
      id: "off-1",
      orderId: "ord-1",
      distanceKm: 1.2,
      expiresAt,
      order: { ...ORDER_ROW, status: "DISPATCHING", driverId: null },
    });

    const res = await auth(request(app).get("/api/agent/state"));

    expect(res.status).toBe(200);
    // driverCode joined the payload with the Home profile card (revision 15)
    // and this assertion was not moved with it.
    expect(res.body.driver).toEqual({
      id: "drv-1",
      name: "Qadir Baloch",
      phone: "+96550000001",
      driverCode: null,
    });
    expect(res.body.availability).toBe("ONLINE");
    expect(res.body.lockout).toBeNull();
    expect(res.body.activeOffer).toMatchObject({
      offerId: "off-1",
      orderId: "ord-1",
      pickup: { name: "BRGB Salmiya", lat: 29.3759, lng: 47.9774, area: "Kuwait City" },
      dropoff: { zone: "SAL", area: "Salmiya" },
      distanceKm: 1.2,
      feeKwd: 1.75,
      codAmountKwd: 5,
      expiresAt: expiresAt.toISOString(),
    });
    expect(typeof res.body.activeOffer.serverNow).toBe("string");
    expect(res.body.activeOrder).toBeNull();
    expect(res.body.wallet).toEqual({ cashOnHandKwd: 12.5, ceilingKwd: 100, todayCollectedKwd: 5 });
    expect(res.body.supervisorPhone).toBe("+96599990000");
    expect(typeof res.body.serverTime).toBe("string");
  });

  test("activeOrder carries the granular driverPhase status + podRequired", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({
      ...ORDER_ROW,
      metadata: { driverPhase: "ARRIVED_AT_PICKUP" },
    });

    const res = await auth(request(app).get("/api/agent/state"));

    expect(res.status).toBe(200);
    expect(res.body.activeOrder).toMatchObject({
      id: "ord-1",
      status: "ARRIVED_AT_PICKUP",
      pickup: { name: "BRGB Salmiya", phone: "+96522223333" },
      dropoff: { zone: "SAL", customerPhone: "+96551111111" },
      codAmountKwd: 5,
      feeKwd: 1.75,
      slaDeadline: "2026-07-19T12:00:00.000Z",
      podRequired: "PIN_OR_PHOTO",
    });
  });

  test("over-ceiling wallet surfaces the CASH_CEILING lockout", async () => {
    (getDriverWalletSummary as jest.Mock).mockResolvedValue({ ...WALLET_SUMMARY, blocked: true });

    const res = await auth(request(app).get("/api/agent/state"));
    expect(res.body.lockout).toEqual({ reason: "CASH_CEILING" });
  });

  test("unknown device → 404", async () => {
    prisma.device.findUnique.mockResolvedValue(null);
    const res = await auth(request(app).get("/api/agent/state"));
    expect(res.status).toBe(404);
  });
});

// ─── POST /availability ─────────────────────────────────────────────────────

describe("POST /api/agent/availability", () => {
  test("ONLINE while over ceiling → 409 CASH_CEILING_LOCKOUT", async () => {
    (isDriverOverCeiling as jest.Mock).mockResolvedValue(true);

    const res = await auth(request(app).post("/api/agent/availability")).send({
      availability: "ONLINE",
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "CASH_CEILING_LOCKOUT" });
    expect(prisma.courierOnlineSession.create).not.toHaveBeenCalled();
  });

  test("OFFLINE with an active ASSIGNED/PICKED_UP order → 409 ACTIVE_ORDER", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ id: "ord-1" });

    const res = await auth(request(app).post("/api/agent/availability")).send({
      availability: "OFFLINE",
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "ACTIVE_ORDER" });
  });

  test("ONLINE creates a session (availability + isOnline) and publishes driver.online", async () => {
    prisma.courierOnlineSession.create.mockResolvedValue({ id: "sess-1" });

    const res = await auth(request(app).post("/api/agent/availability")).send({
      availability: "ONLINE",
    });

    expect(res.status).toBe(200);
    // The warning rides along because this driver has no assigned area. It is
    // a warning and not a refusal on purpose: the zone gate fails OPEN, so a
    // driver Darb has not rostered anywhere still gets to work.
    expect(res.body).toEqual({
      ok: true,
      availability: "ONLINE",
      warning: "NO_ZONE_ASSIGNED",
    });
    const created = prisma.courierOnlineSession.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      tenantId: TENANT,
      driverId: "drv-1",
      isOnline: true,
      availability: "ONLINE",
    });
    const online = publishEvent.mock.calls.filter((c) => c[0]?.type === "driver.online");
    expect(online).toHaveLength(1);
    expect(online[0][0].tenantId).toBe(TENANT);
  });

  /**
   * The zone gate (client request, revision 16 #5).
   *
   * The client asked that a driver "cannot log in outside his zone". There is
   * no login to gate: the app enrols once and keeps its token, so the check
   * lives on going ONLINE, which is the moment that actually means "I am here
   * and ready" and the one dispatch reads.
   *
   * It fails OPEN by decision. A driver who cannot be located still gets to
   * work, because the gate exists to stop somebody working a different area,
   * not to strand a driver whose signal dropped in a basement car park. These
   * four cases are the whole contract, and the fail-open ones matter more than
   * the refusal: a bug there costs somebody a day's earnings.
   */
  describe("the assigned-area gate on going ONLINE", () => {
    const { resolveZone } = require("../../services/zoneService");
    const ZONED_DEVICE = {
      ...DEVICE,
      driver: { ...DRIVER, assignedZoneId: "z-1" },
    };

    beforeEach(() => {
      // Not on the shared mock; attached per the house pattern.
      (prisma as any).deliveryZone = { findFirst: jest.fn().mockResolvedValue(null) };
    });

    test("a driver standing in another area is refused, and told which", async () => {
      prisma.device.findUnique.mockResolvedValue(ZONED_DEVICE);
      resolveZone.mockResolvedValue({ id: "z-9", name: "Hawally" });
      prisma.deliveryZone.findFirst.mockResolvedValue({ name: "Salmiya" });

      const res = await auth(request(app).post("/api/agent/availability")).send({
        availability: "ONLINE",
        latitude: 29.33,
        longitude: 48.06,
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("OUTSIDE_ZONE");
      // Naming both ends is what makes this actionable rather than a wall.
      expect(res.body.assignedZone).toBe("Salmiya");
      expect(res.body.currentZone).toBe("Hawally");
      expect(prisma.courierOnlineSession.create).not.toHaveBeenCalled();
    });

    test("a driver standing in their own area goes online clean", async () => {
      prisma.device.findUnique.mockResolvedValue(ZONED_DEVICE);
      resolveZone.mockResolvedValue({ id: "z-1", name: "Salmiya" });
      prisma.courierOnlineSession.create.mockResolvedValue({ id: "sess-1" });

      const res = await auth(request(app).post("/api/agent/availability")).send({
        availability: "ONLINE",
        latitude: 29.33,
        longitude: 48.06,
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, availability: "ONLINE" });
    });

    test("no coordinates lets the driver through with a warning, never a refusal", async () => {
      prisma.device.findUnique.mockResolvedValue(ZONED_DEVICE);
      prisma.courierOnlineSession.create.mockResolvedValue({ id: "sess-1" });

      const res = await auth(request(app).post("/api/agent/availability")).send({
        availability: "ONLINE",
      });

      expect(res.status).toBe(200);
      expect(res.body.warning).toBe("NO_LOCATION");
      expect(resolveZone).not.toHaveBeenCalled();
    });

    test("a fix outside every zone is a warning, not proof of being in the wrong place", async () => {
      prisma.device.findUnique.mockResolvedValue(ZONED_DEVICE);
      // Zone polygons do not tile the country, so the edge of one is a normal
      // place to stand and must not read as "somewhere else".
      resolveZone.mockResolvedValue(null);
      prisma.courierOnlineSession.create.mockResolvedValue({ id: "sess-1" });

      const res = await auth(request(app).post("/api/agent/availability")).send({
        availability: "ONLINE",
        latitude: 29.9,
        longitude: 47.5,
      });

      expect(res.status).toBe(200);
      expect(res.body.warning).toBe("LOCATION_OUTSIDE_ANY_ZONE");
    });
  });

  test("OFFLINE closes the open session and publishes driver.offline", async () => {
    prisma.courierOnlineSession.findFirst.mockResolvedValue({ id: "sess-1" });
    prisma.courierOnlineSession.update.mockResolvedValue({});

    const res = await auth(request(app).post("/api/agent/availability")).send({
      availability: "OFFLINE",
    });

    expect(res.status).toBe(200);
    const updated = prisma.courierOnlineSession.update.mock.calls[0][0];
    expect(updated.data).toMatchObject({ availability: "OFFLINE", isOnline: false });
    expect(updated.data.endTime).toBeInstanceOf(Date);
    expect(publishEvent.mock.calls.some((c) => c[0]?.type === "driver.offline")).toBe(true);
  });

  test("invalid value → 400", async () => {
    const res = await auth(request(app).post("/api/agent/availability")).send({
      availability: "NAPPING",
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /offers/:id/accept + /reject ──────────────────────────────────────

describe("POST /api/agent/offers/:id/accept", () => {
  test("200 with the activeOrder shape + serverTime", async () => {
    prisma.dispatchOffer.findFirst.mockResolvedValue({ id: "off-1" });
    (acceptOffer as jest.Mock).mockResolvedValue({ order: { ...ORDER_ROW } });
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...ORDER_ROW });

    const res = await auth(request(app).post("/api/agent/offers/off-1/accept"));

    expect(res.status).toBe(200);
    expect(acceptOffer).toHaveBeenCalledWith({
      tenantId: TENANT,
      offerId: "off-1",
      driverId: "drv-1",
    });
    expect(res.body.order).toMatchObject({ id: "ord-1", status: "ASSIGNED" });
    expect(typeof res.body.serverTime).toBe("string");
  });

  test("expired/lost offer → 410 OFFER_EXPIRED", async () => {
    prisma.dispatchOffer.findFirst.mockResolvedValue({ id: "off-1" });
    (acceptOffer as jest.Mock).mockRejectedValue(new OfferGoneError("off-1"));

    const res = await auth(request(app).post("/api/agent/offers/off-1/accept"));

    expect(res.status).toBe(410);
    expect(res.body).toEqual({ error: "OFFER_EXPIRED" });
  });

  test("unknown offer / another driver's offer → 404, engine never called", async () => {
    prisma.dispatchOffer.findFirst.mockResolvedValue(null);

    const res = await auth(request(app).post("/api/agent/offers/off-x/accept"));

    expect(res.status).toBe(404);
    expect(acceptOffer).not.toHaveBeenCalled();
  });
});

describe("POST /api/agent/offers/:id/reject", () => {
  test("always 200 {ok:true}; reason forwarded to the engine", async () => {
    (declineOffer as jest.Mock).mockResolvedValue(undefined);

    const res = await auth(request(app).post("/api/agent/offers/off-1/reject")).send({
      reason: "too far",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(declineOffer).toHaveBeenCalledWith({
      tenantId: TENANT,
      offerId: "off-1",
      driverId: "drv-1",
      reason: "too far",
    });
  });
});

// ─── POST /orders/:id/status ────────────────────────────────────────────────

describe("POST /api/agent/orders/:id/status", () => {
  test("milestone (HEADING_TO_PICKUP) appends an OrderEvent + persists driverPhase", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...ORDER_ROW });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/status")).send({
      status: "HEADING_TO_PICKUP",
      occurredAt: new Date().toISOString(),
      idempotencyKey: "k-1",
      lat: 29.37,
      lng: 47.97,
    });

    expect(res.status).toBe(200);
    const event = prisma.orderEvent.create.mock.calls[0][0].data;
    expect(event).toMatchObject({
      tenantId: TENANT,
      orderId: "ord-1",
      action: "driver.heading_to_pickup",
      operatorId: "drv-1",
    });
    expect(event.metadata).toMatchObject({ idempotencyKey: "k-1", phase: "HEADING_TO_PICKUP" });
    const metaUpdate = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(metaUpdate.data.metadata).toMatchObject({ driverPhase: "HEADING_TO_PICKUP" });
  });

  test("idempotent replay (same idempotencyKey) → 200 no-op", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...ORDER_ROW });
    prisma.orderEvent.findFirst.mockResolvedValue({ id: "evt-existing" });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/status")).send({
      status: "HEADING_TO_PICKUP",
      idempotencyKey: "k-1",
    });

    expect(res.status).toBe(200);
    expect(res.body.replay).toBe(true);
    expect(prisma.orderEvent.create).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
  });

  test("going backwards (HEADING_TO_PICKUP after ARRIVED_AT_PICKUP) → 409", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({
      ...ORDER_ROW,
      metadata: { driverPhase: "ARRIVED_AT_PICKUP" },
    });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/status")).send({
      status: "HEADING_TO_PICKUP",
      idempotencyKey: "k-2",
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "ORDER_STATE_CONFLICT" });
  });

  test("drop-off milestone while still ASSIGNED → 409 (coarse-status guard)", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...ORDER_ROW });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/status")).send({
      status: "HEADING_TO_DROPOFF",
      idempotencyKey: "k-3",
    });

    expect(res.status).toBe(409);
  });

  test("PICKED_UP runs the real FSM transition (guarded ASSIGNED→PICKED_UP + writeback)", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...ORDER_ROW });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/status")).send({
      status: "PICKED_UP",
      occurredAt: new Date().toISOString(),
      idempotencyKey: "k-4",
    });

    expect(res.status).toBe(200);
    const transition = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(transition.where).toEqual({ id: "ord-1", tenantId: TENANT, status: "ASSIGNED" });
    expect(transition.data.status).toBe("PICKED_UP");
    expect(transition.data.pickedUpAt).toBeInstanceOf(Date);
    expect(transition.data.metadata).toMatchObject({ driverPhase: "PICKED_UP" });
    expect(enqueueFoodicsWriteback).toHaveBeenCalledWith("ord-1", "PICKED_UP");
    expect(publishEvent.mock.calls.some((c) => c[0]?.type === "order.picked_up")).toBe(true);
  });

  test("PICKED_UP losing the guarded update (already picked up elsewhere) → 409", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...ORDER_ROW });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 0 });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/status")).send({
      status: "PICKED_UP",
      idempotencyKey: "k-5",
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "ORDER_STATE_CONFLICT" });
  });

  test("order not owned by this driver → 404", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(null);

    const res = await auth(request(app).post("/api/agent/orders/ord-9/status")).send({
      status: "HEADING_TO_PICKUP",
      idempotencyKey: "k-6",
    });

    expect(res.status).toBe(404);
  });
});

// ─── POST /orders/:id/pod ───────────────────────────────────────────────────

describe("POST /api/agent/orders/:id/pod", () => {
  const PICKED_UP_ORDER = { ...ORDER_ROW, status: "PICKED_UP", metadata: { driverPhase: "ARRIVED_AT_DROPOFF" } };

  test("PIN mismatch → 422 with attemptsLeft, attempts persisted on order.metadata", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...PICKED_UP_ORDER });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/pod")).send({
      method: "PIN",
      pin: "0000",
      lat: 29.33,
      lng: 48.07,
      idempotencyKey: "pod-1",
    });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "PIN_MISMATCH", attemptsLeft: 2 });
    const update = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(update.data.metadata).toMatchObject({ pinAttempts: 1 });
    expect(completeDelivery).not.toHaveBeenCalled();
  });

  test("third mismatch → attemptsLeft 0 with the force-photo message", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({
      ...PICKED_UP_ORDER,
      metadata: { pinAttempts: 2 },
    });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/pod")).send({
      method: "PIN",
      pin: "0000",
      lat: 29.33,
      lng: 48.07,
      idempotencyKey: "pod-2",
    });

    expect(res.status).toBe(422);
    expect(res.body.attemptsLeft).toBe(0);
    expect(res.body.message).toMatch(/photo/i);
  });

  test("after 3 misses even the CORRECT pin is refused (photo forced)", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({
      ...PICKED_UP_ORDER,
      metadata: { pinAttempts: 3 },
    });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/pod")).send({
      method: "PIN",
      pin: "1234",
      lat: 29.33,
      lng: 48.07,
      idempotencyKey: "pod-3",
    });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "PIN_MISMATCH", attemptsLeft: 0 });
    expect(completeDelivery).not.toHaveBeenCalled();
  });

  test("correct PIN → completeDelivery (atomic FSM+wallet) → 200 {order, wallet} + POD event", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...PICKED_UP_ORDER });
    (completeDelivery as jest.Mock).mockResolvedValue({
      order: { ...PICKED_UP_ORDER, status: "DELIVERED", codCollectedKwd: D("5.000") },
    });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/pod")).send({
      method: "PIN",
      pin: "1234",
      codCollectedKwd: "5.000",
      lat: 29.33,
      lng: 48.07,
      idempotencyKey: "pod-4",
    });

    expect(res.status).toBe(200);
    expect(completeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        orderId: "ord-1",
        codCollectedKwd: "5.000",
        podMethod: "PIN",
      }),
    );
    expect(res.body.order.status).toBe("DELIVERED");
    expect(res.body.wallet).toMatchObject({ cashOnHandKwd: "12.500" });
    const podEvent = prisma.orderEvent.create.mock.calls[0][0].data;
    expect(podEvent.action).toBe("order.pod");
    expect(podEvent.metadata).toMatchObject({ idempotencyKey: "pod-4", method: "PIN" });
  });

  test("PHOTO proof passes photoKey through as proofPhotoUrl", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...PICKED_UP_ORDER });
    (completeDelivery as jest.Mock).mockResolvedValue({
      order: { ...PICKED_UP_ORDER, status: "DELIVERED" },
    });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/pod")).send({
      method: "PHOTO",
      photoKey: "t-1/ord-1/dev-1/123.jpg",
      lat: 29.33,
      lng: 48.07,
      idempotencyKey: "pod-5",
    });

    expect(res.status).toBe(200);
    expect(completeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ proofPhotoUrl: "t-1/ord-1/dev-1/123.jpg", podMethod: "PHOTO" }),
    );
  });

  test("PHOTO without photoKey → 400", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...PICKED_UP_ORDER });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/pod")).send({
      method: "PHOTO",
      lat: 29.33,
      lng: 48.07,
      idempotencyKey: "pod-6",
    });

    expect(res.status).toBe(400);
    expect(completeDelivery).not.toHaveBeenCalled();
  });

  test("idempotent replay: already DELIVERED with the same key → 200 same shape, no re-settle", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...PICKED_UP_ORDER, status: "DELIVERED" });
    prisma.orderEvent.findFirst.mockResolvedValue({ id: "evt-pod" });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/pod")).send({
      method: "PIN",
      pin: "1234",
      lat: 29.33,
      lng: 48.07,
      idempotencyKey: "pod-4",
    });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("DELIVERED");
    expect(res.body.wallet).toBeDefined();
    expect(completeDelivery).not.toHaveBeenCalled();
  });

  test("DELIVERED with a DIFFERENT key → 409", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...PICKED_UP_ORDER, status: "DELIVERED" });
    prisma.orderEvent.findFirst.mockResolvedValue(null);

    const res = await auth(request(app).post("/api/agent/orders/ord-1/pod")).send({
      method: "PIN",
      pin: "1234",
      lat: 29.33,
      lng: 48.07,
      idempotencyKey: "pod-other",
    });

    expect(res.status).toBe(409);
  });
});

// ─── POST /orders/:id/failed + GET /wallet ──────────────────────────────────

describe("POST /api/agent/orders/:id/failed", () => {
  test("delegates to failDelivery with the driver actor", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...ORDER_ROW });
    (failDelivery as jest.Mock).mockResolvedValue({ id: "ord-1", status: "FAILED" });

    const res = await auth(request(app).post("/api/agent/orders/ord-1/failed")).send({
      reason: "customer unreachable",
    });

    expect(res.status).toBe(200);
    expect(failDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        orderId: "ord-1",
        reason: "customer unreachable",
        actor: expect.objectContaining({ type: "DRIVER", id: "drv-1" }),
      }),
    );
    expect(res.body.order.status).toBe("FAILED");
  });

  test("missing reason → 400", async () => {
    const res = await auth(request(app).post("/api/agent/orders/ord-1/failed")).send({});
    expect(res.status).toBe(400);
  });
});

describe("GET /api/agent/wallet", () => {
  test("returns the wallet summary + lockout flag", async () => {
    (getDriverWalletSummary as jest.Mock).mockResolvedValue({ ...WALLET_SUMMARY, blocked: true });

    const res = await auth(request(app).get("/api/agent/wallet"));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      cashOnHandKwd: "12.500",
      ceilingKwd: "100.000",
      lockout: { reason: "CASH_CEILING" },
    });
  });
});

// ─── Incidents ──────────────────────────────────────────────────────────────

describe("POST /api/agent/incidents", () => {
  test("BREAKDOWN maps to VEHICLE_BREAKDOWN severity HIGH; sos.raised published", async () => {
    prisma.incident.create.mockResolvedValue({ id: "inc-1", status: "OPEN" });
    // Client note (2026-08-31): the emergency workflow only runs for a driver
    // carrying an order, so this test now gives them one.
    prisma.deliveryOrder.findFirst.mockResolvedValue({ id: "ord-1" });

    const res = await auth(request(app).post("/api/agent/incidents")).send({
      category: "BREAKDOWN",
      note: "flat tire",
      latitude: 29.33,
      longitude: 48.07,
      accuracy: 12,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "inc-1", status: "OPEN", supervisorPhone: "+96599990000" });
    const created = prisma.incident.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      tenantId: TENANT,
      type: "VEHICLE_BREAKDOWN",
      severity: "HIGH",
      driverId: "drv-1",
      description: "flat tire",
      reportedVia: "AGENT_APP",
    });
    const sos = publishEvent.mock.calls.filter((c) => c[0]?.type === "sos.raised");
    expect(sos).toHaveLength(1);
    expect(sos[0][0].payload).toMatchObject({ incidentId: "inc-1", driverId: "drv-1" });
  });

  test("no active order → filed RESOLVED, driver offline, HQ not alarmed (client note 2026-08-31)", async () => {
    prisma.incident.create.mockResolvedValue({ id: "inc-3", status: "RESOLVED" });
    prisma.deliveryOrder.findFirst.mockResolvedValue(null);

    const res = await auth(request(app).post("/api/agent/incidents")).send({
      category: "BREAKDOWN",
      latitude: 29.33,
      longitude: 48.07,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "inc-3", status: "RESOLVED", wentOffline: true });
    const created = prisma.incident.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ status: "RESOLVED", type: "VEHICLE_BREAKDOWN" });
    // The whole point: no alarm reaches the Live screen.
    const sos = publishEvent.mock.calls.filter((c) => c[0]?.type === "sos.raised");
    expect(sos).toHaveLength(0);
  });

  test("unknown category defaults to SOS with severity CRITICAL", async () => {
    prisma.incident.create.mockResolvedValue({ id: "inc-2", status: "OPEN" });

    const res = await auth(request(app).post("/api/agent/incidents")).send({
      category: "SOMETHING_ELSE",
      latitude: 29.33,
      longitude: 48.07,
    });

    expect(res.status).toBe(201);
    const created = prisma.incident.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ type: "SOS", severity: "CRITICAL" });
  });

  test("out-of-range coordinates → 400", async () => {
    const res = await auth(request(app).post("/api/agent/incidents")).send({
      category: "SOS",
      latitude: 123,
      longitude: 48.07,
    });
    expect(res.status).toBe(400);
    expect(prisma.incident.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/agent/incidents/:id", () => {
  test("returns {id, status} for the driver's own incident", async () => {
    prisma.incident.findFirst.mockResolvedValue({ id: "inc-1", status: "ACKNOWLEDGED" });

    const res = await auth(request(app).get("/api/agent/incidents/inc-1"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "inc-1", status: "ACKNOWLEDGED" });
    expect(prisma.incident.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inc-1", tenantId: TENANT, driverId: "drv-1" },
      }),
    );
  });

  test("someone else's incident → 404", async () => {
    prisma.incident.findFirst.mockResolvedValue(null);
    const res = await auth(request(app).get("/api/agent/incidents/inc-9"));
    expect(res.status).toBe(404);
  });
});
