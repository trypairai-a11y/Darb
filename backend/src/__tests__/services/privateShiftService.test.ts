// Revision 24 (#8 to #11) — the private shift service: the start geofence,
// who may book what, the plan proposal, and the settlement written at the end.
//
// House pattern: the shared prisma stub with this suite's own delegates
// attached, never added to mocks/config.ts.

import { getMockPrisma, resetAllMocks } from "../setup";
import { Prisma } from "../../generated/prisma";

const prisma = getMockPrisma();
const fns = (...names: string[]) => Object.fromEntries(names.map((n) => [n, jest.fn()]));
const delegates: Record<string, Record<string, jest.Mock>> = {};

const {
  bookPrivateShift,
  createPrivateShiftPlan,
  endPrivateShift,
  startPrivateShift,
  saveVendorVehiclePlans,
  parseFleetVehicleRates,
  writeFleetVehicleRates,
} = require("../../services/privateShifts/privateShiftService");

const SHOP = { lat: 29.3759, lng: 47.9774 };
const D = (v: string | number) => new Prisma.Decimal(v);
const DRIVER = {
  id: "drv-1",
  tenantId: "t-1",
  vehicleType: "MOTORCYCLE",
  status: "ACTIVE",
  privateShiftEligible: true,
  fleetPartnerId: "f-1",
};
const NOW = new Date("2026-10-14T09:00:00.000Z");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

function shift(over: Record<string, unknown> = {}) {
  return {
    id: "ps-1",
    tenantId: "t-1",
    planId: null,
    vendorId: "v-1",
    branchId: "br-1",
    vehicleType: "MOTORCYCLE",
    date: "2026-10-14",
    startAt: at(0),
    endAt: at(240),
    status: "BOOKED",
    source: "ADMIN",
    driverId: "drv-1",
    fleetPartnerId: "f-1",
    bookedAt: null,
    startedAt: null,
    endedAt: null,
    ...over,
  };
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  delegates.privateShift = fns("findFirst", "findMany", "updateMany", "update", "createMany", "deleteMany");
  delegates.privateShiftPlan = fns("create", "findFirst", "update", "updateMany", "findMany");
  delegates.privateShiftDeduction = fns("deleteMany", "createMany");
  delegates.vendorBranch = fns("findFirst", "findMany");
  delegates.vendorVehiclePlan = fns("findFirst", "findMany", "upsert");
  delegates.fleetVehicleRate = fns("findFirst", "findMany", "upsert");
  delegates.shift = fns("findFirst");
  delegates.locationLog = fns("findMany");
  delegates.deliveryPlan = fns("count");
  // Revision 24b: completing a shift charges the shop through the wallet.
  delegates.walletAccount = fns("upsert", "update");
  delegates.walletTransaction = fns("create");
  delegates.walletEntry = fns("create");
  for (const [k, v] of Object.entries(delegates)) prisma[k] = v;
  prisma.vendor = { ...(prisma.vendor ?? {}), ...fns("findFirst", "findMany", "update") };
  prisma.deliveryOrder = { ...(prisma.deliveryOrder ?? {}), ...fns("findMany") };
  prisma.courierOnlineSession = {
    ...(prisma.courierOnlineSession ?? {}),
    ...fns("findFirst", "update", "create"),
  };
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  delegates.vendorBranch.findFirst.mockResolvedValue({ id: "br-1", name: "Salmiya", lat: D(SHOP.lat), lng: D(SHOP.lng) });
  delegates.vendorBranch.findMany.mockResolvedValue([]);
  prisma.vendor.findMany.mockResolvedValue([]);
  delegates.walletAccount.upsert.mockImplementation(async ({ where }: any) => ({
    id: `acc:${where.tenantId_ownerKey.ownerKey}`,
    balanceKwd: D(0),
  }));
  delegates.walletAccount.update.mockImplementation(async ({ where }: any) => ({ id: where.id, balanceKwd: D(0) }));
  delegates.walletTransaction.create.mockImplementation(async ({ data }: any) => ({ id: "wtx-ps", ...data }));
  delegates.walletEntry.create.mockImplementation(async ({ data }: any) => ({ id: "we", ...data }));
});

