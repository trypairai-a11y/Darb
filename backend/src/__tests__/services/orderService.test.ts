// Darb 2.0 — orderService unit tests (plan §A2/§A8 orders core).
//
// House mocking pattern: moduleNameMapper folds ../config into the shared
// prisma stub; the Darb 2.0 delegates are attached in-place here (parallel-
// track safety — the shared mocks/config file is not edited). Collaborator
// services (pricing quote, wallet settlements, dispatch queue, Foodics hook,
// driver push) are jest.mock'ed at the module boundary.

import { getMockPrisma, resetAllMocks } from "../setup";
import { Prisma } from "../../generated/prisma";

const prisma = getMockPrisma();

// Attach Darb 2.0 delegates the shared mock doesn't know about yet.
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
for (const fn of ["findMany", "findFirst", "create", "updateMany", "count"]) {
  prisma.deliveryOrder[fn] = prisma.deliveryOrder[fn] ?? jest.fn();
}
prisma.dispatchOffer = prisma.dispatchOffer ?? {};
for (const fn of ["findMany", "updateMany", "upsert", "create"]) {
  prisma.dispatchOffer[fn] = prisma.dispatchOffer[fn] ?? jest.fn();
}
prisma.vendor = prisma.vendor ?? {};
for (const fn of ["findFirst", "findMany", "updateMany"]) {
  prisma.vendor[fn] = prisma.vendor[fn] ?? jest.fn();
}
prisma.vendorBranch = prisma.vendorBranch ?? {};
for (const fn of ["findFirst", "findMany"]) {
  prisma.vendorBranch[fn] = prisma.vendorBranch[fn] ?? jest.fn();
}
// The ops "order needs review" fan-out reads users and writes notifications.
prisma.user = prisma.user ?? {};
prisma.user.findMany = prisma.user.findMany ?? jest.fn();
prisma.notification = prisma.notification ?? {};
prisma.notification.createMany = prisma.notification.createMany ?? jest.fn();

jest.mock("../../services/pricingService", () => ({
  quoteDelivery: jest.fn(),
}));
jest.mock("../../services/wallet/walletService", () => ({
  postCodSettlement: jest.fn().mockResolvedValue(undefined),
  postPrepaidSettlement: jest.fn().mockResolvedValue(undefined),
  isVendorOverCreditCap: jest.fn().mockResolvedValue(false),
}));
jest.mock("../../queues/dispatchQueue", () => ({
  enqueueDispatchStart: jest.fn().mockResolvedValue(undefined),
  enqueueDispatchNext: jest.fn().mockResolvedValue(undefined),
  scheduleOfferExpiry: jest.fn().mockResolvedValue(undefined),
  removeOfferExpiryJob: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/foodics/writebackHook", () => ({
  enqueueFoodicsWriteback: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/driverAppPushService", () => ({
  sendDispatchDriverPush: jest.fn().mockResolvedValue({ pushSent: 1 }),
}));

const { quoteDelivery } = require("../../services/pricingService");
const {
  postCodSettlement,
  postPrepaidSettlement,
} = require("../../services/wallet/walletService");
const {
  enqueueDispatchStart,
  removeOfferExpiryJob,
} = require("../../queues/dispatchQueue");
const { enqueueFoodicsWriteback } = require("../../services/foodics/writebackHook");
const { sendDispatchDriverPush } = require("../../services/driverAppPushService");
const {
  createDeliveryOrder,
  completeDelivery,
  cancelOrder,
  assignDriverManually,
  SLA_PROMISE_MINUTES,
} = require("../../services/orderService");
const { OrderStateConflictError } = require("../../services/orderStateMachine");

const TENANT = "t-1";
const D = (v: string | number) => new Prisma.Decimal(v);

const VENDOR = { id: "v-1", code: "BRGB", isPaused: false, requiresCarOnly: false };
const ACTOR = { type: "USER" as const, id: "u-1", name: "sup@darb.com" };

const GOOD_QUOTE = {
  ok: true,
  pickupZoneId: "zone-a",
  dropoffZoneId: "zone-b",
  feeKwd: D("1.750"),
  pickupZone: { id: "zone-a", code: "KWC", name: "Kuwait City", nameAr: null },
  dropoffZone: { id: "zone-b", code: "SAL", name: "Salmiya", nameAr: null },
};

