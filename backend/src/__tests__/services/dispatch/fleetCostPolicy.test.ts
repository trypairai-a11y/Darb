// Darb 2.0 revision 15 (#3) — what a delivery company costs, and what that is
// allowed to do to who gets offered the order.
//
// The rule is invisible when it goes wrong: a flat-rate company quietly taking
// cross-zone work loses money on every order and nothing on any screen says
// so. So it is pinned here. Revision 17 (Edit #4) removed the target-price
// sort this file also used to pin; what it pins instead now is that price
// never re-ranks dispatch.
//
// Same house pattern as dispatchEngine.test.ts: the shared prisma stub, Darb
// 2.0 delegates attached in place, collaborators mocked at the module boundary.

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
const {
  isFlatRateFleet,
  estimatedOrderCostKwd,
} = require("../../../services/dispatch/fleetCostPolicy");
const { fleetRateOf } = require("../../../services/fleetService");

const TENANT = "t-1";
const ORDER_ID = "ord-1";
const BRANCH_ID = "br-1";
const D = (v: string | number) => new Prisma.Decimal(v);

const PICKUP = { lat: 29.3759, lng: 47.9774 };

// Latitude degrees are ~111.2 km: +0.009 ≈ 1 km, +0.018 ≈ 2 km, +0.045 ≈ 5 km.
const BASE_ORDER = {
  id: ORDER_ID,
  tenantId: TENANT,
  orderNumber: "DRB-BRGB-0001",
  vendorId: "v-1",
  branchId: BRANCH_ID,
  status: "DISPATCHING",
  offerRound: 0,
  paymentMethod: "COD",
  orderTotalKwd: D("5.000"),
  deliveryFeeKwd: D("1.250"),
  distanceKm: D("6.000"),
  requiresCarOnly: false,
  pickupZoneId: "z-sal",
  dropoffZoneId: "z-sal",
  branch: { name: "BRGB Salmiya", lat: D(String(PICKUP.lat)), lng: D(String(PICKUP.lng)) },
  dropoffZone: { code: "SAL", name: "Salmiya" },
};

function mkSession(driverId: string, latOffset: number, fleetPartnerId: string | null) {
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
      fleetPartnerId,
    },
  };
}

function prime(opts: {
  order?: Record<string, unknown>;
  sessions?: unknown[];
  fleets?: Array<{ id: string; flatFeePerOrderKwd: Prisma.Decimal; perKmFeeKwd: Prisma.Decimal | null }>;
} = {}) {
  prisma.deliveryOrder.findFirst.mockResolvedValue({ ...BASE_ORDER, ...(opts.order ?? {}) });
  prisma.fulfillmentSettings.findUnique.mockResolvedValue(null);
  prisma.courierOnlineSession.findMany.mockResolvedValue(opts.sessions ?? []);
  prisma.courierOnlineSession.count.mockResolvedValue((opts.sessions ?? []).length);
  prisma.dispatchOffer.findMany.mockResolvedValue([]);
  prisma.deliveryOrder.groupBy.mockResolvedValue([]);
  prisma.deliveryOrder.findMany.mockResolvedValue([]);
  prisma.fleetPartner.findMany.mockResolvedValue(opts.fleets ?? []);
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
});

// ─── The rate itself ────────────────────────────────────────────────────────

describe("fleet rate shape", () => {
  test("a company with no per-km rate is flat, one with a rate is not", () => {
    expect(isFlatRateFleet(fleetRateOf({ flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: null }))).toBe(true);
    // Zero counts as flat: it is a base fee with nothing paid for distance,
    // which is the situation the rule is about, not a per-km deal worth 0.
    expect(isFlatRateFleet(fleetRateOf({ flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: D("0") }))).toBe(true);
    expect(isFlatRateFleet(fleetRateOf({ flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: D("0.050") }))).toBe(false);
  });

  test("cost is base plus rate over the order's own kilometres", () => {
    const rate = fleetRateOf({ flatFeePerOrderKwd: D("1.000"), perKmFeeKwd: D("0.100") });
    expect(estimatedOrderCostKwd(rate, D("6"))).toBeCloseTo(1.6, 3);
    // No company behind the driver costs Darb no fleet fee.
    expect(estimatedOrderCostKwd(null, D("6"))).toBe(0);
  });
});

// ─── #3: flat-rate companies only take same-zone orders ─────────────────────

describe("cross-zone exclusion (revision 15 #3)", () => {
  const FLEETS = [
    { id: "f-flat", flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: null },
    { id: "f-km", flatFeePerOrderKwd: D("0.800"), perKmFeeKwd: D("0.100") },
  ];

  test("a flat-rate company is excluded from a cross-zone order even when nearest", async () => {
    prime({
      order: { pickupZoneId: "z-sal", dropoffZoneId: "z-jah" },
      sessions: [mkSession("drv-flat", 0.009, "f-flat"), mkSession("drv-km", 0.018, "f-km")],
      fleets: FLEETS,
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-km"]);
  });

  test("the same flat-rate company keeps a same-zone order, and being nearest still wins it", async () => {
    prime({
      order: { pickupZoneId: "z-sal", dropoffZoneId: "z-sal" },
      sessions: [mkSession("drv-flat", 0.009, "f-flat"), mkSession("drv-km", 0.018, "f-km")],
      fleets: FLEETS,
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-flat", "drv-km"]);
  });

  test("an unresolved zone is a missing pin, not a cross-zone trip, so nobody is excluded", async () => {
    prime({
      order: { pickupZoneId: "z-sal", dropoffZoneId: null },
      sessions: [mkSession("drv-flat", 0.009, "f-flat"), mkSession("drv-km", 0.018, "f-km")],
      fleets: FLEETS,
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-flat", "drv-km"]);
  });

  test("a driver with no delivery company behind them is never excluded", async () => {
    prime({
      order: { pickupZoneId: "z-sal", dropoffZoneId: "z-jah" },
      sessions: [mkSession("drv-own", 0.009, null)],
      fleets: FLEETS,
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-own"]);
  });
});

// ─── Edit #4: price never re-ranks dispatch ─────────────────────────────────

describe("no target-price sort (revision 17, Edit #4)", () => {
  test("the nearest driver wins however much more their company costs", async () => {
    // Cheap company is FARTHER away; before Edit #4 a branch over its target
    // would have flipped this order. There is no target any more, so the
    // nearest driver must win unconditionally.
    prime({
      sessions: [mkSession("drv-dear", 0.009, "f-dear"), mkSession("drv-cheap", 0.018, "f-cheap")],
      fleets: [
        { id: "f-dear", flatFeePerOrderKwd: D("1.400"), perKmFeeKwd: null },
        { id: "f-cheap", flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: null },
      ],
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates[0].driverId).toBe("drv-dear");
  });
});
