// Darb 2.0 — dispatch engine unit tests (plan §A3).
//
// House mocking pattern: moduleNameMapper folds ../../config into the shared
// prisma stub; Darb 2.0 delegates the shared mock doesn't know about are
// attached in-place here (parallel-track safety — mocks/config.ts is not
// edited). Collaborators (wallet ceiling, dispatch queue, Foodics hook,
// event bus) are jest.mock'ed at the module boundary; the order state
// machine runs REAL so the guarded-updateMany semantics are exercised.

import { getMockPrisma, resetAllMocks } from "../../setup";
import { Prisma } from "../../../generated/prisma";

const prisma = getMockPrisma();

// Attach Darb 2.0 delegates the shared mock doesn't know about yet.
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
prisma.user = prisma.user ?? {};
prisma.user.findMany = prisma.user.findMany ?? jest.fn();
prisma.notification.createMany = prisma.notification.createMany ?? jest.fn();

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

const { isDriverOverCeiling } = require("../../../services/wallet/walletService");
const {
  enqueueDispatchNext,
  scheduleOfferExpiry,
  removeOfferExpiryJob,
} = require("../../../queues/dispatchQueue");
const { enqueueFoodicsWriteback } = require("../../../services/foodics/writebackHook");
const { publishEvent } = require("../../../services/eventBus") as { publishEvent: jest.Mock };
const {
  selectCandidates,
  startDispatch,
  dispatchNext,
  expireOffer,
  sweepDispatch,
  acceptOffer,
  declineOffer,
  OfferGoneError,
} = require("../../../services/dispatch/dispatchEngine");

const TENANT = "t-1";
const ORDER_ID = "ord-1";
const D = (v: string | number) => new Prisma.Decimal(v);

// Pickup branch at Kuwait City. Latitude degrees ≈ 111.2 km each:
//   +0.009 ≈ 1 km, +0.018 ≈ 2 km, +0.09 ≈ 10 km (outside the 8 km radius).
const PICKUP = { lat: 29.3759, lng: 47.9774 };

const BASE_ORDER = {
  id: ORDER_ID,
  tenantId: TENANT,
  orderNumber: "DRB-BRGB-0001",
  vendorId: "v-1",
  status: "DISPATCHING",
  offerRound: 0,
  paymentMethod: "COD",
  orderTotalKwd: D("5.000"),
  deliveryFeeKwd: D("1.250"),
  requiresCarOnly: false,
  branch: { name: "BRGB Salmiya", lat: D(String(PICKUP.lat)), lng: D(String(PICKUP.lng)) },
  dropoffZone: { code: "SAL", name: "Salmiya" },
};

function mkSession(
  driverId: string,
  latOffset: number,
  overrides: Record<string, unknown> = {},
  driverOverrides: Record<string, unknown> = {},
) {
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
      ...driverOverrides,
    },
    ...overrides,
  };
}

function prime(opts: {
  order?: Record<string, unknown>;
  sessions?: unknown[];
  busy?: Array<{ driverId: string }>;
  offers?: Array<{ driverId: string; orderId: string; status: string }>;
  idle?: Array<{ driverId: string; _max: { deliveredAt: Date | null } }>;
} = {}) {
  prisma.deliveryOrder.findFirst.mockResolvedValue({ ...BASE_ORDER, ...(opts.order ?? {}) });
  prisma.fulfillmentSettings.findUnique.mockResolvedValue(null); // schema defaults
  prisma.courierOnlineSession.findMany.mockResolvedValue(opts.sessions ?? []);
  prisma.deliveryOrder.findMany.mockResolvedValue(opts.busy ?? []);
  prisma.dispatchOffer.findMany.mockResolvedValue(opts.offers ?? []);
  prisma.deliveryOrder.groupBy.mockResolvedValue(opts.idle ?? []);
  prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
  prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
  prisma.driver.findFirst.mockResolvedValue({ expoPushToken: null }); // pushless — skip Expo
  prisma.user.findMany.mockResolvedValue([{ id: "u-sup" }]);
  prisma.notification.createMany.mockResolvedValue({ count: 1 });
  prisma.dispatchOffer.create.mockImplementation(async ({ data }: any) => ({
    id: "off-1",
    ...data,
  }));
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  (isDriverOverCeiling as jest.Mock).mockResolvedValue(false);
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
});

// ─── selectCandidates: filter matrix ────────────────────────────────────────