const CREATE_INPUT = {
  tenantId: TENANT,
  source: "VENDOR_PORTAL" as const,
  vendorId: "v-1",
  branchId: "b-1",
  paymentMethod: "COD" as const,
  orderTotalKwd: "5.000",
  customerName: "Abdullah",
  customerPhone: "+96550000001",
  dropoff: { lat: 29.33, lng: 48.07 },
  actor: ACTOR,
};

function primeHappyCreate(lastOrderNumber: string | null = null) {
  prisma.vendor.findFirst.mockResolvedValue(VENDOR);
  prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b-1" });
  quoteDelivery.mockResolvedValue(GOOD_QUOTE);

  // findFirst serves BOTH the orderNumber-sequence lookup (where.orderNumber)
  // and the post-transition re-fetch (where.id).
  prisma.deliveryOrder.findFirst.mockImplementation(async ({ where }: any) => {
    if (where.orderNumber) {
      return lastOrderNumber ? { orderNumber: lastOrderNumber } : null;
    }
    if (where.id) {
      const created = prisma.deliveryOrder.create.mock.calls[0]?.[0]?.data;
      return created
        ? { id: where.id, ...created, status: "DISPATCHING" }
        : null;
    }
    return null;
  });
  prisma.deliveryOrder.create.mockImplementation(async ({ data }: any) => ({
    id: "ord-1",
    ...data,
  }));
  prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
  prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
});

// ─── createDeliveryOrder ────────────────────────────────────────────────────

