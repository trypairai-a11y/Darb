// Demo courier behaviour — the missing other side of the offer.
//
// Dispatch works by asking a driver and waiting for him to answer. On a demo
// tenant nobody is holding a phone, so every offer expires and the order never
// leaves Dispatching. This service answers on their behalf.
//
// It accepts offers, picks orders up and delivers them, which means it moves
// money. So the tests care most about the guard: two switches must both be on,
// and every query must name an allow-listed tenant. A real tenant getting its
// orders auto-delivered would be far worse than the bug this fixes.

import { getMockPrisma, resetAllMocks } from "../setup";

jest.mock("../../services/dispatch/dispatchEngine", () => ({
  acceptOffer: jest.fn().mockResolvedValue({ order: { id: "o-1" } }),
}));
jest.mock("../../services/orderService", () => ({
  completeDelivery: jest.fn().mockResolvedValue({ order: { id: "o-1" } }),
}));
jest.mock("../../services/orderStateMachine", () => ({
  transitionOrder: jest.fn().mockResolvedValue(undefined),
  flushOrderEvents: jest.fn(),
}));

const prisma = getMockPrisma();

prisma.dispatchOffer = prisma.dispatchOffer ?? {};
prisma.dispatchOffer.findMany = prisma.dispatchOffer.findMany ?? jest.fn();
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
prisma.deliveryOrder.findMany = prisma.deliveryOrder.findMany ?? jest.fn();

const { acceptOffer } = require("../../services/dispatch/dispatchEngine");
const { completeDelivery } = require("../../services/orderService");
const { transitionOrder } = require("../../services/orderStateMachine");
const { runDemoCouriers } = require("../../services/demoCourierService");

const TENANT = "demo-tenant";
const NOW = new Date("2026-07-29T10:00:00.000Z");
const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1000);

/** Enable both switches — the ordinary "this is a demo tenant" setup. */
function enable() {
  process.env.DEMO_AUTO_COURIER = "true";
  process.env.DEMO_PRESENCE_TENANTS = TENANT;
}

/** No offers, no orders: each leg finds nothing and the pass is a no-op. */
function emptyTables() {
  prisma.dispatchOffer.findMany.mockResolvedValue([]);
  prisma.deliveryOrder.findMany.mockResolvedValue([]);
}

