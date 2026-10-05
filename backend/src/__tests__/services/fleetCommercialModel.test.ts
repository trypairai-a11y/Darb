// Client note, 2026-08-16 (Osama, Darb ops head): "We have two models with the
// delivery companies: either a monthly subscription fee, or we take the
// difference from what is offered from the delivery company and what is
// accepted by the shop."
//
// MARGIN is every company's deal before the note and must cut exactly the
// statement it cut yesterday. SUBSCRIPTION pays the company the shop's fee per
// order and withholds one monthly fee on the statement as a deduction line.
// The failure this suite guards is silent: a subscription company paid base +
// km still produces a plausible statement, and so does one whose fee was never
// withheld.

import { Prisma } from "../../generated/prisma";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
const D = (v: string | number) => new Prisma.Decimal(v);

const {
  fleetRateOf,
  orderPayoutKwd,
  sumFleetPayout,
  generateFleetStatements,
  postFleetPayout,
} = require("../../services/fleetService");
const { isFlatRateFleet } = require("../../services/dispatch/fleetCostPolicy");

function attach() {
  const p = prisma as any;
  p.fleetPartner = p.fleetPartner ?? {};
  p.fleetPartner.findMany = jest.fn();
  p.fleetPayoutStatement = p.fleetPayoutStatement ?? {};
  p.fleetPayoutStatement.findFirst = jest.fn().mockResolvedValue(null);
  p.fleetPayoutStatement.create = jest.fn(async ({ data }: any) => ({ id: "fs-1", ...data }));
  p.fleetPayoutStatement.update = jest.fn(async ({ data }: any) => ({ id: "fs-1", ...data }));
  p.deliveryOrder = p.deliveryOrder ?? {};
  p.deliveryOrder.findMany = jest.fn();
  p.walletAccount = p.walletAccount ?? {};
  p.walletAccount.upsert = jest.fn(async ({ where }: any) => ({
    id: `acc:${where.tenantId_ownerKey.ownerKey}`, balanceKwd: D(0),
  }));
  p.walletAccount.update = jest.fn(async ({ where }: any) => ({ id: where.id, balanceKwd: D(0) }));
  p.walletTransaction = p.walletTransaction ?? {};
  p.walletTransaction.create = jest.fn(async ({ data }: any) => ({ id: "wtx-fleet", ...data }));
  p.walletEntry = p.walletEntry ?? {};
  p.walletEntry.create = jest.fn(async ({ data }: any) => ({ id: "we", ...data }));
  p.$transaction = jest.fn(async (fn: any) => fn(p));
  return p;
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
});

const PERIOD = { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z") };

describe("MARGIN is unchanged", () => {
  test("the rate object is the same shape it always was (no model key)", () => {
    const rate = fleetRateOf({
      flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150"), commercialModel: "MARGIN",
    });
    expect(Object.keys(rate).sort()).toEqual(["baseKwd", "perKmKwd"]);
    // A shop fee passed in is ignored: MARGIN pays base + km, never the shop fee.
    expect(orderPayoutKwd(rate, D("8.400"), D("3.000")).toFixed(3)).toBe("1.960");
  });

  test("an unrecognised model string reads as MARGIN, never as SUBSCRIPTION", () => {
    const rate = fleetRateOf({ flatFeePerOrderKwd: D("1.100"), commercialModel: "subscription " });
    expect(rate.model).toBeUndefined();
    expect(orderPayoutKwd(rate, null, D("2.500")).toFixed(3)).toBe("1.100");
  });

  test("the statement is cut with exactly the fields it was before, and no deduction", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([
      {
        id: "f-1", flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150"),
        commercialModel: "MARGIN", subscriptionFeeKwd: D("50.000"),
      },
    ]);
    p.deliveryOrder.findMany.mockResolvedValue([
      { distanceKm: D("4.000"), deliveryFeeKwd: D("2.000") },
      { distanceKm: D("6.000"), deliveryFeeKwd: D("2.500") },
    ]);

    expect(await generateFleetStatements("t-1", PERIOD)).toBe(1);

    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual([
      "deliveredOrders", "feePerOrderKwd", "fleetPartnerId", "perKmFeeKwd",
      "periodEnd", "periodStart", "tenantId", "totalKm", "totalKwd",
    ]);
    expect(data.feePerOrderKwd.toFixed(3)).toBe("0.700");
    expect(data.totalKm.toFixed(3)).toBe("10.000");
    // 2 x 0.700 + 0.150 x 10, the shop fees play no part.
    expect(data.totalKwd.toFixed(3)).toBe("2.900");
  });

  test("payout posts totalKwd with the old memo when no net is set", async () => {
    const p = attach();
    p.fleetPayoutStatement.findFirst.mockResolvedValue({
      id: "fs-1", deliveredOrders: 100, feePerOrderKwd: D("1.100"), totalKwd: D("110.000"),
      status: "CONFIRMED", commercialModel: "MARGIN", deductionsKwd: D(0), netPayableKwd: null,
    });

    await postFleetPayout({ tenantId: "t-1", statementId: "fs-1", actorId: "u-1" });

    const header = p.walletTransaction.create.mock.calls[0][0].data;
    expect(header.memo).toBe("Fleet payout fs-1: 100 orders x 1.100 KWD");
    const amounts = p.walletEntry.create.mock.calls.map((c: any) => c[0].data.amountKwd.toFixed(3));
    expect(amounts).toEqual(["110.000", "110.000"]);
  });
});

