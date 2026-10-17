// Revision 24b — private shifts reach the real money flow, and the company is
// paid its per-vehicle per-order rate.
//
//   * the delivery company's monthly statement carries its completed private
//     shifts as their own lines, inside the total, and stamps them so no
//     shift is paid twice;
//   * an order carried on a private shift is never ALSO counted per order;
//   * a MARGIN company is paid each order at its vehicle type's per-order
//     rate, blank falls back to the base; SUBSCRIPTION keeps the shop fee;
//   * the shop statement breaks out the private-shift charges.
//
// House pattern: the shared prisma stub with this suite's own delegates.

import { Prisma } from "../../generated/prisma";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
const D = (v: string | number) => new Prisma.Decimal(v);

const {
  fleetRateOf,
  orderPayoutKwd,
  sumFleetPayout,
  vehicleBaseOf,
  vehicleRateOf,
  perKmApplies,
  generateFleetStatements,
  postFleetPayout,
} = require("../../services/fleetService");
const { generateMonthlyStatements } = require("../../services/wallet/vendorSettlementService");
const { privateShiftIdForAssignment } = require("../../services/privateShifts/privateShiftStamp");

const PERIOD = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-11-01T00:00:00Z") };

function attach() {
  const p = prisma as any;
  p.fleetPartner = p.fleetPartner ?? {};
  p.fleetPartner.findMany = jest.fn();
  p.fleetPayoutStatement = p.fleetPayoutStatement ?? {};
  p.fleetPayoutStatement.findFirst = jest.fn().mockResolvedValue(null);
  p.fleetPayoutStatement.create = jest.fn(async ({ data }: any) => ({ id: "fs-1", ...data }));
  p.fleetPayoutStatement.update = jest.fn(async ({ data }: any) => ({ id: "fs-1", ...data }));
  p.deliveryOrder = p.deliveryOrder ?? {};
  p.deliveryOrder.findMany = jest.fn().mockResolvedValue([]);
  p.fleetVehicleRate = { findMany: jest.fn().mockResolvedValue([]) };
  p.privateShift = {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    findFirst: jest.fn(),
  };
  p.walletAccount = p.walletAccount ?? {};
  p.walletAccount.upsert = jest.fn(async ({ where }: any) => ({
    id: `acc:${where.tenantId_ownerKey.ownerKey}`, balanceKwd: D(0),
  }));
  p.walletAccount.update = jest.fn(async ({ where }: any) => ({ id: where.id, balanceKwd: D(0) }));
  p.walletAccount.findMany = jest.fn();
  p.walletTransaction = p.walletTransaction ?? {};
  p.walletTransaction.create = jest.fn(async ({ data }: any) => ({ id: "wtx-1", ...data }));
  p.walletEntry = p.walletEntry ?? {};
  p.walletEntry.create = jest.fn(async ({ data }: any) => ({ id: "we", ...data }));
  p.walletEntry.findFirst = jest.fn();
  p.walletEntry.findMany = jest.fn();
  p.vendorStatement = p.vendorStatement ?? {};
  p.vendorStatement.findFirst = jest.fn();
  p.vendorStatement.create = jest.fn(async ({ data }: any) => ({ id: "st-1", ...data }));
  p.$transaction = jest.fn(async (fn: any) => fn(p));
  return p;
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
});

const MARGIN_FLEET = {
  id: "f-1", flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: null,
  commercialModel: "MARGIN", subscriptionFeeKwd: null,
};