describe("selectCandidates", () => {
  test("ranks by distance ascending with rounded-up ETA at 30 km/h", async () => {
    prime({ sessions: [mkSession("drv-far", 0.018), mkSession("drv-near", 0.009)] });

    const candidates = await selectCandidates(TENANT, ORDER_ID);

    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-near", "drv-far"]);
    expect(candidates[0].distanceKm).toBeLessThan(candidates[1].distanceKm);
    for (const c of candidates) {
      expect(c.etaMin).toBe(Math.ceil((c.distanceKm / 30) * 60));
      expect(c.activeOrders).toBe(0);
    }
  });

  test("vehicle constraint: requiresCarOnly excludes non-CAR drivers even when nearer", async () => {
    prime({
      order: { requiresCarOnly: true },
      sessions: [
        mkSession("drv-moto", 0.009, {}, { vehicleType: "MOTORCYCLE" }),
        mkSession("drv-car", 0.018, {}, { vehicleType: "CAR" }),
      ],
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-car"]);
  });

  test("busy exclusion: driver with an ASSIGNED/PICKED_UP order is skipped", async () => {
    prime({
      sessions: [mkSession("drv-busy", 0.009), mkSession("drv-free", 0.018)],
      busy: [{ driverId: "drv-busy" }],
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-free"]);
  });

  test("open-offer exclusion: driver with an OFFERED offer on ANY order is skipped", async () => {
    prime({
      sessions: [mkSession("drv-offered", 0.009), mkSession("drv-free", 0.018)],
      offers: [{ driverId: "drv-offered", orderId: "some-other-order", status: "OFFERED" }],
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-free"]);
  });

  test("prior-round exclusion: driver already offered THIS order (any status) is skipped", async () => {
    prime({
      sessions: [mkSession("drv-prior", 0.009), mkSession("drv-free", 0.018)],
      offers: [{ driverId: "drv-prior", orderId: ORDER_ID, status: "DECLINED" }],
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-free"]);
  });

  test("ceiling exclusion for COD passes the order total as the projected addition", async () => {
    prime({ sessions: [mkSession("drv-capped", 0.009), mkSession("drv-ok", 0.018)] });
    (isDriverOverCeiling as jest.Mock).mockImplementation(
      async (_t: string, driverId: string) => driverId === "drv-capped",
    );

    const candidates = await selectCandidates(TENANT, ORDER_ID);

    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-ok"]);
    const additional = (isDriverOverCeiling as jest.Mock).mock.calls[0][2];
    expect(additional).toBeDefined();
    expect(new Prisma.Decimal(additional).toFixed(3)).toBe("5.000"); // COD ⇒ +orderTotal
  });

  test("ceiling check for PREPAID orders passes NO additional amount", async () => {
    prime({ order: { paymentMethod: "PREPAID" }, sessions: [mkSession("drv-a", 0.009)] });

    await selectCandidates(TENANT, ORDER_ID);

    expect((isDriverOverCeiling as jest.Mock).mock.calls[0][2]).toBeUndefined();
  });

  test("stale GPS: session older than gpsStaleAfterSec is excluded", async () => {
    prime({
      sessions: [
        mkSession("drv-stale", 0.009, { lastGpsAt: new Date(Date.now() - 10 * 60_000) }),
        mkSession("drv-fresh", 0.018),
      ],
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-fresh"]);
  });

  test("radius: driver beyond searchRadiusKm is excluded", async () => {
    prime({ sessions: [mkSession("drv-out", 0.09), mkSession("drv-in", 0.009)] });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-in"]);
  });

  test("revision 4 (#1): a retried order reaches the far driver the cap excluded", async () => {
    // Same 10 km driver as the test above, and the only one online. On the
    // first pass through dispatch he is out of range and the order exhausts;
    // on a retry he is the nearest driver there is, so he gets the offer.
    prime({ order: { redispatchAttempts: 1 }, sessions: [mkSession("drv-out", 0.09)] });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-out"]);
  });

  test("inactive driver excluded; pushless driver NOT excluded", async () => {
    prime({
      sessions: [
        mkSession("drv-suspended", 0.009, {}, { status: "SUSPENDED" }),
        mkSession("drv-pushless", 0.018, {}, { expoPushToken: null }),
      ],
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual(["drv-pushless"]);
  });

  test("distance tie → longest idle first; never-delivered ranks before recently-delivered", async () => {
    const recent = new Date(Date.now() - 5 * 60_000);
    const older = new Date(Date.now() - 120 * 60_000);
    prime({
      sessions: [
        mkSession("drv-recent", 0.009),
        mkSession("drv-older", 0.009),
        mkSession("drv-never", 0.009),
      ],
      idle: [
        { driverId: "drv-recent", _max: { deliveredAt: recent } },
        { driverId: "drv-older", _max: { deliveredAt: older } },
      ],
    });

    const candidates = await selectCandidates(TENANT, ORDER_ID);
    expect(candidates.map((c: any) => c.driverId)).toEqual([
      "drv-never",
      "drv-older",
      "drv-recent",
    ]);
  });

  test("limit option truncates the ranked list", async () => {
    prime({ sessions: [mkSession("drv-a", 0.009), mkSession("drv-b", 0.018)] });

    const candidates = await selectCandidates(TENANT, ORDER_ID, { limit: 1 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].driverId).toBe("drv-a");
  });
});

// ─── startDispatch / dispatchNext ───────────────────────────────────────────

describe("startDispatch", () => {
  test("happy path: DispatchOffer created, offerRound bumped, offer.sent + expiry scheduled", async () => {
    prime({ sessions: [mkSession("drv-a", 0.009)] });
    const before = Date.now();

    await startDispatch(TENANT, ORDER_ID);

    const created = prisma.dispatchOffer.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      tenantId: TENANT,
      orderId: ORDER_ID,
      driverId: "drv-a",
      round: 0,
      status: "OFFERED",
    });
    // expiresAt ≈ now + offerWindowSec (15s default)
    const expiry = created.expiresAt.getTime();
    expect(expiry).toBeGreaterThanOrEqual(before + 15_000 - 1_000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 15_000 + 1_000);

    // offerRound compare-and-set: guarded on BOTH still-DISPATCHING and the
    // round we read. Without `offerRound: round` two concurrent rounds each
    // pass the status guard and the order gets two live OFFERED offers.
    const bump = prisma.deliveryOrder.updateMany.mock.calls.find(
      (c: any) => c[0].data?.offerRound,
    );
    expect(bump[0].where).toEqual({
      id: ORDER_ID,
      tenantId: TENANT,
      status: "DISPATCHING",
      offerRound: 0,
    });
    expect(bump[0].data.offerRound).toEqual({ increment: 1 });

    const sent = publishEvent.mock.calls.filter((c) => c[0]?.type === "offer.sent");
    expect(sent).toHaveLength(1);
    expect(sent[0][0].payload).toMatchObject({ orderId: ORDER_ID, offerId: "off-1", driverId: "drv-a", round: 0 });

    expect(scheduleOfferExpiry).toHaveBeenCalledWith("off-1", 15_000);
  });

  test("no candidates → NO_DRIVER transition + supervisor Notification + dispatch_exhausted SSE", async () => {
    prime({ sessions: [] });

    await startDispatch(TENANT, ORDER_ID);

    const transition = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(transition.where).toEqual({ id: ORDER_ID, tenantId: TENANT, status: "DISPATCHING" });
    expect(transition.data.status).toBe("NO_DRIVER");

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          role: { in: ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] },
        }),
      }),
    );
    const notif = prisma.notification.createMany.mock.calls[0][0].data[0];
    expect(notif).toMatchObject({ tenantId: TENANT, userId: "u-sup", type: "DISPATCH_EXHAUSTED" });

    const exhausted = publishEvent.mock.calls.filter(
      (c) => c[0]?.type === "order.dispatch_exhausted",
    );
    expect(exhausted).toHaveLength(1);
    expect(scheduleOfferExpiry).not.toHaveBeenCalled();
  });

  test("round ≥ maxOfferRounds → NO_DRIVER without querying candidates", async () => {
    prime({ order: { offerRound: 8 }, sessions: [mkSession("drv-a", 0.009)] });

    await dispatchNext(TENANT, ORDER_ID);

    expect(prisma.courierOnlineSession.findMany).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.updateMany.mock.calls[0][0].data.status).toBe("NO_DRIVER");
  });

  test("order no longer DISPATCHING → silent skip (no offer, no transition)", async () => {
    prime({ order: { status: "ASSIGNED" } });

    await startDispatch(TENANT, ORDER_ID);

    expect(prisma.dispatchOffer.create).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
  });
});

// ─── accept-vs-expire race (both orders of the guarded updateMany) ──────────

describe("acceptOffer vs expireOffer race", () => {
  const OFFER = {
    id: "off-1",
    tenantId: TENANT,
    orderId: ORDER_ID,
    driverId: "drv-a",
    round: 0,
    status: "OFFERED",
    expiresAt: new Date(Date.now() + 10_000),
  };

  test("accept wins: offer ACCEPTED + order DISPATCHING→ASSIGNED; a later expiry no-ops", async () => {
    prisma.dispatchOffer.updateMany.mockResolvedValueOnce({ count: 1 }); // accept guard wins
    prisma.dispatchOffer.findFirst.mockResolvedValue(OFFER);
    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce({ ...BASE_ORDER })
      .mockResolvedValueOnce({ ...BASE_ORDER, status: "ASSIGNED", driverId: "drv-a" });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });

    const { order } = await acceptOffer({ tenantId: TENANT, offerId: "off-1", driverId: "drv-a" });

    expect(order.status).toBe("ASSIGNED");
    const acceptGuard = prisma.dispatchOffer.updateMany.mock.calls[0][0];
    expect(acceptGuard.where).toMatchObject({
      id: "off-1",
      tenantId: TENANT,
      driverId: "drv-a",
      status: "OFFERED",
    });
    expect(acceptGuard.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(acceptGuard.data.status).toBe("ACCEPTED");

    const transition = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(transition.where).toEqual({ id: ORDER_ID, tenantId: TENANT, status: "DISPATCHING" });
    expect(transition.data).toMatchObject({ status: "ASSIGNED", driverId: "drv-a" });

    expect(removeOfferExpiryJob).toHaveBeenCalledWith("off-1");
    expect(enqueueFoodicsWriteback).toHaveBeenCalledWith(ORDER_ID, "ASSIGNED");
    expect(publishEvent.mock.calls.some((c) => c[0]?.type === "offer.accepted")).toBe(true);
    expect(publishEvent.mock.calls.some((c) => c[0]?.type === "order.assigned")).toBe(true);

    // The expiry job then fires for the same offer — its guarded update loses.
    jest.clearAllMocks();
    prisma.dispatchOffer.findUnique.mockResolvedValue({ ...OFFER, status: "ACCEPTED" });
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 0 });

    await expireOffer("off-1");

    expect(enqueueDispatchNext).not.toHaveBeenCalled();
    expect(publishEvent.mock.calls.filter((c) => c[0]?.type === "offer.expired")).toHaveLength(0);
  });

  test("expiry wins: offer EXPIRED + dispatch-next; the late accept gets OfferGoneError", async () => {
    prisma.dispatchOffer.findUnique.mockResolvedValue(OFFER);
    prisma.dispatchOffer.updateMany.mockResolvedValueOnce({ count: 1 }); // expiry guard wins

    await expireOffer("off-1");

    const expiryGuard = prisma.dispatchOffer.updateMany.mock.calls[0][0];
    expect(expiryGuard.where).toMatchObject({ id: "off-1", tenantId: TENANT, status: "OFFERED" });
    expect(expiryGuard.data.status).toBe("EXPIRED");
    expect(enqueueDispatchNext).toHaveBeenCalledWith(ORDER_ID, TENANT);
    expect(publishEvent.mock.calls.some((c) => c[0]?.type === "offer.expired")).toBe(true);

    // Driver taps Accept a beat later — guarded update finds nothing OFFERED.
    prisma.dispatchOffer.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      acceptOffer({ tenantId: TENANT, offerId: "off-1", driverId: "drv-a" }),
    ).rejects.toBeInstanceOf(OfferGoneError);
    // The order transition never ran.
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
  });

  test("accept transition losing to a concurrent cancel surfaces as OfferGoneError", async () => {
    prisma.dispatchOffer.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.dispatchOffer.findFirst.mockResolvedValue(OFFER);
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...BASE_ORDER });
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 0 }); // order left DISPATCHING

    await expect(
      acceptOffer({ tenantId: TENANT, offerId: "off-1", driverId: "drv-a" }),
    ).rejects.toBeInstanceOf(OfferGoneError);
  });
});