describe("starting at the shop (#11)", () => {
  test("more than 150 m away is refused with the distance", async () => {
    delegates.privateShift.findFirst.mockResolvedValue(shift());
    await expect(
      startPrivateShift(DRIVER, "ps-1", { lat: SHOP.lat + 0.005, lng: SHOP.lng }, NOW),
    ).rejects.toMatchObject({ statusCode: 409, code: "NOT_AT_VENDOR", extra: { radiusM: 150 } });
    expect(delegates.privateShift.updateMany).not.toHaveBeenCalled();
  });

  test("at the shop it starts, and puts the driver online for dispatch", async () => {
    delegates.privateShift.findFirst.mockResolvedValue(shift());
    delegates.privateShift.updateMany.mockResolvedValue({ count: 1 });
    prisma.courierOnlineSession.findFirst.mockResolvedValue(null);
    const out = await startPrivateShift(DRIVER, "ps-1", { lat: SHOP.lat + 0.0005, lng: SHOP.lng }, NOW);
    expect(out).toEqual({ ok: true });
    expect(delegates.privateShift.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "BOOKED", driverId: "drv-1" }),
        data: expect.objectContaining({ status: "IN_PROGRESS", startedAt: NOW }),
      }),
    );
    expect(prisma.courierOnlineSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ availability: "ONLINE", driverId: "drv-1" }) }),
    );
  });

  test("no fix fails open with a warning, like the area gate", async () => {
    delegates.privateShift.findFirst.mockResolvedValue(shift());
    delegates.privateShift.updateMany.mockResolvedValue({ count: 1 });
    prisma.courierOnlineSession.findFirst.mockResolvedValue(null);
    const out = await startPrivateShift(DRIVER, "ps-1", {}, NOW);
    expect(out).toEqual({ ok: true, warning: "NO_LOCATION" });
  });

  test("too early is refused", async () => {
    delegates.privateShift.findFirst.mockResolvedValue(shift({ startAt: at(60), endAt: at(300) }));
    await expect(startPrivateShift(DRIVER, "ps-1", { lat: SHOP.lat, lng: SHOP.lng }, NOW)).rejects.toMatchObject({
      code: "TOO_EARLY",
    });
  });
});

describe("booking (#11)", () => {
  test("a driver not cleared for private shifts cannot book", async () => {
    await expect(bookPrivateShift({ ...DRIVER, privateShiftEligible: false }, "ps-1", NOW)).rejects.toMatchObject({
      statusCode: 403,
      code: "NOT_ELIGIBLE",
    });
  });

  test("the wrong vehicle cannot book", async () => {
    delegates.privateShift.findFirst.mockResolvedValue(shift({ status: "OPEN", driverId: null, vehicleType: "CAR", startAt: at(60) }));
    await expect(bookPrivateShift(DRIVER, "ps-1", NOW)).rejects.toMatchObject({ code: "WRONG_VEHICLE" });
  });

  test("the claim is status-guarded: losing the race is a 409", async () => {
    delegates.privateShift.findFirst
      .mockResolvedValueOnce(shift({ status: "OPEN", driverId: null, startAt: at(60), endAt: at(300) }))
      .mockResolvedValueOnce(null); // no clash of their own
    delegates.shift.findFirst.mockResolvedValue(null);
    delegates.privateShift.updateMany.mockResolvedValue({ count: 0 });
    await expect(bookPrivateShift(DRIVER, "ps-1", NOW)).rejects.toMatchObject({ code: "NOT_OPEN" });
    expect(delegates.privateShift.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "OPEN", driverId: null }) }),
    );
  });

  test("a regular shift at the same time blocks the booking", async () => {
    delegates.privateShift.findFirst
      .mockResolvedValueOnce(shift({ status: "OPEN", driverId: null, startAt: at(60), endAt: at(300) }))
      .mockResolvedValueOnce(null);
    delegates.shift.findFirst.mockResolvedValue({ id: "s-1" });
    await expect(bookPrivateShift(DRIVER, "ps-1", NOW)).rejects.toMatchObject({ code: "CLASHES_WITH_SHIFT" });
  });
});