describe("per-vehicle per-order rates (#3)", () => {
  const flat = fleetRateOf({ flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: null });
  const perKm = fleetRateOf({ flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150") });

  test("the vehicle's rate replaces the base; blank keeps the base", () => {
    expect(orderPayoutKwd(flat, null, null, D("1.400")).toFixed(3)).toBe("1.400");
    expect(orderPayoutKwd(flat, null, null, null).toFixed(3)).toBe("1.100");
  });

  test("on a kilometre company the kilometre half still applies on top", () => {
    // 0.900 + 0.150 x 4
    expect(orderPayoutKwd(perKm, D("4.000"), null, D("0.900")).toFixed(3)).toBe("1.500");
  });

  test("SUBSCRIPTION ignores the vehicle rate and pays the shop fee", () => {
    const sub = fleetRateOf({ flatFeePerOrderKwd: D("1.100"), commercialModel: "SUBSCRIPTION" });
    expect(orderPayoutKwd(sub, null, D("2.000"), D("1.400")).toFixed(3)).toBe("2.000");
  });

  test("vehicleBaseOf reads a snapshot, and anything unreadable is the base", () => {
    expect(vehicleBaseOf({ CAR: "1.400", MOTORCYCLE: null }, "CAR").toFixed(3)).toBe("1.400");
    expect(vehicleBaseOf({ CAR: "1.400", MOTORCYCLE: null }, "MOTORCYCLE")).toBeNull();
    expect(vehicleBaseOf(null, "CAR")).toBeNull();
    expect(vehicleBaseOf({ CAR: "x" }, "CAR")).toBeNull();
    expect(vehicleBaseOf({ CAR: "1.400" }, null)).toBeNull();
  });

  test("sumFleetPayout totals line by line with the vehicle rates", () => {
    const { totalKwd } = sumFleetPayout(flat, [null, null, null], undefined, [D("1.400"), null, D("0.900")]);
    expect(totalKwd.toFixed(3)).toBe("3.400");
  });

  test("the statement pays each order at its vehicle's rate and snapshots the rates", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([MARGIN_FLEET]);
    p.fleetVehicleRate.findMany.mockResolvedValue([
      { vehicleType: "CAR", perOrderKwd: D("1.500") },
      { vehicleType: "MOTORCYCLE", perOrderKwd: null },
    ]);
    p.deliveryOrder.findMany.mockResolvedValue([
      { distanceKm: null, deliveryFeeKwd: D("2.000"), driver: { vehicleType: "CAR" } },
      { distanceKm: null, deliveryFeeKwd: D("2.000"), driver: { vehicleType: "CAR" } },
      { distanceKm: null, deliveryFeeKwd: D("2.000"), driver: { vehicleType: "MOTORCYCLE" } },
    ]);

    expect(await generateFleetStatements("t-1", PERIOD)).toBe(1);
    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    // 2 x 1.500 (car) + 1 x 1.100 (motorcycle, blank = base)
    expect(data.totalKwd.toFixed(3)).toBe("4.100");
    expect(data.ordersKwd.toFixed(3)).toBe("4.100");
    expect(data.feePerOrderKwd.toFixed(3)).toBe("1.100");
    expect(data.vehicleRates).toEqual({
      CAR: { base: "1.500", perKm: null },
      MOTORCYCLE: { base: null, perKm: null },
    });
    // Flat company, no vehicle per-km: no kilometres on the statement.
    expect(data.totalKm).toBeNull();
  });

  test("no per-vehicle rate anywhere: no snapshot, the base as before", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([MARGIN_FLEET]);
    p.fleetVehicleRate.findMany.mockResolvedValue([{ vehicleType: "CAR", perOrderKwd: null }]);
    p.deliveryOrder.findMany.mockResolvedValue([
      { distanceKm: null, deliveryFeeKwd: D("2.000"), driver: { vehicleType: "CAR" } },
    ]);
    await generateFleetStatements("t-1", PERIOD);
    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    expect(data.totalKwd.toFixed(3)).toBe("1.100");
    expect(data).not.toHaveProperty("vehicleRates");
  });

  test("SUBSCRIPTION never reads the vehicle rates and keeps paying the shop fee", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([
      { ...MARGIN_FLEET, commercialModel: "SUBSCRIPTION", subscriptionFeeKwd: D("10.000") },
    ]);
    p.deliveryOrder.findMany.mockResolvedValue([
      { distanceKm: null, deliveryFeeKwd: D("2.250"), driver: { vehicleType: "CAR" } },
    ]);
    await generateFleetStatements("t-1", PERIOD);
    expect(p.fleetVehicleRate.findMany).not.toHaveBeenCalled();
    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    expect(data.totalKwd.toFixed(3)).toBe("2.250");
  });
});

