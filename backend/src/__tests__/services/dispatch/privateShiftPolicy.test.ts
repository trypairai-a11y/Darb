// Darb 2.0 revision 24 (#9) — private shifts in dispatch.
//
// "The priority of orders will go first to private shift drivers; if none are
// available, the per-order drivers will take the orders", and a driver on a
// private shift works that shop's orders only.
//
// The rule is pinned twice: the pure partition, and through selectCandidates
// itself with the same stub house pattern fleetCostPolicy.test.ts uses, so a
// later edit to the candidate query cannot quietly drop the hook.

import { getMockPrisma, resetAllMocks } from "../../setup";
import { Prisma } from "../../../generated/prisma";

const prisma = getMockPrisma();

prisma.deliveryOrder = prisma.deliveryOrder ?? {};
for (const fn of ["findFirst", "findMany", "create", "updateMany", "groupBy", "count"]) {
  prisma.deliveryOrder[fn] = prisma.deliveryOrder[fn] ?? jest.fn();
}
prisma.dispatchOffer = prisma.dispatchOffer ?? {};
for (const fn of ["findFirst", "findMany", "findUnique", "create", "updateMany", "upsert"]) {
  prisma.dispatchOffer[fn] = prisma.dispatchOffer[fn] ?? jest.fn();
}
prisma.fulfillmentSettings = prisma.fulfillmentSettings ?? {};
prisma.fulfillmentSettings.findUnique = prisma.fulfillmentSettings.findUnique ?? jest.fn();
prisma.courierOnlineSession.findMany = prisma.courierOnlineSession.findMany ?? jest.fn();
prisma.courierOnlineSession.count = prisma.courierOnlineSession.count ?? jest.fn();
prisma.user = prisma.user ?? {};
prisma.user.findMany = prisma.user.findMany ?? jest.fn();
// Attached for this suite only, never in the shared stub (see CLAUDE.md).
const privateShiftDelegate = { findMany: jest.fn() };

jest.mock("../../../services/wallet/walletService", () => ({
  isDriverOverCeiling: jest.fn().mockResolvedValue(false),
}));
jest.mock("../../../queues/dispatchQueue", () => ({
  enqueueDispatchStart: jest.fn().mockResolvedValue(undefined),
  enqueueDispatchNext: jest.fn().mockResolvedValue(undefined),
  scheduleOfferExpiry: jest.fn().mockResolvedValue(undefined),
  removeOfferExpiryJob: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../services/foodics/writebackHook", () => ({
  enqueueFoodicsWriteback: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../services/customerMessagingService", () => ({
  fireCustomerMilestone: jest.fn(),
}));
jest.mock("../../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockReturnValue(() => {}),
}));

const { selectCandidates } = require("../../../services/dispatch/dispatchEngine");
const { partitionForOrder } = require("../../../services/dispatch/privateShiftPolicy");

const TENANT = "t-1";
const D = (v: string | number) => new Prisma.Decimal(v);
const PICKUP = { lat: 29.3759, lng: 47.9774 };

const ORDER = {
  id: "ord-1",
  tenantId: TENANT,
  orderNumber: "DRB-BRGB-0001",
  vendorId: "v-shop",
  branchId: "br-salmiya",
  status: "DISPATCHING",
  offerRound: 0,
  paymentMethod: "PREPAID",
  orderTotalKwd: D("5.000"),
  deliveryFeeKwd: D("1.250"),
  distanceKm: D("3.000"),
  requiresCarOnly: false,
  pickupZoneId: "z-sal",
  dropoffZoneId: "z-sal",
  branch: { name: "Salmiya", lat: D(String(PICKUP.lat)), lng: D(String(PICKUP.lng)) },
  dropoffZone: { code: "SAL", name: "Salmiya" },
};

function mkSession(driverId: string, latOffset: number) {
  return {
    driverId,
    startTime: new Date(Date.now() - 3_600_000),
    lastGpsAt: new Date(Date.now() - 30_000),
    lastGpsLat: D(String(PICKUP.lat + latOffset)),
    lastGpsLng: D(String(PICKUP.lng)),
    driver: {
      id: driverId,
      name: `Driver ${driverId}`,
      phone: "+96550000001",
      status: "ACTIVE",
      vehicleType: "MOTORCYCLE",
      expoPushToken: null,
      throttledUntil: null,
      fleetPartnerId: null,
    },
  };
}