describe("ending writes the settlement (#8)", () => {
  test("billable minutes and both money figures are snapshotted with a row per deduction", async () => {
    delegates.privateShift.updateMany.mockResolvedValue({ count: 1 });
    // Started 10 minutes late, ran to the end.
    delegates.privateShift.findFirst.mockResolvedValue(
      shift({ status: "COMPLETED", startedAt: at(10), endedAt: at(240) }),
    );
    prisma.deliveryOrder.findMany.mockResolvedValue([
      {
        id: "o-1",
        branchId: "br-1",
        assignedAt: at(20),
        pickedUpAt: at(25),
        deliveredAt: at(95), // 30 minutes past the deadline
        returnedAt: null,
        cancelledAt: null,
        slaDeadline: at(65),
        dropoffLat: null,
        dropoffLng: null,
      },
    ]);
    delegates.locationLog.findMany.mockResolvedValue([]);
    delegates.vendorVehiclePlan.findFirst.mockResolvedValue({ perHourKwd: D("3.000") });
    delegates.fleetVehicleRate.findFirst.mockResolvedValue({ perHourKwd: D("2.000") });

    const out = await endPrivateShift(DRIVER, "ps-1", at(240));
    expect(out).toEqual({ ok: true, billableMinutes: 200, deductedMinutes: 40 });
    expect(delegates.privateShiftDeduction.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ kind: "LATE_START", minutes: 10 }),
        expect.objectContaining({ kind: "LATE_ORDER", minutes: 30, orderId: "o-1" }),
      ]),
    });
    const update = delegates.privateShift.update.mock.calls[0][0];
    expect(update.data.billableMinutes).toBe(200);
    expect(update.data.vendorChargeKwd.toFixed(3)).toBe("10.000");
    expect(update.data.fleetPayKwd.toFixed(3)).toBe("6.667");
  });
});