// ─── declineOffer ───────────────────────────────────────────────────────────

describe("declineOffer", () => {
  test("guarded OFFERED→DECLINED + offer.declined + dispatch-next", async () => {
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 1 });
    prisma.dispatchOffer.findFirst.mockResolvedValue({
      id: "off-1",
      tenantId: TENANT,
      orderId: ORDER_ID,
      driverId: "drv-a",
      round: 2,
    });

    await declineOffer({ tenantId: TENANT, offerId: "off-1", driverId: "drv-a", reason: "too far" });

    const guard = prisma.dispatchOffer.updateMany.mock.calls[0][0];
    expect(guard.where).toMatchObject({ id: "off-1", driverId: "drv-a", status: "OFFERED" });
    expect(guard.data.status).toBe("DECLINED");
    expect(enqueueDispatchNext).toHaveBeenCalledWith(ORDER_ID, TENANT);
    const declined = publishEvent.mock.calls.filter((c) => c[0]?.type === "offer.declined");
    expect(declined[0][0].payload).toMatchObject({ offerId: "off-1", reason: "too far" });
  });

  // Revision 4 (#2) asked for "if the order is rejected from the driver it
  // should be sent to another driver automatically". It already is — this
  // pins that, so the behaviour cannot be refactored away unnoticed.
  test("revision 4 (#2): a rejected order goes straight back out, no human step", async () => {
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 1 });
    prisma.dispatchOffer.findFirst.mockResolvedValue({
      id: "off-1",
      tenantId: TENANT,
      orderId: ORDER_ID,
      driverId: "drv-a",
      round: 0,
    });

    await declineOffer({ tenantId: TENANT, offerId: "off-1", driverId: "drv-a" });

    // No NO_DRIVER transition, no supervisor notification, no manual queue —
    // just the next round.
    expect(enqueueDispatchNext).toHaveBeenCalledWith(ORDER_ID, TENANT);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  test("late decline (already expired) is an idempotent no-op", async () => {
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      declineOffer({ tenantId: TENANT, offerId: "off-1", driverId: "drv-a" }),
    ).resolves.toBeUndefined();
    expect(enqueueDispatchNext).not.toHaveBeenCalled();
  });
});


