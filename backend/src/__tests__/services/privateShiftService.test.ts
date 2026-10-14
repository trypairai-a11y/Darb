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