// Revision 24b — the shop is charged through the real double-entry flow.
describe("completing a shift charges the shop (24b)", () => {
  function primeCompleted(over: Record<string, unknown> = {}) {
    delegates.privateShift.updateMany.mockResolvedValue({ count: 1 });
    delegates.privateShift.findFirst.mockResolvedValue(
      shift({ status: "COMPLETED", startedAt: at(0), endedAt: at(240), ...over }),
    );
    prisma.deliveryOrder.findMany.mockResolvedValue([]);
    delegates.locationLog.findMany.mockResolvedValue([]);
    delegates.vendorVehiclePlan.findFirst.mockResolvedValue({ perHourKwd: D("3.000") });
    delegates.fleetVehicleRate.findFirst.mockResolvedValue({ perHourKwd: D("2.000") });
  }

  test("posts vendor payable DEBIT / platform revenue CREDIT under private-shift-charge:{id}, labelled for the shop", async () => {
    primeCompleted();
    await endPrivateShift(DRIVER, "ps-1", at(240));

    const header = delegates.walletTransaction.create.mock.calls[0][0].data;
    expect(header).toMatchObject({
      tenantId: "t-1",
      type: "PRIVATE_SHIFT_CHARGE",
      idempotencyKey: "private-shift-charge:ps-1",
      memo: "Private shift 2026-10-14 4h",
      orderId: null,
    });
    const legs = delegates.walletEntry.create.mock.calls.map((c: any) => c[0].data);
    expect(legs).toHaveLength(2);
    const byAccount = Object.fromEntries(legs.map((l: any) => [l.accountId, l]));
    expect(byAccount["acc:VENDOR:v-1"]).toMatchObject({ direction: "DEBIT" });
    expect(byAccount["acc:VENDOR:v-1"].amountKwd.toFixed(3)).toBe("12.000");
    expect(byAccount["acc:PLATFORM_REVENUE"]).toMatchObject({ direction: "CREDIT" });
    expect(byAccount["acc:PLATFORM_REVENUE"].amountKwd.toFixed(3)).toBe("12.000");

    // The shift keeps the posting, which is what puts it on its branch.
    const stamped = delegates.privateShift.update.mock.calls.find((c: any) => c[0].data.chargeTxId);
    expect(stamped[0].data.chargeTxId).toBe("wtx-ps");
  });

  test("the company is NOT paid here: no fleet leg, only the shop charge", async () => {
    primeCompleted();
    await endPrivateShift(DRIVER, "ps-1", at(240));
    expect(delegates.walletTransaction.create).toHaveBeenCalledTimes(1);
    const keys = delegates.walletAccount.upsert.mock.calls.map((c: any) => c[0].where.tenantId_ownerKey.ownerKey);
    expect(keys.some((k: string) => k.startsWith("FLEET:"))).toBe(false);
  });

  test("a replay posts nothing (the key already exists)", async () => {
    primeCompleted();
    delegates.walletTransaction.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    await endPrivateShift(DRIVER, "ps-1", at(240));
    expect(delegates.walletAccount.update).not.toHaveBeenCalled();
    expect(delegates.privateShift.update.mock.calls.some((c: any) => c[0].data.chargeTxId)).toBe(false);
  });

  test("an already charged shift is not re-snapshotted or re-posted", async () => {
    primeCompleted({ chargeTxId: "wtx-old" });
    await endPrivateShift(DRIVER, "ps-1", at(240));
    expect(delegates.walletTransaction.create).not.toHaveBeenCalled();
    expect(delegates.privateShift.update).not.toHaveBeenCalled();
  });

  test("no per-hour plan on that vehicle: the figure stays blank and nothing is charged", async () => {
    primeCompleted();
    delegates.vendorVehiclePlan.findFirst.mockResolvedValue(null);
    await endPrivateShift(DRIVER, "ps-1", at(240));
    expect(delegates.walletTransaction.create).not.toHaveBeenCalled();
  });

  test("a no-show (never started) bills 0 minutes and charges nothing", async () => {
    primeCompleted({ startedAt: null, endedAt: null });
    await endPrivateShift(DRIVER, "ps-1", at(240));
    expect(delegates.walletTransaction.create).not.toHaveBeenCalled();
  });
});

describe("planning (#8, #9)", () => {
  test("a vehicle type the shop has not ticked cannot be planned", async () => {
    prisma.vendor.findFirst.mockResolvedValue({ id: "v-1", suitableVehicleTypes: ["CAR"] });
    await expect(
      createPrivateShiftPlan({
        tenantId: "t-1", vendorId: "v-1", branchId: "br-1", vehicleType: "MOTORCYCLE",
        date: "2026-10-15", count: 2, hours: 4, source: "VENDOR", now: NOW,
      }),
    ).rejects.toMatchObject({ code: "VEHICLE_NOT_SUITABLE" });
  });

  test("the proposal writes one PROPOSED shift per ask at the branch's busy hours", async () => {
    prisma.vendor.findFirst.mockResolvedValue({ id: "v-1", suitableVehicleTypes: ["MOTORCYCLE"] });
    // Ten Thursdays-worth of orders at 20:00 Kuwait (17:00 UTC) on earlier Thursdays.
    const orders = Array.from({ length: 12 }, (_, i) => ({
      createdAt: new Date(Date.UTC(2026, 9, 8 - (i % 4) * 7, 17, i)),
    }));
    prisma.deliveryOrder.findMany.mockResolvedValue(orders);
    delegates.privateShiftPlan.create.mockResolvedValue({ id: "plan-1" });
    delegates.privateShiftPlan.findFirst.mockResolvedValue({ id: "plan-1", shifts: [] });

    await createPrivateShiftPlan({
      tenantId: "t-1", vendorId: "v-1", branchId: "br-1", vehicleType: "MOTORCYCLE",
      date: "2026-10-15", count: 1, hours: 4, source: "VENDOR", now: NOW,
    });
    const rows = delegates.privateShift.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("PROPOSED");
    // The shift covers 20:00 Kuwait.
    const startH = (rows[0].startAt.getUTCHours() + 3) % 24;
    expect(startH).toBeLessThanOrEqual(20);
    expect(startH + 4).toBeGreaterThan(20);
  });
});