// ─── Cron sweep (serverless dispatch driver) ────────────────────────────────
//
// On Vercel this sweep is the ONLY thing that moves dispatch: no Redis, and
// startDispatchWorker never boots, so enqueueDispatchStart/Next are dropped
// outright. That makes leg 2 (advance DISPATCHING orders with no live offer)
// load-bearing — an order there has never been offered to anyone, so a sweep
// that only expired existing offers would find nothing to do, forever.
//
// The property these tests defend is RE-DERIVABILITY: the advance set is a
// pure function of committed state, never of "what leg 1 just expired". That
// is what lets a killed lambda resume on the next tick instead of stranding
// orders in DISPATCHING with no offer and nothing to retry them.

describe("sweepDispatch", () => {
  const NOW = new Date("2026-07-20T12:00:00Z");

  const dueOffer = (id: string) => ({ id });
  const wedged = (id: string) => ({ id, tenantId: TENANT });

  // Legs 2 and 3 both read deliveryOrder.findMany, so the stub routes on the
  // selector's status rather than call order — otherwise every leg-2 fixture
  // would silently become a leg-3 fixture too.
  let wedgedRows: unknown[] = [];
  let exhaustedRows: unknown[] = [];
  const setWedged = (rows: unknown[]) => { wedgedRows = rows; };
  const setExhausted = (rows: unknown[]) => { exhaustedRows = rows; };

  beforeEach(() => {
    // runDispatchRound bails immediately on a non-DISPATCHING order, so
    // deliveryOrder.findFirst call count == number of orders advanced.
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...BASE_ORDER, status: "CANCELLED" });
    prisma.dispatchOffer.findMany.mockResolvedValue([]);
    wedgedRows = [];
    exhaustedRows = [];
    prisma.deliveryOrder.findMany.mockImplementation(async (q: any) =>
      q?.where?.status === "NO_DRIVER" ? exhaustedRows : wedgedRows,
    );
  });

  test("idle: nothing due and nothing wedged", async () => {
    const result = await sweepDispatch({ now: NOW });

    expect(result).toMatchObject({ expired: 0, advanced: 0, wedged: 0, truncated: false });
    expect(prisma.dispatchOffer.updateMany).not.toHaveBeenCalled();
  });

  test("leg 1 selects only OFFERED offers whose window has elapsed", async () => {
    await sweepDispatch({ now: NOW, limit: 25 });

    const q = prisma.dispatchOffer.findMany.mock.calls[0][0];
    expect(q.where).toEqual({ status: "OFFERED", expiresAt: { lte: NOW } });
    expect(q.take).toBe(25);
  });

  test("leg 2 selects DISPATCHING orders with NO live offer — not offers", async () => {
    await sweepDispatch({ now: NOW, limit: 25 });

    const q = prisma.deliveryOrder.findMany.mock.calls[0][0];
    expect(q.where).toEqual({
      status: "DISPATCHING",
      offers: { none: { status: "OFFERED", expiresAt: { gt: NOW } } },
    });
    // Oldest customer first.
    expect(q.orderBy).toEqual({ createdAt: "asc" });
  });

  test("BOOTSTRAP: advances an order that has never had an offer at all", async () => {
    // The prod symptom on Vercel — enqueueDispatchStart was dropped, so the
    // order sits in DISPATCHING with zero DispatchOffer rows. Leg 1 finds
    // nothing; leg 2 must still pick it up.
    prisma.dispatchOffer.findMany.mockResolvedValue([]);
    setWedged([wedged("ord-never-offered")]);

    const result = await sweepDispatch({ now: NOW });

    expect(result).toMatchObject({ expired: 0, advanced: 1 });
    expect(prisma.deliveryOrder.findFirst).toHaveBeenCalledTimes(1);
  });

  test("RECOVERY: re-advances an order stranded by a previous half-finished run", async () => {
    // Its only offer is already EXPIRED, so leg 1 cannot see it. Leg 2 can,
    // because the order is still DISPATCHING with no live offer.
    prisma.dispatchOffer.findMany.mockResolvedValue([]);
    setWedged([wedged("ord-stranded")]);

    const result = await sweepDispatch({ now: NOW });

    expect(result.advanced).toBe(1);
  });

  test("expires due offers and advances wedged orders in the same run", async () => {
    prisma.dispatchOffer.findMany.mockResolvedValue([dueOffer("off-1"), dueOffer("off-2")]);
    prisma.dispatchOffer.findUnique
      .mockResolvedValueOnce({ id: "off-1", tenantId: TENANT, orderId: "ord-a", round: 0, driverId: "d1" })
      .mockResolvedValueOnce({ id: "off-2", tenantId: TENANT, orderId: "ord-b", round: 0, driverId: "d2" });
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 1 });
    setWedged([wedged("ord-a"), wedged("ord-b")]);

    const result = await sweepDispatch({ now: NOW });

    expect(result).toMatchObject({ expired: 2, advanced: 2 });
    expect(publishEvent.mock.calls.filter((c) => c[0]?.type === "offer.expired")).toHaveLength(2);
  });

  test("never double-advances: leg 1 does not enqueue, leg 2 drives", async () => {
    prisma.dispatchOffer.findMany.mockResolvedValue([dueOffer("off-1")]);
    prisma.dispatchOffer.findUnique.mockResolvedValue({
      id: "off-1", tenantId: TENANT, orderId: "ord-a", round: 0, driverId: "d1",
    });
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 1 });
    setWedged([wedged("ord-a")]);

    await sweepDispatch({ now: NOW });

    // With Redis present, an enqueue here would run dispatchNext a second time.
    expect(enqueueDispatchNext).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.findFirst).toHaveBeenCalledTimes(1);
  });

  test("an offer whose guarded update lost the race is not counted", async () => {
    prisma.dispatchOffer.findMany.mockResolvedValue([dueOffer("off-1")]);
    prisma.dispatchOffer.findUnique.mockResolvedValue({
      id: "off-1", tenantId: TENANT, orderId: "ord-a", round: 0, driverId: "d1",
    });
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 0 }); // accepted first

    const result = await sweepDispatch({ now: NOW });

    expect(result.expired).toBe(0);
  });

  test("a throwing dispatchNext does not abort the batch and is retried next tick", async () => {
    setWedged([wedged("ord-a"), wedged("ord-b")]);
    prisma.deliveryOrder.findFirst
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValueOnce({ ...BASE_ORDER, status: "CANCELLED" });

    const result = await sweepDispatch({ now: NOW });

    // ord-a failed, ord-b still ran. Nothing was mutated for ord-a, so it
    // still matches the leg-2 selector on the next tick.
    expect(result.advanced).toBe(1);
    expect(result.wedged).toBe(2);
  });

  test("a failing expire does not stop the rest of leg 1", async () => {
    prisma.dispatchOffer.findMany.mockResolvedValue([dueOffer("off-1"), dueOffer("off-2")]);
    prisma.dispatchOffer.findUnique
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValueOnce({ id: "off-2", tenantId: TENANT, orderId: "ord-b", round: 0, driverId: "d2" });
    prisma.dispatchOffer.updateMany.mockResolvedValue({ count: 1 });

    const result = await sweepDispatch({ now: NOW });

    expect(result.expired).toBe(1);
  });

  test("reports truncated when the per-run cap is hit, so a backlog is visible", async () => {
    setWedged([wedged("o1"), wedged("o2")]);

    const result = await sweepDispatch({ now: NOW, limit: 2 });

    expect(result.truncated).toBe(true);
  });

  test("stops advancing when the wall-clock budget is spent rather than being killed", async () => {
    setWedged([wedged("o1"), wedged("o2"), wedged("o3")]);

    const result = await sweepDispatch({ now: NOW, budgetMs: -1 });

    expect(result.advanced).toBe(0);
    expect(result.truncated).toBe(true);
  });

  // ── Leg 3: revision 4 (#1), NO_DRIVER is a pause not a terminus ───────────
  //
  // The client's screenshot was an order sitting at No Driver with an SLA of
  // -7051 minutes. Nothing in the platform was ever going to pick it up. These
  // tests defend the property that fixes it: an exhausted order is offered
  // again on its own schedule, without anyone touching it.

  test("leg 3 selects only NO_DRIVER orders whose retry is due", async () => {
    await sweepDispatch({ now: NOW, limit: 25 });

    const leg3 = prisma.deliveryOrder.findMany.mock.calls.find(
      (c: any) => c[0]?.where?.status === "NO_DRIVER",
    );
    expect(leg3[0].where).toEqual({ status: "NO_DRIVER", nextRedispatchAt: { lte: NOW } });
    // Longest-overdue customer first.
    expect(leg3[0].orderBy).toEqual({ nextRedispatchAt: "asc" });
    expect(leg3[0].take).toBe(25);
  });

  test("returns a due exhausted order to DISPATCHING and re-offers it", async () => {
    setExhausted([{ id: "ord-stuck", tenantId: TENANT }]);
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    const result = await sweepDispatch({ now: NOW });

    expect(result.retried).toBe(1);
    // The claim clears the due stamp so two concurrent sweeps cannot both win.
    const claim = prisma.deliveryOrder.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: "ord-stuck", status: "NO_DRIVER" });
    expect(claim.data.nextRedispatchAt).toBeNull();
    // And it went on to actually dispatch, rather than just flipping status.
    expect(prisma.deliveryOrder.findFirst).toHaveBeenCalled();
  });

  test("an order claimed by someone else in the meantime is left alone", async () => {
    setExhausted([{ id: "ord-stuck", tenantId: TENANT }]);
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 0 }); // assigned/cancelled first

    const result = await sweepDispatch({ now: NOW });

    expect(result.retried).toBe(0);
    expect(prisma.orderEvent.create).not.toHaveBeenCalled();
  });

  test("a failed retry re-arms rather than parking the order forever", async () => {
    setExhausted([{ id: "ord-stuck", tenantId: TENANT }]);
    prisma.deliveryOrder.updateMany
      .mockResolvedValueOnce({ count: 1 }) // the claim succeeds...
      .mockRejectedValueOnce(new Error("db blip")) // ...the transition does not
      .mockResolvedValue({ count: 1 }); // the re-arm

    const result = await sweepDispatch({ now: NOW });

    expect(result.retried).toBe(0);
    // Last write puts a due time back, otherwise the cleared claim would have
    // made this order invisible to every future sweep.
    const rearm = prisma.deliveryOrder.updateMany.mock.calls.at(-1)[0];
    expect(rearm.data.nextRedispatchAt).toBeInstanceOf(Date);
  });
});

