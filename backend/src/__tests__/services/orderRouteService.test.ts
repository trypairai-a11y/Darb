/**
 * Revision 24 #13 — the map on an order's Timeline: pickup and dropoff pins
 * plus the driver's GPS path between assignment and the end of the order.
 */
import { getMockPrisma, resetAllMocks } from "../setup";
import { orderRoute, thinPath, ROUTE_MAX_POINTS } from "../../services/orderRouteService";

const prisma = getMockPrisma();

const assignedAt = new Date("2026-10-14T10:00:00Z");
const pickedUpAt = new Date("2026-10-14T10:10:00Z");
const deliveredAt = new Date("2026-10-14T10:30:00Z");

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    status: "DELIVERED",
    driverId: "d1",
    dropoffLat: "29.3",
    dropoffLng: "48.0",
    dropoffAddress: "Block 1",
    assignedAt,
    arrivedAt: null,
    pickedUpAt,
    deliveredAt,
    returnedAt: null,
    cancelledAt: null,
    updatedAt: deliveredAt,
    driver: { id: "d1", name: "Anil" },
    vendor: { name: "Royal Pharmacy" },
    branch: { name: "Salmiya", address: "Street 5", lat: "29.33", lng: "48.07" },
    ...overrides,
  };
}

beforeEach(() => {
  resetAllMocks();
  const p = prisma as any;
  p.deliveryOrder = { ...(p.deliveryOrder ?? {}), findFirst: jest.fn() };
  p.locationLog = { ...(p.locationLog ?? {}), findMany: jest.fn() };
});

describe("orderRoute", () => {
  it("returns both pins and the path between assignment and delivery, split at pickup", async () => {
    const p = prisma as any;
    p.deliveryOrder.findFirst.mockResolvedValue(baseOrder());
    p.locationLog.findMany.mockResolvedValue([
      { latitude: "29.31", longitude: "48.01", capturedAt: new Date("2026-10-14T10:05:00Z") },
      { latitude: "29.32", longitude: "48.02", capturedAt: new Date("2026-10-14T10:15:00Z") },
    ]);

    const route = await orderRoute("t1", "o1");

    expect(p.locationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driverId: "d1", capturedAt: { gte: assignedAt, lte: deliveredAt } },
      }),
    );
    expect(route).toMatchObject({
      pickup: { lat: 29.33, lng: 48.07, name: "Royal Pharmacy · Salmiya" },
      dropoff: { lat: 29.3, lng: 48.0, address: "Block 1" },
      thinned: false,
    });
    expect(route!.path.map((pt) => pt.leg)).toEqual(["TO_PICKUP", "TO_DROPOFF"]);
  });

  it("still returns the pins with an empty path when the order never had a driver", async () => {
    const p = prisma as any;
    p.deliveryOrder.findFirst.mockResolvedValue(
      baseOrder({ status: "CANCELLED", driverId: null, driver: null, assignedAt: null, pickedUpAt: null, deliveredAt: null }),
    );

    const route = await orderRoute("t1", "o1");

    expect(p.locationLog.findMany).not.toHaveBeenCalled();
    expect(route!.path).toEqual([]);
    expect(route!.pickup).not.toBeNull();
    expect(route!.dropoff).not.toBeNull();
  });

  it("answers null for an order outside the tenant", async () => {
    (prisma as any).deliveryOrder.findFirst.mockResolvedValue(null);
    expect(await orderRoute("t1", "nope")).toBeNull();
  });
});

describe("thinPath", () => {
  it("caps the point count and always keeps the first and last point", () => {
    const pts = Array.from({ length: 2000 }, (_, i) => i);
    const out = thinPath(pts, ROUTE_MAX_POINTS);
    expect(out).toHaveLength(ROUTE_MAX_POINTS);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(1999);
  });

  it("leaves a short path alone", () => {
    expect(thinPath([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });
});