describe("vehicle checkboxes (#8)", () => {
  test("ticking cars alone makes the shop car-only; both clears it", async () => {
    prisma.vendor.findFirst.mockResolvedValue({ id: "v-1", suitableVehicleTypes: ["CAR"], deliveryPlanId: null, requiresCarOnly: false });
    delegates.vendorVehiclePlan.findMany.mockResolvedValue([]);
    await saveVendorVehiclePlans({ tenantId: "t-1", vendorId: "v-1", suitableVehicleTypes: ["CAR"], plans: [] });
    expect(prisma.vendor.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { suitableVehicleTypes: ["CAR"], requiresCarOnly: true } }),
    );
    await saveVendorVehiclePlans({ tenantId: "t-1", vendorId: "v-1", suitableVehicleTypes: ["CAR", "MOTORCYCLE"], plans: [] });
    expect(prisma.vendor.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { suitableVehicleTypes: ["MOTORCYCLE", "CAR"], requiresCarOnly: false } }),
    );
  });

  test("each vehicle's per-hour rate is stored on its own row", async () => {
    prisma.vendor.findFirst.mockResolvedValue({ id: "v-1", suitableVehicleTypes: [], deliveryPlanId: null, requiresCarOnly: false });
    delegates.vendorVehiclePlan.findMany.mockResolvedValue([]);
    await saveVendorVehiclePlans({
      tenantId: "t-1", vendorId: "v-1", suitableVehicleTypes: ["MOTORCYCLE"],
      plans: [{ vehicleType: "MOTORCYCLE", deliveryPlanId: null, perHourKwd: "2.5" }],
    });
    expect(delegates.vendorVehiclePlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vendorId_vehicleType: { vendorId: "v-1", vehicleType: "MOTORCYCLE" } },
        update: { deliveryPlanId: null, perHourKwd: new Prisma.Decimal("2.500") },
      }),
    );
  });
});

// Client note, 2026-10-15: a base fee and a per-km rate per vehicle.
describe("delivery company per-vehicle rates (2026-10-15)", () => {
  test("base, per km and per hour are parsed per vehicle", () => {
    const [moto] = parseFleetVehicleRates([
      { vehicleType: "MOTORCYCLE", perOrderKwd: "0.8", perKmKwd: "0.1", perHourKwd: "2" },
    ]);
    expect(moto.perOrderKwd.toFixed(3)).toBe("0.800");
    expect(moto.perKmKwd.toFixed(3)).toBe("0.100");
    expect(moto.perHourKwd.toFixed(3)).toBe("2.000");
  });

  test("a blank per km clears it; a payload without the key leaves it alone", async () => {
    const [blank] = parseFleetVehicleRates([{ vehicleType: "CAR", perOrderKwd: "1", perKmKwd: "" }]);
    expect(blank.perKmKwd).toBeNull();
    const [legacy] = parseFleetVehicleRates([{ vehicleType: "CAR", perOrderKwd: "1" }]);
    expect(legacy.perKmKwd).toBeUndefined();

    const upsert = jest.fn();
    await writeFleetVehicleRates({ fleetVehicleRate: { upsert } } as any, "t-1", "f-1", [legacy, blank]);
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty("perKmKwd");
    expect(upsert.mock.calls[0][0].create.perKmKwd).toBeNull();
    expect(upsert.mock.calls[1][0].update.perKmKwd).toBeNull();
  });

  test("an absurd per-km rate is refused", () => {
    expect(() => parseFleetVehicleRates([{ vehicleType: "CAR", perKmKwd: "50" }])).toThrow();
  });
});