// ─── Redispatch backoff (revision 4 #1) ─────────────────────────────────────

describe("redispatchDelaySec", () => {
  const { redispatchDelaySec } = require("../../../services/dispatch/dispatchEngine");

  test("starts short, because the usual cause is a momentary coverage gap", () => {
    expect(redispatchDelaySec(1)).toBe(60);
    expect(redispatchDelaySec(2)).toBe(120);
    expect(redispatchDelaySec(3)).toBe(300);
  });

  test("settles at ten minutes and never gives up", () => {
    expect(redispatchDelaySec(4)).toBe(600);
    expect(redispatchDelaySec(50)).toBe(600);
    expect(redispatchDelaySec(9999)).toBe(600);
  });
});

// ─── effectiveRadiusKm (PRD §8 auto-widen) ──────────────────────────────────

describe("effectiveRadiusKm", () => {
  const { effectiveRadiusKm } = require("../../../services/dispatch/dispatchEngine");
  const S = {
    searchRadiusKm: 8,
    radiusWidenAfterRounds: 3,
    radiusWidenFactor: 1.5,
    maxSearchRadiusKm: 15,
  };

  test.each([
    [0, 8],
    [1, 8],
    [2, 8],
    [3, 12],
    [4, 12],
    [5, 12],
    [6, 15], // 8 * 1.5^2 = 18, capped at 15
    [12, 15],
  ])("round %i → %i km", (round, expected) => {
    expect(effectiveRadiusKm(S, round)).toBe(expected);
  });

  test("radiusWidenAfterRounds=0 disables widening entirely", () => {
    expect(effectiveRadiusKm({ ...S, radiusWidenAfterRounds: 0 }, 10)).toBe(8);
  });

  test("negative rounds are clamped to the base radius", () => {
    expect(effectiveRadiusKm(S, -2)).toBe(8);
  });

  test("uncapped ignores the ceiling, so a retry can reach any driver", () => {
    expect(effectiveRadiusKm(S, 0, { uncapped: true })).toBe(Number.POSITIVE_INFINITY);
    expect(effectiveRadiusKm(S, 12, { uncapped: true })).toBe(Number.POSITIVE_INFINITY);
  });
});