// Client note, 2026-10-15 (Osama): "for the delivery company motorcycle and
// car please make it as base fee and per kilometer for the per order".
describe("per-vehicle base fee + per km (2026-10-15)", () => {
  const flat = fleetRateOf({ flatFeePerOrderKwd: D("1.100"), perKmFeeKwd: null });
  const perKm = fleetRateOf({ flatFeePerOrderKwd: D("0.700"), perKmFeeKwd: D("0.150") });
  const V = (base: string | null, km: string | null) => ({
    baseKwd: base == null ? null : D(base),
    perKmKwd: km == null ? null : D(km),
  });

  test("the vehicle's base + its own per km x distance", () => {
    // 0.800 + 0.100 x 5 on a company that is otherwise flat
    expect(orderPayoutKwd(flat, D("5.000"), null, V("0.800", "0.100")).toFixed(3)).toBe("1.300");
    // the vehicle's per km beats the company's: 0.700 + 0.100 x 4
    expect(orderPayoutKwd(perKm, D("4.000"), null, V(null, "0.100")).toFixed(3)).toBe("1.100");
  });

  test("the vehicle's base with the company's per km when the vehicle has none", () => {
    // 0.900 + 0.150 x 4
    expect(orderPayoutKwd(perKm, D("4.000"), null, V("0.900", null)).toFixed(3)).toBe("1.500");
  });

  test("no per km anywhere is flat: the vehicle base alone", () => {
    expect(orderPayoutKwd(flat, D("9.000"), null, V("1.250", null)).toFixed(3)).toBe("1.250");
  });

  test("an order with no distance pays the base alone", () => {
    expect(orderPayoutKwd(flat, null, null, V("0.800", "0.100")).toFixed(3)).toBe("0.800");
    expect(orderPayoutKwd(perKm, null, null, V(null, "0.100")).toFixed(3)).toBe("0.700");
  });

  test("SUBSCRIPTION still pays the shop fee", () => {
    const sub = fleetRateOf({ flatFeePerOrderKwd: D("1.100"), commercialModel: "SUBSCRIPTION" });
    expect(orderPayoutKwd(sub, D("5.000"), D("2.000"), V("0.800", "0.100")).toFixed(3)).toBe("2.000");
  });

  test("the snapshot reader accepts the old string shape and the new object shape", () => {
    // Old statements: a bare base, no vehicle per km (the company's applies).
    const old = vehicleRateOf({ MOTORCYCLE: "1.250", CAR: null }, "MOTORCYCLE");
    expect(old.baseKwd.toFixed(3)).toBe("1.250");
    expect(old.perKmKwd).toBeNull();
    expect(vehicleRateOf({ MOTORCYCLE: "1.250", CAR: null }, "CAR")).toBeNull();
    expect(orderPayoutKwd(perKm, D("4.000"), null, old).toFixed(3)).toBe("1.850");

    const fresh = { MOTORCYCLE: { base: "0.800", perKm: "0.100" }, CAR: { base: null, perKm: "0.200" } };
    const moto = vehicleRateOf(fresh, "MOTORCYCLE");
    expect(moto.baseKwd.toFixed(3)).toBe("0.800");
    expect(moto.perKmKwd.toFixed(3)).toBe("0.100");
    const car = vehicleRateOf(fresh, "CAR");
    expect(car.baseKwd).toBeNull();
    expect(car.perKmKwd.toFixed(3)).toBe("0.200");
    expect(vehicleBaseOf(fresh, "MOTORCYCLE").toFixed(3)).toBe("0.800");
    expect(vehicleBaseOf(fresh, "CAR")).toBeNull();
    expect(vehicleRateOf({ CAR: { base: null, perKm: null } }, "CAR")).toBeNull();
    expect(vehicleRateOf({ CAR: { base: "x", perKm: "y" } }, "CAR")).toBeNull();

    expect(perKmApplies(flat, { MOTORCYCLE: "1.250" })).toBe(false);
    expect(perKmApplies(flat, fresh)).toBe(true);
    expect(perKmApplies(perKm, null)).toBe(true);
  });

  test("sumFleetPayout mixes vehicle rates of both kinds line by line", () => {
    const { totalKwd, totalKm, ordersMissingDistance } = sumFleetPayout(
      flat,
      [D("5.000"), null, D("2.000")],
      undefined,
      [V("0.800", "0.100"), V("0.800", "0.100"), D("1.400")],
    );
    // 1.300 + 0.800 (no distance) + 1.400 (bare base, flat company)
    expect(totalKwd.toFixed(3)).toBe("3.500");
    expect(totalKm.toFixed(3)).toBe("7.000");
    expect(ordersMissingDistance).toBe(1);
  });

  test("the statement pays base + per km per vehicle and snapshots both halves", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([MARGIN_FLEET]);
    p.fleetVehicleRate.findMany.mockResolvedValue([
      { vehicleType: "MOTORCYCLE", perOrderKwd: D("0.800"), perKmKwd: D("0.100") },
      { vehicleType: "CAR", perOrderKwd: D("1.200"), perKmKwd: null },
    ]);
    p.deliveryOrder.findMany.mockResolvedValue([
      { distanceKm: D("5.000"), deliveryFeeKwd: D("2.000"), driver: { vehicleType: "MOTORCYCLE" } },
      { distanceKm: D("3.000"), deliveryFeeKwd: D("2.000"), driver: { vehicleType: "CAR" } },
    ]);
    await generateFleetStatements("t-1", PERIOD);
    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    // 0.800 + 0.100 x 5 = 1.300, car flat 1.200
    expect(data.totalKwd.toFixed(3)).toBe("2.500");
    expect(data.vehicleRates).toEqual({
      MOTORCYCLE: { base: "0.800", perKm: "0.100" },
      CAR: { base: "1.200", perKm: null },
    });
    // A vehicle is paid per km, so the kilometres are on the statement.
    expect(data.totalKm.toFixed(3)).toBe("8.000");
  });
});