describe("createDeliveryOrder", () => {
  test("happy path: CREATED row with quote zones/fee, podPin, slaDeadline → DISPATCHING + dispatch-start + order.created", async () => {
    primeHappyCreate();
    const before = Date.now();

    const order = await createDeliveryOrder(CREATE_INPUT);

    // Row created with the quote's outputs.
    const data = prisma.deliveryOrder.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: TENANT,
      source: "VENDOR_PORTAL",
      vendorId: "v-1",
      branchId: "b-1",
      status: "CREATED",
      paymentMethod: "COD",
      pickupZoneId: "zone-a",
      dropoffZoneId: "zone-b",
      requiresCarOnly: false,
    });
    expect(data.deliveryFeeKwd.toFixed(3)).toBe("1.750");
    expect(data.orderTotalKwd.toFixed(3)).toBe("5.000");

    // orderNumber format "DRB-{vendorCode}-{seq}" (zero-padded seq).
    expect(data.orderNumber).toBe("DRB-BRGB-0001");
    expect(data.orderNumber).toMatch(/^DRB-BRGB-\d{4}$/);

    // podPin: exactly 4 digits (leading zeros allowed).
    expect(data.podPin).toMatch(/^\d{4}$/);

    // slaDeadline ≈ now + SLA_PROMISE_MINUTES.
    const sla = data.slaDeadline.getTime();
    expect(sla).toBeGreaterThanOrEqual(before + SLA_PROMISE_MINUTES * 60_000 - 1000);
    expect(sla).toBeLessThanOrEqual(Date.now() + SLA_PROMISE_MINUTES * 60_000 + 1000);

    // CREATED → DISPATCHING guarded transition.
    const transition = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(transition.where).toEqual({ id: "ord-1", tenantId: TENANT, status: "CREATED" });
    expect(transition.data.status).toBe("DISPATCHING");

    // Timeline: order.created appended.
    const actions = prisma.orderEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain("order.created");
    expect(actions).toContain("order.dispatching");

    expect(enqueueDispatchStart).toHaveBeenCalledWith("ord-1", TENANT);
    expect(order.status).toBe("DISPATCHING");
  });

  test("orderNumber increments from the tenant/vendor max (ticketNumber pattern)", async () => {
    primeHappyCreate("DRB-BRGB-0007");

    await createDeliveryOrder(CREATE_INPUT);

    const data = prisma.deliveryOrder.create.mock.calls[0][0].data;
    expect(data.orderNumber).toBe("DRB-BRGB-0008");
  });

  test("paused vendor → REJECTED VENDOR_PAUSED persisted and returned; no quote, no dispatch", async () => {
    prisma.vendor.findFirst.mockResolvedValue({ ...VENDOR, isPaused: true });
    prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b-1" });
    prisma.deliveryOrder.findFirst.mockResolvedValue(null); // seq lookup
    prisma.deliveryOrder.create.mockImplementation(async ({ data }: any) => ({
      id: "ord-r",
      ...data,
    }));
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });

    const order = await createDeliveryOrder(CREATE_INPUT);

    expect(order.status).toBe("REJECTED");
    expect(order.rejectionReason).toBe("VENDOR_PAUSED");
    expect(quoteDelivery).not.toHaveBeenCalled();
    expect(enqueueDispatchStart).not.toHaveBeenCalled();
    // Rejections persist a row — they never throw.
    const data = prisma.deliveryOrder.create.mock.calls[0][0].data;
    expect(data.status).toBe("REJECTED");
    expect(data.rejectionReason).toBe("VENDOR_PAUSED");
  });

  test("paused BRANCH → REJECTED BRANCH_PAUSED, with the shop itself still open", async () => {
    // Revision 10 (#7). One switch used to stop the whole account, so a shop
    // with a queue at one counter had to refuse orders at every other counter.
    // Its own reason, so the Needs review list names the branch that closed
    // rather than blaming the merchant.
    prisma.vendor.findFirst.mockResolvedValue({ ...VENDOR, isPaused: false });
    prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b-1", isPaused: true });
    prisma.deliveryOrder.findFirst.mockResolvedValue(null); // seq lookup
    prisma.deliveryOrder.create.mockImplementation(async ({ data }: any) => ({
      id: "ord-bp",
      ...data,
    }));
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });

    const order = await createDeliveryOrder(CREATE_INPUT);

    expect(order.status).toBe("REJECTED");
    expect(order.rejectionReason).toBe("BRANCH_PAUSED");
    expect(quoteDelivery).not.toHaveBeenCalled();
    expect(enqueueDispatchStart).not.toHaveBeenCalled();
  });

  test("an un-paused branch on an un-paused vendor is unaffected", async () => {
    // The regression that matters: every existing branch defaults to false, so
    // this ships with no backfill and nobody's intake changes.
    primeHappyCreate("DRB-BRGB-0007");
    prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b-1", isPaused: false });

    const order = await createDeliveryOrder(CREATE_INPUT);

    expect(order.rejectionReason).toBeFalsy();
    expect(quoteDelivery).toHaveBeenCalled();
  });

  test.each([
    "OUT_OF_ZONE_DROPOFF",
    "UNSERVICEABLE_PAIR",
    "NO_COORDINATES",
    "BRANCH_UNZONED",
  ])("quote rejection %s → persisted REJECTED row returned, no dispatch", async (reason) => {
    prisma.vendor.findFirst.mockResolvedValue(VENDOR);
    prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b-1" });
    quoteDelivery.mockResolvedValue({ ok: false, reason });
    prisma.deliveryOrder.findFirst.mockResolvedValue(null); // seq lookup
    prisma.deliveryOrder.create.mockImplementation(async ({ data }: any) => ({
      id: "ord-r",
      ...data,
    }));
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });

    const order = await createDeliveryOrder(CREATE_INPUT);

    expect(order.status).toBe("REJECTED");
    expect(order.rejectionReason).toBe(reason);
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled(); // no transition
    expect(enqueueDispatchStart).not.toHaveBeenCalled();
    const eventData = prisma.orderEvent.create.mock.calls[0][0].data;
    expect(eventData.action).toBe("order.rejected");
    expect(eventData.description).toContain(reason);
  });

  // "Any order that comes in, we're in the picture" — a refused order has to
  // reach ops, not wait to be noticed in the Needs review list.
  test("a refused order notifies every active ops user", async () => {
    prisma.vendor.findFirst.mockResolvedValue(VENDOR);
    prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b-1" });
    quoteDelivery.mockResolvedValue({ ok: false, reason: "OUT_OF_ZONE_DROPOFF" });
    prisma.deliveryOrder.findFirst.mockResolvedValue(null);
    prisma.deliveryOrder.create.mockImplementation(async ({ data }: any) => ({
      id: "ord-r",
      ...data,
    }));
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
    prisma.user.findMany.mockResolvedValue([{ id: "u-1" }, { id: "u-2" }]);
    prisma.notification.createMany.mockResolvedValue({ count: 2 });

    await createDeliveryOrder(CREATE_INPUT);

    const roles = prisma.user.findMany.mock.calls[0][0].where.role.in;
    expect(roles).toEqual(expect.arrayContaining(["ADMIN", "OPS_MANAGER", "SUPERVISOR"]));

    const rows = prisma.notification.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe("ORDER_NEEDS_REVIEW");
    expect(rows[0].severity).toBe("HIGH");
    expect(rows[0].category).toBe("OPS_TODO");
    // The message names the fix, not just the enum.
    expect(rows[0].message).toContain("outside every delivery zone");
    expect(rows[0].bodyAr).toBeTruthy();
    expect(rows[0].metadata.reason).toBe("OUT_OF_ZONE_DROPOFF");
  });

  test("a notification failure never costs us the REJECTED row", async () => {
    prisma.vendor.findFirst.mockResolvedValue(VENDOR);
    prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b-1" });
    quoteDelivery.mockResolvedValue({ ok: false, reason: "OUT_OF_ZONE_DROPOFF" });
    prisma.deliveryOrder.findFirst.mockResolvedValue(null);
    prisma.deliveryOrder.create.mockImplementation(async ({ data }: any) => ({
      id: "ord-r",
      ...data,
    }));
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
    prisma.user.findMany.mockRejectedValue(new Error("db down"));

    const order = await createDeliveryOrder(CREATE_INPUT);

    expect(order.status).toBe("REJECTED");
    expect(order.rejectionReason).toBe("OUT_OF_ZONE_DROPOFF");
  });

  test("unknown vendor throws (caller error, nothing persisted)", async () => {
    prisma.vendor.findFirst.mockResolvedValue(null);
    await expect(createDeliveryOrder(CREATE_INPUT)).rejects.toThrow(/Vendor .* not found/);
    expect(prisma.deliveryOrder.create).not.toHaveBeenCalled();
  });

  test("branch not belonging to the vendor throws", async () => {
    prisma.vendor.findFirst.mockResolvedValue(VENDOR);
    prisma.vendorBranch.findFirst.mockResolvedValue(null);
    await expect(createDeliveryOrder(CREATE_INPUT)).rejects.toThrow(/Branch .* not found/);
    expect(prisma.deliveryOrder.create).not.toHaveBeenCalled();
  });
});