// ─── Auto-batching (PRD §8: one pickup, multiple drops only) ────────────────

describe("findBatchSibling", () => {
  const { findBatchSibling } = require("../../../services/dispatch/dispatchEngine");
  const SETTINGS = {
    offerWindowSec: 15, maxOfferRounds: 8, searchRadiusKm: 8, gpsStaleAfterSec: 180,
    radiusWidenAfterRounds: 3, radiusWidenFactor: 1.5, maxSearchRadiusKm: 15,
    batchingEnabled: true, batchMaxDropKm: 1.5, batchMaxOrders: 2,
  };
  const PRIMARY = {
    id: ORDER_ID,
    branchId: "b-1",
    dropoffZoneId: "zone-b",
    dropoffLat: 29.34,
    dropoffLng: 48.09,
    requiresCarOnly: false,
  };

  beforeEach(() => {
    resetAllMocks();
    jest.clearAllMocks();
  });

  test("same dropoff zone qualifies", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([
      { id: "ord-2", branchId: "b-1", status: "DISPATCHING", dropoffZoneId: "zone-b", dropoffLat: null, dropoffLng: null, requiresCarOnly: false, offerRound: 0 },
    ]);
    const sibling = await findBatchSibling(TENANT, PRIMARY, SETTINGS);
    expect(sibling?.id).toBe("ord-2");
    // Selector: same branch, DISPATCHING, no live offer.
    const where = prisma.deliveryOrder.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ branchId: "b-1", status: "DISPATCHING" });
    expect(where.offers.none.status).toBe("OFFERED");
  });

  test("different zone but drop within batchMaxDropKm qualifies; far drop does not", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([
      // ~1.1km north of the primary drop (0.01 deg lat ≈ 1.11 km)
      { id: "near", branchId: "b-1", dropoffZoneId: "zone-c", dropoffLat: 29.35, dropoffLng: 48.09, requiresCarOnly: false, offerRound: 0 },
    ]);
    expect((await findBatchSibling(TENANT, PRIMARY, SETTINGS))?.id).toBe("near");

    prisma.deliveryOrder.findMany.mockResolvedValue([
      // ~5.5km away
      { id: "far", branchId: "b-1", dropoffZoneId: "zone-c", dropoffLat: 29.39, dropoffLng: 48.09, requiresCarOnly: false, offerRound: 0 },
    ]);
    expect(await findBatchSibling(TENANT, PRIMARY, SETTINGS)).toBeNull();
  });

  test("a car-only sibling cannot batch behind a bike-eligible primary", async () => {
    prisma.deliveryOrder.findMany.mockResolvedValue([
      { id: "carOnly", branchId: "b-1", dropoffZoneId: "zone-b", dropoffLat: null, dropoffLng: null, requiresCarOnly: true, offerRound: 0 },
    ]);
    expect(await findBatchSibling(TENANT, PRIMARY, SETTINGS)).toBeNull();
  });
});