describe("SUBSCRIPTION", () => {
  const sub = () =>
    fleetRateOf({
      flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150"), commercialModel: "SUBSCRIPTION",
    });

  test("each order pays what the shop was charged, whatever the base and km rate say", () => {
    expect(orderPayoutKwd(sub(), D("8.400"), D("1.750")).toFixed(3)).toBe("1.750");
  });

  test("an order with no shop fee pays 0, not the base", () => {
    expect(orderPayoutKwd(sub(), D("3.000"), null).toFixed(3)).toBe("0.000");
  });

  test("the total is the sum of the shop fees", () => {
    const { totalKwd } = sumFleetPayout(sub(), [D("2"), null, D("9")], [D("1.500"), D("2.000"), null]);
    expect(totalKwd.toFixed(3)).toBe("3.500");
  });

  test("never fenced out of cross-zone orders as a flat-rate company", () => {
    const flatSub = fleetRateOf({
      flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: null, commercialModel: "SUBSCRIPTION",
    });
    expect(isFlatRateFleet(flatSub)).toBe(false);
  });

  test("the statement pays shop fees and carries one subscription deduction", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([
      {
        id: "f-2", flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150"),
        commercialModel: "SUBSCRIPTION", subscriptionFeeKwd: D("50.000"),
      },
    ]);
    p.deliveryOrder.findMany.mockResolvedValue(
      Array.from({ length: 40 }, () => ({ distanceKm: D("5.000"), deliveryFeeKwd: D("2.250") })),
    );

    expect(await generateFleetStatements("t-1", PERIOD)).toBe(1);
    expect(p.fleetPayoutStatement.create).toHaveBeenCalledTimes(1);

    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    expect(data.commercialModel).toBe("SUBSCRIPTION");
    expect(data.deliveredOrders).toBe(40);
    expect(data.totalKwd.toFixed(3)).toBe("90.000"); // 40 x 2.250
    expect(data.perKmFeeKwd).toBeNull();
    expect(data.totalKm).toBeNull();
    expect(data.deductionsKwd.toFixed(3)).toBe("50.000");
    expect(data.netPayableKwd.toFixed(3)).toBe("40.000");

    const lines = data.deductions.create;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      tenantId: "t-1",
      fleetPartnerId: "f-2",
      reason: "SUBSCRIPTION",
      status: "APPLIED",
      incurredAt: PERIOD.start,
    });
    expect(lines[0].amountKwd.toFixed(3)).toBe("50.000");
  });

  test("payout posts the net after the subscription, not the gross", async () => {
    const p = attach();
    p.fleetPayoutStatement.findFirst.mockResolvedValue({
      id: "fs-2", deliveredOrders: 40, feePerOrderKwd: D(0), totalKwd: D("90.000"),
      status: "CONFIRMED", commercialModel: "SUBSCRIPTION",
      deductionsKwd: D("50.000"), netPayableKwd: D("40.000"),
    });

    await postFleetPayout({ tenantId: "t-1", statementId: "fs-2", actorId: "u-1" });

    const amounts = p.walletEntry.create.mock.calls.map((c: any) => c[0].data.amountKwd.toFixed(3));
    expect(amounts).toEqual(["40.000", "40.000"]);
    expect(p.walletTransaction.create.mock.calls[0][0].data.memo).toContain("less subscription 50.000");
  });

  test("a month whose fee exceeds the shop fees closes with no transfer", async () => {
    const p = attach();
    p.fleetPayoutStatement.findFirst.mockResolvedValue({
      id: "fs-3", deliveredOrders: 3, feePerOrderKwd: D(0), totalKwd: D("6.000"),
      status: "FINAL", commercialModel: "SUBSCRIPTION",
      deductionsKwd: D("50.000"), netPayableKwd: D("-44.000"),
    });

    expect(await postFleetPayout({ tenantId: "t-1", statementId: "fs-3", actorId: "u-1" })).toBeNull();
    expect(p.walletTransaction.create).not.toHaveBeenCalled();
  });
});