// ─── completeDelivery ───────────────────────────────────────────────────────

const PICKED_UP_ORDER = {
  id: "ord-1",
  tenantId: TENANT,
  orderNumber: "DRB-BRGB-0001",
  vendorId: "v-1",
  branchId: "b-1",
  driverId: "drv-1",
  status: "PICKED_UP",
  paymentMethod: "COD",
  orderTotalKwd: D("5.000"),
  deliveryFeeKwd: D("1.000"),
};

describe("completeDelivery", () => {
  function primeDeliver(order: any) {
    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce(order) // initial load
      .mockResolvedValue({ ...order, status: "DELIVERED" }); // post-transition re-fetch
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
  }

  test("COD order: PICKED_UP→DELIVERED + postCodSettlement exactly once (inside the tx), prepaid NOT called", async () => {
    primeDeliver(PICKED_UP_ORDER);

    const { order } = await completeDelivery({
      tenantId: TENANT,
      orderId: "ord-1",
      actor: { type: "DRIVER", id: "drv-1", name: "Qadir" },
      codCollectedKwd: "5.000",
      podMethod: "PIN",
    });

    const transition = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(transition.where).toEqual({ id: "ord-1", tenantId: TENANT, status: "PICKED_UP" });
    expect(transition.data.status).toBe("DELIVERED");
    expect(transition.data.codCollectedKwd.toFixed(3)).toBe("5.000");

    expect(postCodSettlement).toHaveBeenCalledTimes(1);
    expect(postPrepaidSettlement).not.toHaveBeenCalled();
    const [txArg, orderArg] = postCodSettlement.mock.calls[0];
    expect(txArg).toBe(prisma); // the interactive tx client
    expect(orderArg).toMatchObject({ id: "ord-1", tenantId: TENANT, driverId: "drv-1", vendorId: "v-1" });
    expect(orderArg.orderTotalKwd.toFixed(3)).toBe("5.000");
    expect(orderArg.deliveryFeeKwd.toFixed(3)).toBe("1.000");

    expect(enqueueFoodicsWriteback).toHaveBeenCalledWith("ord-1", "DELIVERED");
    expect(order.status).toBe("DELIVERED");
  });

  test("PREPAID order: postPrepaidSettlement exactly once, COD NOT called", async () => {
    primeDeliver({ ...PICKED_UP_ORDER, paymentMethod: "PREPAID" });

    await completeDelivery({
      tenantId: TENANT,
      orderId: "ord-1",
      actor: { type: "DRIVER", id: "drv-1" },
    });

    expect(postPrepaidSettlement).toHaveBeenCalledTimes(1);
    expect(postCodSettlement).not.toHaveBeenCalled();
  });

  test("guarded-transition loss (count 0) aborts the tx — no settlement is posted", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(PICKED_UP_ORDER);
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      completeDelivery({ tenantId: TENANT, orderId: "ord-1", actor: { type: "DRIVER" } }),
    ).rejects.toThrow(OrderStateConflictError);

    expect(postCodSettlement).not.toHaveBeenCalled();
    expect(postPrepaidSettlement).not.toHaveBeenCalled();
  });
});