function prime(sessions: unknown[], duties: unknown[], busy: unknown[] = []) {
  prisma.deliveryOrder.findFirst.mockResolvedValue(ORDER);
  prisma.fulfillmentSettings.findUnique.mockResolvedValue(null);
  prisma.courierOnlineSession.findMany.mockResolvedValue(sessions);
  prisma.courierOnlineSession.count.mockResolvedValue(sessions.length);
  prisma.dispatchOffer.findMany.mockResolvedValue([]);
  prisma.deliveryOrder.groupBy.mockResolvedValue([]);
  prisma.deliveryOrder.findMany.mockResolvedValue(busy);
  prisma.fleetPartner.findMany.mockResolvedValue([]);
  privateShiftDelegate.findMany.mockResolvedValue(duties);
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.privateShift = privateShiftDelegate;
});
afterAll(() => {
  delete prisma.privateShift;
});

describe("partitionForOrder (pure)", () => {
  const order = { vendorId: "v-shop", branchId: "br-salmiya" };

  test("a running shift at this branch goes first", () => {
    const p = partitionForOrder(order, [
      { driverId: "d1", vendorId: "v-shop", branchId: "br-salmiya", status: "IN_PROGRESS" },
    ]);
    expect([...p.priority]).toEqual(["d1"]);
    expect(p.exclude.size).toBe(0);
  });

  test("another shop's private driver, or this shop's other branch, is fenced out", () => {
    const p = partitionForOrder(order, [
      { driverId: "d2", vendorId: "v-other", branchId: "br-x", status: "IN_PROGRESS" },
      { driverId: "d3", vendorId: "v-shop", branchId: "br-hawally", status: "IN_PROGRESS" },
      { driverId: "d4", vendorId: "v-other", branchId: "br-x", status: "BOOKED" },
    ]);
    expect([...p.exclude].sort()).toEqual(["d2", "d3", "d4"]);
    expect(p.priority.size).toBe(0);
  });

  test("booked here but not started yet: not fenced, not first", () => {
    const p = partitionForOrder(order, [
      { driverId: "d5", vendorId: "v-shop", branchId: "br-salmiya", status: "BOOKED" },
    ]);
    expect(p.exclude.size).toBe(0);
    expect(p.priority.size).toBe(0);
  });
});

describe("selectCandidates with private shifts", () => {
  test("the shop's private-shift driver ranks first even when another driver is nearer", async () => {
    prime(
      [mkSession("d-near", 0.002), mkSession("d-private", 0.02)],
      [{ driverId: "d-private", vendorId: "v-shop", branchId: "br-salmiya", status: "IN_PROGRESS" }],
    );
    const candidates = await selectCandidates(TENANT, "ord-1");
    expect(candidates.map((c: any) => c.driverId)).toEqual(["d-private", "d-near"]);
    // The flag never leaks onto the candidate the engine hands on.
    expect(candidates[0]).not.toHaveProperty("privateShift");
  });

  test("another shop's private-shift driver is never offered this order", async () => {
    prime(
      [mkSession("d-elsewhere", 0.001), mkSession("d-normal", 0.02)],
      [{ driverId: "d-elsewhere", vendorId: "v-other", branchId: "br-x", status: "IN_PROGRESS" }],
    );
    const candidates = await selectCandidates(TENANT, "ord-1");
    expect(candidates.map((c: any) => c.driverId)).toEqual(["d-normal"]);
  });

  test("no private driver free: the per-order drivers take it, nearest first", async () => {
    prime(
      [mkSession("d-a", 0.01), mkSession("d-b", 0.002), mkSession("d-private", 0.0005)],
      [{ driverId: "d-private", vendorId: "v-shop", branchId: "br-salmiya", status: "IN_PROGRESS" }],
      // The private driver is out on a delivery still to be collected.
      [{ driverId: "d-private", status: "ASSIGNED", dropoffLat: null, dropoffLng: null }],
    );
    const candidates = await selectCandidates(TENANT, "ord-1");
    expect(candidates.map((c: any) => c.driverId)).toEqual(["d-b", "d-a"]);
  });

  test("a failing lookup dispatches exactly as before (fails open)", async () => {
    prime([mkSession("d-a", 0.01), mkSession("d-b", 0.002)], []);
    privateShiftDelegate.findMany.mockRejectedValue(new Error("db down"));
    const candidates = await selectCandidates(TENANT, "ord-1");
    expect(candidates.map((c: any) => c.driverId)).toEqual(["d-b", "d-a"]);
  });
});
