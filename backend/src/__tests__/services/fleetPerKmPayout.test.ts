// Revision 14 (#3): what Darb pays a delivery company is a base fee per
// delivered order plus a rate for every kilometre those orders covered.
//
// The client's note was "the price should be base + kilometer", against a
// payouts screen showing one flat KD 1.100. This suite pins the money math,
// because the failure mode is silent: a formula that quietly pays the base
// alone still produces a plausible statement, and nobody finds out until a
// subcontractor reconciles a month by hand.

import { Prisma } from "../../generated/prisma";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
const D = (v: string | number) => new Prisma.Decimal(v);

const {
  fleetRateOf,
  orderPayoutKwd,
  sumFleetPayout,
  generateFleetStatements,
} = require("../../services/fleetService");

beforeEach(() => {
  resetAllMocks();
});

describe("fleetRateOf", () => {
  test("perKmFeeKwd NULL is a flat-rate company, not a zero-kilometre one", () => {
    const rate = fleetRateOf({ flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: null });
    expect(rate.baseKwd.toFixed(3)).toBe("1.100");
    expect(rate.perKmKwd).toBeNull();
  });

  test("both halves read through when the company is on a kilometre rate", () => {
    const rate = fleetRateOf({ flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150") });
    expect(rate.baseKwd.toFixed(3)).toBe("0.700");
    expect(rate.perKmKwd.toFixed(3)).toBe("0.150");
  });
});

describe("orderPayoutKwd", () => {
  const rate = fleetRateOf({ flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150") });

  test("base + rate x kilometres, to the fil", () => {
    // 0.700 + 0.150 x 8.400 = 0.700 + 1.260
    expect(orderPayoutKwd(rate, D("8.400")).toFixed(3)).toBe("1.960");
  });

  test("a flat-rate company is paid the base however far the driver went", () => {
    const flat = fleetRateOf({ flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: null });
    expect(orderPayoutKwd(flat, D("14.000")).toFixed(3)).toBe("1.100");
  });

  // The order Darb could not measure. Paying it the base is the deliberate
  // choice: dropping it would lose the company a delivery it actually made,
  // and re-measuring it now would invent a figure the merchant was never
  // charged on.
  test("an order with no distance pays the base, and is never dropped", () => {
    expect(orderPayoutKwd(rate, null).toFixed(3)).toBe("0.700");
  });

  test("a zero-kilometre order still earns the base", () => {
    expect(orderPayoutKwd(rate, D("0")).toFixed(3)).toBe("0.700");
  });
});

describe("sumFleetPayout", () => {
  const rate = fleetRateOf({ flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150") });

  test("the total is the sum of the lines, and the kilometres come back with it", () => {
    const { totalKwd, totalKm, ordersMissingDistance } = sumFleetPayout(rate, [
      D("4.000"), // 0.700 + 0.600 = 1.300
      D("10.000"), // 0.700 + 1.500 = 2.200
    ]);
    expect(totalKwd.toFixed(3)).toBe("3.500");
    expect(totalKm.toFixed(3)).toBe("14.000");
    expect(ordersMissingDistance).toBe(0);
  });

  // This is the whole reason the total is summed from the orders rather than
  // computed as base x count + rate x Σkm. Three lines each rounding up half a
  // fil add to one fil more than the shortcut, and a delivery company adding
  // up its own statement by hand and finding it short has no way to tell that
  // from an error.
  test("rounding: the printed lines add up to the printed total", () => {
    const distances = [D("1.003"), D("1.003"), D("1.003")];
    const { totalKwd } = sumFleetPayout(rate, distances);
    const lines = distances.map((km) => orderPayoutKwd(rate, km));
    const byHand = lines.reduce((a, b) => a.plus(b), new Prisma.Decimal(0));
    expect(totalKwd.toFixed(3)).toBe(byHand.toFixed(3));
  });

  test("unmeasured orders are counted, so a base-only line is visible", () => {
    const { totalKwd, totalKm, ordersMissingDistance } = sumFleetPayout(rate, [
      D("6.000"), // 1.600
      null, // 0.700
    ]);
    expect(totalKwd.toFixed(3)).toBe("2.300");
    expect(totalKm.toFixed(3)).toBe("6.000");
    expect(ordersMissingDistance).toBe(1);
  });

  test("a flat-rate company is unaffected by distance entirely", () => {
    const flat = fleetRateOf({ flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: null });
    const { totalKwd } = sumFleetPayout(flat, [D("2.000"), D("12.000"), null]);
    expect(totalKwd.toFixed(3)).toBe("3.300");
  });
});

describe("generateFleetStatements", () => {
  function attach() {
    const p = prisma as any;
    p.fleetPartner = p.fleetPartner ?? {};
    p.fleetPartner.findMany = jest.fn();
    p.fleetPayoutStatement = p.fleetPayoutStatement ?? {};
    p.fleetPayoutStatement.findFirst = jest.fn().mockResolvedValue(null);
    p.fleetPayoutStatement.create = jest.fn(async ({ data }: any) => ({ id: "fs-1", ...data }));
    p.deliveryOrder = p.deliveryOrder ?? {};
    p.deliveryOrder.findMany = jest.fn();
    return p;
  }

  const PERIOD = { start: new Date("2026-07-01T00:00:00Z"), end: new Date("2026-08-01T00:00:00Z") };

  test("snapshots both halves of the rate and the kilometres it was cut on", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([
      { id: "f-1", flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150") },
    ]);
    p.deliveryOrder.findMany.mockResolvedValue([
      { distanceKm: D("4.000") },
      { distanceKm: D("6.000") },
    ]);

    expect(await generateFleetStatements("t-1", PERIOD)).toBe(1);

    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    expect(data.deliveredOrders).toBe(2);
    expect(data.feePerOrderKwd.toFixed(3)).toBe("0.700");
    expect(data.perKmFeeKwd.toFixed(3)).toBe("0.150");
    expect(data.totalKm.toFixed(3)).toBe("10.000");
    // 2 x 0.700 + 0.150 x 10 = 1.400 + 1.500
    expect(data.totalKwd.toFixed(3)).toBe("2.900");
  });

  // The migration ships with every partner on perKmFeeKwd NULL, so this is the
  // state prod is in the minute the deploy lands. It must cut exactly the
  // statement it cut yesterday.
  test("a flat-rate company's statement is unchanged, and carries no kilometre snapshot", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([
      { id: "f-1", flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: null },
    ]);
    p.deliveryOrder.findMany.mockResolvedValue(
      Array.from({ length: 240 }, () => ({ distanceKm: D("7.500") })),
    );

    await generateFleetStatements("t-1", PERIOD);

    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    expect(data.deliveredOrders).toBe(240);
    expect(data.perKmFeeKwd).toBeNull();
    expect(data.totalKm).toBeNull();
    expect(data.totalKwd.toFixed(3)).toBe("264.000");
  });

  test("a month with no deliveries is a KD 0.000 statement, not a skipped one", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([
      { id: "f-1", flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150") },
    ]);
    p.deliveryOrder.findMany.mockResolvedValue([]);

    expect(await generateFleetStatements("t-1", PERIOD)).toBe(1);
    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    expect(data.deliveredOrders).toBe(0);
    expect(data.totalKwd.toFixed(3)).toBe("0.000");
  });
});
