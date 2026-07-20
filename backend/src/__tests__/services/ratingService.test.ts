// Ratings (PRD §12): once per order, DELIVERED only, low stars feed the
// violation ladder as LOW_CUSTOMER_RATING on platform DARB.

import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
prisma.deliveryOrder.findFirst = prisma.deliveryOrder.findFirst ?? jest.fn();
prisma.orderRating = prisma.orderRating ?? {};
for (const fn of ["create", "aggregate"]) {
  prisma.orderRating[fn] = prisma.orderRating[fn] ?? jest.fn();
}

jest.mock("../../services/violationEngine", () => ({
  createViolationWithAlert: jest.fn().mockResolvedValue({ id: "vio-1" }),
}));
const { createViolationWithAlert } = require("../../services/violationEngine");
const { submitRating, getDriverRating, RatingError } = require("../../services/ratingService");

const TENANT = "t-1";
const DELIVERED_ORDER = {
  id: "ord-1",
  status: "DELIVERED",
  driverId: "drv-1",
  orderNumber: "DRB-ROYL-0001",
  vendorId: "v-1",
};

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.deliveryOrder.findFirst.mockResolvedValue(DELIVERED_ORDER);
  prisma.orderRating.create.mockImplementation(async ({ data }: any) => ({ id: "r-1", ...data }));
});

// Let fire-and-forget promises settle inside a test.
const flushMicrotasks = () => new Promise((r) => setImmediate(r));

describe("submitRating", () => {
  test("5 stars: rating stored, NO violation raised", async () => {
    const rating = await submitRating({ tenantId: TENANT, orderId: "ord-1", stars: 5, comment: "fast!" });
    await flushMicrotasks();

    expect(rating.stars).toBe(5);
    expect(prisma.orderRating.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ driverId: "drv-1", stars: 5, comment: "fast!" }),
      }),
    );
    expect(createViolationWithAlert).not.toHaveBeenCalled();
  });

  test("2 stars or below feeds the violation ladder (LOW_CUSTOMER_RATING, platform DARB)", async () => {
    await submitRating({ tenantId: TENANT, orderId: "ord-1", stars: 1, comment: "cold food" });
    await flushMicrotasks();

    expect(createViolationWithAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        driverId: "drv-1",
        platform: "DARB",
        violationType: "LOW_CUSTOMER_RATING",
        taskId: "ord-1",
      }),
    );
  });

  test("3 stars does NOT raise a violation (threshold is <=2)", async () => {
    await submitRating({ tenantId: TENANT, orderId: "ord-1", stars: 3 });
    await flushMicrotasks();
    expect(createViolationWithAlert).not.toHaveBeenCalled();
  });

  test("duplicate rating (P2002 on orderId unique) → 409 RatingError", async () => {
    prisma.orderRating.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(
      submitRating({ tenantId: TENANT, orderId: "ord-1", stars: 4 }),
    ).rejects.toMatchObject({ httpStatus: 409 });
  });

  test("non-DELIVERED orders cannot be rated", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...DELIVERED_ORDER, status: "PICKED_UP" });
    await expect(
      submitRating({ tenantId: TENANT, orderId: "ord-1", stars: 4 }),
    ).rejects.toMatchObject({ httpStatus: 409 });
  });

  test("stars outside 1..5 are rejected before any DB access", async () => {
    for (const stars of [0, 6, NaN]) {
      await expect(
        submitRating({ tenantId: TENANT, orderId: "ord-1", stars }),
      ).rejects.toThrow(RatingError);
    }
    expect(prisma.orderRating.create).not.toHaveBeenCalled();
  });
});

describe("getDriverRating", () => {
  test("aggregate math, rounded to 2dp", async () => {
    prisma.orderRating.aggregate.mockResolvedValue({
      _avg: { stars: 4.3333333 },
      _count: { _all: 3 },
    });
    expect(await getDriverRating(TENANT, "drv-1")).toEqual({ avg: 4.33, count: 3 });
  });

  test("no ratings yet → avg null", async () => {
    prisma.orderRating.aggregate.mockResolvedValue({ _avg: { stars: null }, _count: { _all: 0 } });
    expect(await getDriverRating(TENANT, "drv-1")).toEqual({ avg: null, count: 0 });
  });
});