describe("batched accept / decline / expire", () => {
  const BATCH_OFFER = {
    id: "off-1",
    tenantId: TENANT,
    orderId: ORDER_ID,
    driverId: "drv-a",
    round: 0,
    batchId: "batch-1",
    status: "OFFERED",
    expiresAt: new Date(Date.now() + 10_000),
  };
  const SIBLING_OFFER = {
    id: "off-2",
    tenantId: TENANT,
    orderId: "ord-2",
    driverId: "drv-a",
    round: 0,
    batchId: "batch-1",
    status: "OFFERED",
    expiresAt: BATCH_OFFER.expiresAt,
  };

  beforeEach(() => {
    resetAllMocks();
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
  });

  test("accepting one offer of a batch assigns BOTH orders to the driver and stamps batchId", async () => {
    prisma.dispatchOffer.updateMany
      .mockResolvedValueOnce({ count: 1 }) // primary accept guard
      .mockResolvedValueOnce({ count: 1 }); // sibling accept guard
    prisma.dispatchOffer.findFirst.mockResolvedValue(BATCH_OFFER);
    prisma.dispatchOffer.findMany.mockResolvedValue([SIBLING_OFFER]);
    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce({ ...BASE_ORDER }) // primary load
      .mockResolvedValueOnce({ ...BASE_ORDER, status: "ASSIGNED", driverId: "drv-a" }); // fresh
    prisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    const { order } = await acceptOffer({ tenantId: TENANT, offerId: "off-1", driverId: "drv-a" });

    expect(order.status).toBe("ASSIGNED");
    // Two ASSIGNED transitions (primary + sibling), both carrying the batchId.
    const transitions = prisma.deliveryOrder.updateMany.mock.calls.map((c: any) => c[0]);
    expect(transitions).toHaveLength(2);
    expect(transitions[0].where.id).toBe(ORDER_ID);
    expect(transitions[0].data).toMatchObject({ status: "ASSIGNED", driverId: "drv-a", batchId: "batch-1" });
    expect(transitions[1].where.id).toBe("ord-2");
    expect(transitions[1].data).toMatchObject({ status: "ASSIGNED", driverId: "drv-a", batchId: "batch-1" });
    // BUSY set exactly once for the whole batch.
    expect(prisma.courierOnlineSession.updateMany).toHaveBeenCalledTimes(1);
    // Sibling gets its own post-commit fan-out.
    expect(enqueueFoodicsWriteback).toHaveBeenCalledWith("ord-2", "ASSIGNED");
  });

  test("a sibling cancelled mid-offer degrades to a single accept — primary stands", async () => {
    prisma.dispatchOffer.updateMany
      .mockResolvedValueOnce({ count: 1 }) // primary accept guard
      .mockResolvedValueOnce({ count: 1 }) // sibling offer guard wins...
      .mockResolvedValueOnce({ count: 1 }); // ...then sibling offer honestly CANCELLED
    prisma.dispatchOffer.findFirst.mockResolvedValue(BATCH_OFFER);
    prisma.dispatchOffer.findMany.mockResolvedValue([SIBLING_OFFER]);
    prisma.deliveryOrder.findFirst
      .mockResolvedValueOnce({ ...BASE_ORDER })
      .mockResolvedValueOnce({ ...BASE_ORDER, status: "ASSIGNED", driverId: "drv-a" });
    prisma.deliveryOrder.updateMany
      .mockResolvedValueOnce({ count: 1 }) // primary transition wins
      .mockResolvedValueOnce({ count: 0 }); // sibling transition loses (cancelled)

    const { order } = await acceptOffer({ tenantId: TENANT, offerId: "off-1", driverId: "drv-a" });

    expect(order.status).toBe("ASSIGNED");
    // Sibling offer flipped to CANCELLED (3rd dispatchOffer.updateMany call).
    const sibCancel = prisma.dispatchOffer.updateMany.mock.calls[2][0];
    expect(sibCancel.where).toMatchObject({ id: "off-2" });
    expect(sibCancel.data.status).toBe("CANCELLED");
  });

  test("declining one offer of a batch closes the sibling offer and advances BOTH orders", async () => {
    prisma.dispatchOffer.updateMany
      .mockResolvedValueOnce({ count: 1 }) // decline guard
      .mockResolvedValueOnce({ count: 1 }); // closeBatchSiblings updateMany
    prisma.dispatchOffer.findFirst.mockResolvedValue(BATCH_OFFER);
    prisma.dispatchOffer.findMany.mockResolvedValue([{ id: "off-2", orderId: "ord-2" }]);

    await declineOffer({ tenantId: TENANT, offerId: "off-1", driverId: "drv-a" });

    const close = prisma.dispatchOffer.updateMany.mock.calls[1][0];
    expect(close.where).toMatchObject({ batchId: "batch-1", status: "OFFERED" });
    expect(close.data.status).toBe("DECLINED");
    expect(enqueueDispatchNext).toHaveBeenCalledWith(ORDER_ID, TENANT);
    expect(enqueueDispatchNext).toHaveBeenCalledWith("ord-2", TENANT);
  });

  test("expiring one offer of a batch closes the sibling too (advance mode)", async () => {
    prisma.dispatchOffer.findUnique.mockResolvedValue(BATCH_OFFER);
    prisma.dispatchOffer.updateMany
      .mockResolvedValueOnce({ count: 1 }) // expiry guard
      .mockResolvedValueOnce({ count: 1 }); // closeBatchSiblings
    prisma.dispatchOffer.findMany.mockResolvedValue([{ id: "off-2", orderId: "ord-2" }]);

    const won = await expireOffer("off-1");

    expect(won).toBe(true);
    const close = prisma.dispatchOffer.updateMany.mock.calls[1][0];
    expect(close.where).toMatchObject({ batchId: "batch-1", status: "OFFERED" });
    expect(close.data.status).toBe("EXPIRED");
    expect(enqueueDispatchNext).toHaveBeenCalledWith(ORDER_ID, TENANT);
    expect(enqueueDispatchNext).toHaveBeenCalledWith("ord-2", TENANT);
  });
});

// ─── releaseDriverToOnline batching guard ───────────────────────────────────

describe("releaseDriverToOnline (batching guard)", () => {
  const { releaseDriverToOnline } = require("../../../services/dispatch/driverPresence");

  test("driver still carrying another active order stays BUSY", async () => {
    const tx = {
      deliveryOrder: { count: jest.fn().mockResolvedValue(1) },
      courierOnlineSession: { updateMany: jest.fn() },
    };
    await releaseDriverToOnline(tx as any, TENANT, "drv-a");
    expect(tx.courierOnlineSession.updateMany).not.toHaveBeenCalled();
  });

  test("no remaining active orders → session released to ONLINE", async () => {
    const tx = {
      deliveryOrder: { count: jest.fn().mockResolvedValue(0) },
      courierOnlineSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    await releaseDriverToOnline(tx as any, TENANT, "drv-a");
    expect(tx.courierOnlineSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ availability: "BUSY" }),
        data: { availability: "ONLINE" },
      }),
    );
  });
});