// ─── assignDriverManually ───────────────────────────────────────────────────

describe("assignDriverManually", () => {
  test("cancels open OFFERED offers, records ACCEPTED round -1 offer, transitions to ASSIGNED, pushes to the driver", async () => {
    const order = {
      ...PICKED_UP_ORDER,
      status: "DISPATCHING",
      driverId: null,
    };
    prisma.deliveryOrder.findFirst.mockResolvedValue(order);
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
    prisma.driver.findFirst.mockResolvedValue({ id: "drv-2", name: "Hamad" });
    prisma.dispatchOffer.findMany.mockResolvedValue([{ id: "off-1" }, { id: "off-2" }]);
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 2 });
    prisma.dispatchOffer.upsert.mockResolvedValue({ id: "off-manual" });

    await assignDriverManually({
      tenantId: TENANT,
      orderId: "ord-1",
      driverId: "drv-2",
      actor: ACTOR,
    });

    // Open offers cancelled…
    expect(prisma.dispatchOffer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, orderId: "ord-1", status: "OFFERED" },
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    // …their expiry jobs best-effort removed…
    expect(removeOfferExpiryJob).toHaveBeenCalledWith("off-1");
    expect(removeOfferExpiryJob).toHaveBeenCalledWith("off-2");

    // …manual ACCEPTED offer at round -1…
    const upsert = prisma.dispatchOffer.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({
      orderId_driverId_round: { orderId: "ord-1", driverId: "drv-2", round: -1 },
    });
    expect(upsert.create).toMatchObject({
      tenantId: TENANT,
      orderId: "ord-1",
      driverId: "drv-2",
      round: -1,
      status: "ACCEPTED",
    });

    // …guarded DISPATCHING→ASSIGNED with driverId + assignedAt…
    const transition = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(transition.where).toEqual({ id: "ord-1", tenantId: TENANT, status: "DISPATCHING" });
    expect(transition.data).toMatchObject({ status: "ASSIGNED", driverId: "drv-2" });
    expect(transition.data.assignedAt).toBeInstanceOf(Date);

    // …Expo nudge + Foodics milestone.
    expect(sendDispatchDriverPush).toHaveBeenCalledTimes(1);
    expect(sendDispatchDriverPush.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT,
      driverIds: ["drv-2"],
    });
    expect(enqueueFoodicsWriteback).toHaveBeenCalledWith("ord-1", "ASSIGNED");
  });

  test("409-style conflict when the order is not NO_DRIVER/DISPATCHING", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...PICKED_UP_ORDER, status: "DELIVERED" });

    await expect(
      assignDriverManually({ tenantId: TENANT, orderId: "ord-1", driverId: "drv-2", actor: ACTOR }),
    ).rejects.toThrow(OrderStateConflictError);
    expect(prisma.dispatchOffer.updateMany).not.toHaveBeenCalled();
  });

  test("push failure is swallowed (assignment still succeeds)", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...PICKED_UP_ORDER, status: "NO_DRIVER", driverId: null });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
    prisma.driver.findFirst.mockResolvedValue({ id: "drv-2", name: "Hamad" });
    prisma.dispatchOffer.findMany.mockResolvedValue([]);
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 0 });
    prisma.dispatchOffer.upsert.mockResolvedValue({ id: "off-manual" });
    sendDispatchDriverPush.mockRejectedValueOnce(new Error("expo down"));

    await expect(
      assignDriverManually({ tenantId: TENANT, orderId: "ord-1", driverId: "drv-2", actor: ACTOR }),
    ).resolves.toBeTruthy();
  });
});