describe("private shifts on the company's statement (#1)", () => {
  test("orders carried on a private shift are excluded from the per-order count", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([MARGIN_FLEET]);
    await generateFleetStatements("t-1", PERIOD);
    const { where } = p.deliveryOrder.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ isTraining: false, privateShiftId: null, status: "DELIVERED" });
  });

  test("completed shifts are their own lines inside the total, and are stamped with the statement", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([MARGIN_FLEET]);
    p.deliveryOrder.findMany.mockResolvedValue([
      { distanceKm: null, deliveryFeeKwd: D("2.000"), driver: { vehicleType: "MOTORCYCLE" } },
    ]);
    p.privateShift.findMany.mockResolvedValue([
      { id: "ps-1", billableMinutes: 200, fleetPayKwd: D("6.667") },
      { id: "ps-2", billableMinutes: 240, fleetPayKwd: D("8.000") },
      // No hourly rate on the company's vehicle: listed, paid nothing.
      { id: "ps-3", billableMinutes: 120, fleetPayKwd: null },
    ]);

    await generateFleetStatements("t-1", PERIOD);

    const shiftQuery = p.privateShift.findMany.mock.calls[0][0].where;
    expect(shiftQuery).toMatchObject({
      tenantId: "t-1",
      fleetPartnerId: "f-1",
      status: "COMPLETED",
      fleetStatementId: null,
      endAt: { gte: PERIOD.start, lt: PERIOD.end },
    });

    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    expect(data.deliveredOrders).toBe(1);
    expect(data.ordersKwd.toFixed(3)).toBe("1.100");
    expect(data.privateShiftCount).toBe(3);
    expect(data.privateShiftMinutes).toBe(560);
    expect(data.privateShiftPayKwd.toFixed(3)).toBe("14.667");
    expect(data.totalKwd.toFixed(3)).toBe("15.767");

    expect(p.privateShift.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t-1", id: { in: ["ps-1", "ps-2", "ps-3"] }, fleetStatementId: null },
      data: { fleetStatementId: "fs-1" },
    });
  });

  test("on SUBSCRIPTION the shifts are paid on top of the shop fees, before the subscription", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([
      { ...MARGIN_FLEET, commercialModel: "SUBSCRIPTION", subscriptionFeeKwd: D("5.000") },
    ]);
    p.deliveryOrder.findMany.mockResolvedValue([
      { distanceKm: null, deliveryFeeKwd: D("2.000"), driver: { vehicleType: "CAR" } },
    ]);
    p.privateShift.findMany.mockResolvedValue([{ id: "ps-1", billableMinutes: 240, fleetPayKwd: D("8.000") }]);

    await generateFleetStatements("t-1", PERIOD);
    const { data } = p.fleetPayoutStatement.create.mock.calls[0][0];
    expect(data.totalKwd.toFixed(3)).toBe("10.000");
    expect(data.netPayableKwd.toFixed(3)).toBe("5.000");
    expect(data.privateShiftPayKwd.toFixed(3)).toBe("8.000");
  });

  test("a month already cut is never recomputed", async () => {
    const p = attach();
    p.fleetPartner.findMany.mockResolvedValue([MARGIN_FLEET]);
    p.fleetPayoutStatement.findFirst.mockResolvedValue({ id: "fs-old" });
    expect(await generateFleetStatements("t-1", PERIOD)).toBe(0);
    expect(p.privateShift.findMany).not.toHaveBeenCalled();
    expect(p.fleetPayoutStatement.create).not.toHaveBeenCalled();
  });

  test("the shift pay is only paid through CONFIRMED to PAID, with a memo naming it", async () => {
    const p = attach();
    p.fleetPayoutStatement.findFirst.mockResolvedValue({
      id: "fs-1", deliveredOrders: 1, feePerOrderKwd: D("1.100"), totalKwd: D("15.767"),
      ordersKwd: D("1.100"), privateShiftCount: 3, privateShiftPayKwd: D("14.667"),
      status: "FINAL", commercialModel: "MARGIN", deductionsKwd: D(0), netPayableKwd: null,
    });
    await expect(postFleetPayout({ tenantId: "t-1", statementId: "fs-1", actorId: "u-1" })).rejects.toThrow(
      /not confirmed/,
    );

    p.fleetPayoutStatement.findFirst.mockResolvedValue({
      id: "fs-1", deliveredOrders: 1, feePerOrderKwd: D("1.100"), totalKwd: D("15.767"),
      ordersKwd: D("1.100"), privateShiftCount: 3, privateShiftPayKwd: D("14.667"),
      status: "CONFIRMED", commercialModel: "MARGIN", deductionsKwd: D(0), netPayableKwd: null,
    });
    await postFleetPayout({ tenantId: "t-1", statementId: "fs-1", actorId: "u-1" });
    const header = p.walletTransaction.create.mock.calls[0][0].data;
    expect(header.idempotencyKey).toBe("fleet-payout:fs-1");
    expect(header.memo).toBe("Fleet payout fs-1: 1 orders 1.100 KWD + 3 private shifts 14.667 KWD");
    const amounts = p.walletEntry.create.mock.calls.map((c: any) => c[0].data.amountKwd.toFixed(3));
    expect(amounts).toEqual(["15.767", "15.767"]);
  });
});