describe("runDemoCouriers", () => {
  const savedFlag = process.env.DEMO_AUTO_COURIER;
  const savedTenants = process.env.DEMO_PRESENCE_TENANTS;

  beforeEach(() => {
    resetAllMocks();
    jest.clearAllMocks();
    delete process.env.DEMO_AUTO_COURIER;
    delete process.env.DEMO_PRESENCE_TENANTS;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  });

  afterAll(() => {
    if (savedFlag === undefined) delete process.env.DEMO_AUTO_COURIER;
    else process.env.DEMO_AUTO_COURIER = savedFlag;
    if (savedTenants === undefined) delete process.env.DEMO_PRESENCE_TENANTS;
    else process.env.DEMO_PRESENCE_TENANTS = savedTenants;
  });

  // ── The guard ─────────────────────────────────────────────────────────────

  test("both switches off: not one read, let alone an accept", async () => {
    const result = await runDemoCouriers(NOW);

    expect(result).toEqual({ tenants: 0, accepted: 0, pickedUp: 0, delivered: 0 });
    expect(prisma.dispatchOffer.findMany).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.findMany).not.toHaveBeenCalled();
    expect(acceptOffer).not.toHaveBeenCalled();
  });

  test("a tenant list without the flag does nothing — the flag is the master switch", async () => {
    process.env.DEMO_PRESENCE_TENANTS = TENANT;

    const result = await runDemoCouriers(NOW);

    expect(result.tenants).toBe(0);
    expect(prisma.dispatchOffer.findMany).not.toHaveBeenCalled();
  });

  test("the flag without a tenant list does nothing — there is nobody to act for", async () => {
    process.env.DEMO_AUTO_COURIER = "true";

    const result = await runDemoCouriers(NOW);

    expect(result.tenants).toBe(0);
    expect(prisma.dispatchOffer.findMany).not.toHaveBeenCalled();
  });

  test("a stray newline on the flag still reads as on", async () => {
    // vercel env add keeps the trailing newline, which is how DEMO_REFRESH_ENABLED
    // ended up silently off in production. Never again for this one.
    process.env.DEMO_AUTO_COURIER = "true\n";
    process.env.DEMO_PRESENCE_TENANTS = TENANT;
    emptyTables();

    const result = await runDemoCouriers(NOW);

    expect(result.tenants).toBe(1);
  });

  test("every query names an allow-listed tenant", async () => {
    enable();
    emptyTables();

    await runDemoCouriers(NOW);

    const calls = [
      ...prisma.dispatchOffer.findMany.mock.calls,
      ...prisma.deliveryOrder.findMany.mock.calls,
    ];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call[0].where.tenantId).toBe(TENANT);
    }
  });

  // ── Accepting ─────────────────────────────────────────────────────────────

  test("an offer old enough to have been read is accepted by the driver it was made to", async () => {
    enable();
    prisma.dispatchOffer.findMany.mockResolvedValue([
      { id: "offer-1", driverId: "drv-1", createdAt: secondsAgo(30) },
    ]);
    prisma.deliveryOrder.findMany.mockResolvedValue([]);

    const result = await runDemoCouriers(NOW);

    expect(acceptOffer).toHaveBeenCalledWith({
      tenantId: TENANT,
      offerId: "offer-1",
      driverId: "drv-1",
    });
    expect(result.accepted).toBe(1);
  });

  test("a fresh offer is left alone so the board shows a real offer window", async () => {
    enable();
    emptyTables();

    await runDemoCouriers(NOW);

    // The age filter is in the query, not in JS: an offer made this tick must
    // not match it.
    const where = prisma.dispatchOffer.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("OFFERED");
    expect(where.createdAt.lte.getTime()).toBeLessThan(NOW.getTime());
    expect(where.expiresAt.gt).toEqual(NOW);
  });

  test("one offer losing a race does not stop the next one", async () => {
    enable();
    prisma.dispatchOffer.findMany.mockResolvedValue([
      { id: "offer-1", driverId: "drv-1", createdAt: secondsAgo(30) },
      { id: "offer-2", driverId: "drv-2", createdAt: secondsAgo(30) },
    ]);
    prisma.deliveryOrder.findMany.mockResolvedValue([]);
    acceptOffer.mockRejectedValueOnce(new Error("offer gone"));

    const result = await runDemoCouriers(NOW);

    expect(acceptOffer).toHaveBeenCalledTimes(2);
    expect(result.accepted).toBe(1);
  });

  // ── Picking up and delivering ─────────────────────────────────────────────

  test("an order held long enough is picked up through the FSM, not written directly", async () => {
    enable();
    prisma.dispatchOffer.findMany.mockResolvedValue([]);
    prisma.deliveryOrder.findMany
      .mockResolvedValueOnce([
        {
          id: "o-1",
          orderNumber: "DRB-1",
          vendorId: "v-1",
          driverId: "drv-1",
          assignedAt: secondsAgo(600),
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await runDemoCouriers(NOW);

    expect(transitionOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: "o-1",
        tenantId: TENANT,
        from: "ASSIGNED",
        to: "PICKED_UP",
      }),
    );
    expect(result.pickedUp).toBe(1);
  });

  test("a delivered COD order hands over the cash it was carrying", async () => {
    enable();
    prisma.dispatchOffer.findMany.mockResolvedValue([]);
    prisma.deliveryOrder.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "o-2",
        driverId: "drv-1",
        paymentMethod: "COD",
        orderTotalKwd: "4.500",
        pickedUpAt: secondsAgo(900),
      },
    ]);

    const result = await runDemoCouriers(NOW);

    expect(completeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        orderId: "o-2",
        codCollectedKwd: "4.500",
      }),
    );
    expect(result.delivered).toBe(1);
  });

  test("a prepaid order settles without inventing a cash collection", async () => {
    enable();
    prisma.dispatchOffer.findMany.mockResolvedValue([]);
    prisma.deliveryOrder.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "o-3",
        driverId: "drv-1",
        paymentMethod: "PREPAID",
        orderTotalKwd: "4.500",
        pickedUpAt: secondsAgo(900),
      },
    ]);

    await runDemoCouriers(NOW);

    expect(completeDelivery).toHaveBeenCalledWith(
      expect.not.objectContaining({ codCollectedKwd: expect.anything() }),
    );
  });

  // ── Never takes the sweep down with it ────────────────────────────────────

  test("a failing leg is swallowed: the dispatch sweep must survive it", async () => {
    enable();
    prisma.dispatchOffer.findMany.mockRejectedValue(new Error("db down"));
    prisma.deliveryOrder.findMany.mockResolvedValue([]);

    await expect(runDemoCouriers(NOW)).resolves.toEqual(
      expect.objectContaining({ accepted: 0 }),
    );
  });
});