// ─── cancelOrder ────────────────────────────────────────────────────────────

describe("cancelOrder", () => {
  test("vendor default allowFrom refuses PICKED_UP; supervisor allowFrom permits it", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValueOnce(PICKED_UP_ORDER);

    await expect(
      cancelOrder({ tenantId: TENANT, orderId: "ord-1", reason: "changed mind", actor: ACTOR }),
    ).rejects.toThrow(OrderStateConflictError);

    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce(PICKED_UP_ORDER) // initial load
      .mockResolvedValue({
        ...PICKED_UP_ORDER,
        status: "CANCELLED",
        cancelReason: "customer unreachable",
      }); // post-transition re-fetch
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
    prisma.dispatchOffer.findMany.mockResolvedValue([]);
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 0 });

    const order = await cancelOrder({
      tenantId: TENANT,
      orderId: "ord-1",
      reason: "customer unreachable",
      actor: ACTOR,
      allowFrom: ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED", "PICKED_UP"],
    });

    const transition = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(transition.where).toEqual({ id: "ord-1", tenantId: TENANT, status: "PICKED_UP" });
    expect(transition.data).toMatchObject({
      status: "CANCELLED",
      cancelReason: "customer unreachable",
    });
    expect(enqueueFoodicsWriteback).toHaveBeenCalledWith("ord-1", "CANCELLED");
    expect(order.status).toBe("CANCELLED");
  });
});

// ─── Scheduled orders (PRD §6) ──────────────────────────────────────────────

describe("scheduled orders", () => {
  const { returnToMerchant, sweepScheduledOrders, SCHEDULE_LEAD_MINUTES } =
    require("../../services/orderService");

  test("a far-future scheduledAt persists CREATED, skips dispatch, anchors slaDeadline to the schedule", async () => {
    primeHappyCreate();
    // The post-create re-fetch must reflect the row as persisted (CREATED) —
    // primeHappyCreate's default hardcodes the immediate-dispatch shape.
    prisma.deliveryOrder.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.orderNumber) return null;
      if (where.id) {
        const created = prisma.deliveryOrder.create.mock.calls[0]?.[0]?.data;
        return created ? { id: where.id, ...created } : null;
      }
      return null;
    });
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60_000); // +2h

    const order = await createDeliveryOrder({ ...CREATE_INPUT, scheduledAt });

    const data = prisma.deliveryOrder.create.mock.calls[0][0].data;
    expect(data.status).toBe("CREATED");
    expect(data.scheduledAt).toEqual(scheduledAt);
    // Promise counts from the scheduled time, not creation.
    expect(data.slaDeadline.getTime()).toBe(
      scheduledAt.getTime() + SLA_PROMISE_MINUTES * 60_000,
    );
    // No CREATED→DISPATCHING transition, no dispatch enqueue.
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
    expect(enqueueDispatchStart).not.toHaveBeenCalled();
    expect(order.status).toBe("CREATED");
  });

  test("a scheduledAt inside the lead window dispatches immediately like an unscheduled order", async () => {
    primeHappyCreate();
    const scheduledAt = new Date(Date.now() + (SCHEDULE_LEAD_MINUTES - 5) * 60_000);

    await createDeliveryOrder({ ...CREATE_INPUT, scheduledAt });

    expect(prisma.deliveryOrder.updateMany).toHaveBeenCalled();
    expect(enqueueDispatchStart).toHaveBeenCalled();
  });

  test("sweepScheduledOrders advances only due CREATED orders and enqueues dispatch", async () => {
    prisma.deliveryOrder.findMany = prisma.deliveryOrder.findMany ?? jest.fn();
    prisma.deliveryOrder.findMany.mockResolvedValue([
      { id: "ord-s1", tenantId: TENANT, orderNumber: "DRB-BRGB-0009", vendorId: "v-1", deliveryFeeKwd: D("1.250") },
    ]);
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });

    const advanced = await sweepScheduledOrders(new Date());

    expect(advanced).toBe(1);
    const guard = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(guard.where).toMatchObject({ id: "ord-s1", status: "CREATED" });
    expect(guard.data).toMatchObject({ status: "DISPATCHING" });
    expect(enqueueDispatchStart).toHaveBeenCalledWith("ord-s1", TENANT);
  });

  test("sweepScheduledOrders skips an order cancelled meanwhile (guard count 0) without failing the sweep", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([
      { id: "ord-s2", tenantId: TENANT, orderNumber: "DRB-BRGB-0010", vendorId: "v-1", deliveryFeeKwd: null },
    ]);
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 0 });

    const advanced = await sweepScheduledOrders(new Date());

    expect(advanced).toBe(0);
    expect(enqueueDispatchStart).not.toHaveBeenCalled();
  });
});