describe("the shop statement breaks out private shifts (#1)", () => {
  test("PRIVATE_SHIFT_CHARGE debits are their own component and the closing is the ledger's", async () => {
    const p = attach();
    p.walletAccount.findMany.mockResolvedValue([{ id: "acc-1", ownerKey: "VENDOR:v-1" }]);
    p.vendorStatement.findFirst.mockResolvedValue(null);
    p.walletEntry.findFirst.mockImplementation(async ({ where }: any) =>
      where.createdAt?.lt && !where.createdAt?.gte
        ? { runningBalanceKwd: D("0.000") }
        : { runningBalanceKwd: D("-7.000") },
    );
    p.walletEntry.findMany.mockResolvedValue([
      { direction: "CREDIT", amountKwd: D("5.000"), transaction: { type: "COD_SETTLEMENT" } },
      { direction: "DEBIT", amountKwd: D("12.000"), transaction: { type: "PRIVATE_SHIFT_CHARGE" } },
    ]);

    expect(await generateMonthlyStatements("t-1", PERIOD)).toBe(1);
    const data = p.vendorStatement.create.mock.calls[0][0].data;
    expect(data.privateShiftsKwd.toFixed(3)).toBe("12.000");
    expect(data.prepaidFeesKwd.toFixed(3)).toBe("0.000");
    expect(data.closingBalanceKwd.toFixed(3)).toBe("-7.000");
  });
});

describe("privateShiftIdForAssignment (#2)", () => {
  test("only a STARTED shift for this order's own vendor and branch, covering now", async () => {
    const db = { privateShift: { findFirst: jest.fn().mockResolvedValue({ id: "ps-1" }) } };
    const at = new Date("2026-10-15T10:00:00Z");
    const id = await privateShiftIdForAssignment(db, {
      tenantId: "t-1", driverId: "d-1", vendorId: "v-1", branchId: "b-1", at,
    });
    expect(id).toBe("ps-1");
    expect(db.privateShift.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: "t-1",
      driverId: "d-1",
      vendorId: "v-1",
      branchId: "b-1",
      status: "IN_PROGRESS",
      startedAt: { lte: at },
      endAt: { gt: at },
    });
  });

  test("no branch on the order means no shift, without a query", async () => {
    const db = { privateShift: { findFirst: jest.fn() } };
    expect(
      await privateShiftIdForAssignment(db, {
        tenantId: "t-1", driverId: "d-1", vendorId: "v-1", branchId: null, at: new Date(),
      }),
    ).toBeNull();
    expect(db.privateShift.findFirst).not.toHaveBeenCalled();
  });
});