// ─── Return to merchant (PRD §6/§10) ────────────────────────────────────────

describe("returnToMerchant", () => {
  const { returnToMerchant } = require("../../services/orderService");

  const FAILED_ORDER = {
    id: "ord-1",
    tenantId: TENANT,
    orderNumber: "DRB-BRGB-0001",
    vendorId: "v-1",
    driverId: "drv-1",
    status: "FAILED",
    deliveryFeeKwd: D("1.250"),
  };

  test("FAILED→RETURNED sets returnedAt, appends the event, posts NO wallet transaction", async () => {
    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce(FAILED_ORDER) // getOrderOrThrow
      .mockResolvedValueOnce({ ...FAILED_ORDER, status: "RETURNED" }); // re-fetch
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });

    const order = await returnToMerchant({
      tenantId: TENANT,
      orderId: "ord-1",
      actor: ACTOR,
      note: "customer unreachable, pharmacy restocks",
    });

    const guard = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(guard.where).toEqual({ id: "ord-1", tenantId: TENANT, status: "FAILED" });
    expect(guard.data).toMatchObject({ status: "RETURNED" });
    expect(guard.data.returnedAt).toBeInstanceOf(Date);
    // Deliberate wallet no-op: settlement never ran for a FAILED order.
    expect(postCodSettlement).not.toHaveBeenCalled();
    expect(postPrepaidSettlement).not.toHaveBeenCalled();
    expect(order.status).toBe("RETURNED");
  });

  test("returning a DELIVERED order throws OrderStateConflictError", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValueOnce({ ...FAILED_ORDER, status: "DELIVERED" });
    // The FAILED-status guard matches no row for a DELIVERED order.
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      returnToMerchant({ tenantId: TENANT, orderId: "ord-1", actor: ACTOR }),
    ).rejects.toThrow(OrderStateConflictError);
  });
});

// ─── Tracking token (PRD §12) ───────────────────────────────────────────────

describe("tracking token", () => {
  const { generateTrackingToken } = require("../../services/orderService");

  test("every created order carries an unguessable trackingToken", async () => {
    primeHappyCreate();
    await createDeliveryOrder(CREATE_INPUT);
    const data = prisma.deliveryOrder.create.mock.calls[0][0].data;
    expect(typeof data.trackingToken).toBe("string");
    expect(data.trackingToken.length).toBeGreaterThanOrEqual(20);
  });

  test("generateTrackingToken is 128-bit random base64url and collision-free across calls", () => {
    const a = generateTrackingToken();
    const b = generateTrackingToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
