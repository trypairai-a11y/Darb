// Revision 24 (#8, #11) — what a private shift is worth.
//
// The client's own example is the first test: a 45-minute order delivered in
// 75 minutes deducts 30 minutes from the shift. Then the driver rules: waiting
// at the shop is paid in full, being away with no order is deducted, the drive
// back after a delivery is allowed (estimated drive + 10 minutes) and stops
// being allowed the moment the driver is back at the shop.
//
// Pure functions, so no prisma at all.

import {
  GEOFENCE_METERS,
  MAX_PING_GAP_MIN,
  RETURN_GRACE_MIN,
  awayStretches,
  computePrivateShiftSettlement,
  isAtVendor,
  lateMinutesForOrder,
  liveStateOf,
  returnAllowanceMinutes,
  type LocationPing,
  type ShiftOrder,
} from "../../services/privateShifts/privateShiftBilling";

const SHOP = { lat: 29.3759, lng: 47.9774 };
// ~111 m per 0.001 degree of latitude.
const NEAR = { lat: SHOP.lat + 0.0005, lng: SHOP.lng }; // ~55 m, inside the fence
const FAR = { lat: SHOP.lat + 0.02, lng: SHOP.lng }; // ~2.2 km away

const T0 = new Date("2026-10-14T09:00:00.000Z"); // 12:00 Kuwait
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

/** A ping every minute from `from` to `to` (exclusive) at one place. */
function pingsAt(point: { lat: number; lng: number }, from: number, to: number): LocationPing[] {
  const out: LocationPing[] = [];
  for (let m = from; m < to; m++) out.push({ ...point, at: at(m) });
  return out;
}

function order(over: Partial<ShiftOrder> = {}): ShiftOrder {
  return {
    id: "o-1",
    assignedAt: at(10),
    pickedUpAt: at(15),
    deliveredAt: at(40),
    closedAt: null,
    slaDeadline: at(55),
    dropoffLat: FAR.lat,
    dropoffLng: FAR.lng,
    ...over,
  };
}

const RATES = { vendorHourlyKwd: "3.000", fleetHourlyKwd: "2.000" };

describe("the client's example", () => {
  test("75 minutes on a 45-minute order deducts 30 minutes", () => {
    const o = order({ assignedAt: at(0), slaDeadline: at(45), deliveredAt: at(75) });
    expect(lateMinutesForOrder(o)).toBe(30);
  });

  test("an order with no deadline of its own is held to 45 minutes from assignment", () => {
    expect(lateMinutesForOrder(order({ assignedAt: at(0), slaDeadline: null, deliveredAt: at(75) }))).toBe(30);
  });

  test("on time deducts nothing, and an order not delivered is not late", () => {
    expect(lateMinutesForOrder(order({ slaDeadline: at(60), deliveredAt: at(40) }))).toBe(0);
    expect(lateMinutesForOrder(order({ deliveredAt: null }))).toBe(0);
  });

  test("the late minutes come off billable time and off both bills", () => {
    const s = computePrivateShiftSettlement({
      startAt: at(0),
      endAt: at(240),
      startedAt: at(0),
      endedAt: null,
      vendor: SHOP,
      orders: [order({ assignedAt: at(0), slaDeadline: at(45), deliveredAt: at(75) })],
      // At the shop the whole time apart from the order (excused) and the drive back.
      pings: [...pingsAt(NEAR, 0, 1), ...pingsAt(FAR, 1, 80), ...pingsAt(NEAR, 80, 240)],
      ...RATES,
    });
    expect(s.scheduledMinutes).toBe(240);
    expect(s.lateOrderMinutes).toBe(30);
    expect(s.awayMinutes).toBe(0);
    expect(s.billableMinutes).toBe(210);
    expect(s.vendorChargeKwd).toBe("10.500"); // 3.5 h x 3.000
    expect(s.fleetPayKwd).toBe("7.000"); // 3.5 h x 2.000
  });
});

describe("waiting and being away", () => {
  test("waiting at the shop with no order is paid in full", () => {
    const s = computePrivateShiftSettlement({
      startAt: at(0),
      endAt: at(120),
      startedAt: at(0),
      endedAt: null,
      vendor: SHOP,
      orders: [],
      pings: pingsAt(NEAR, 0, 120),
      ...RATES,
    });
    expect(s.deductedMinutes).toBe(0);
    expect(s.billableMinutes).toBe(120);
    expect(s.vendorChargeKwd).toBe("6.000");
  });

  test("leaving the shop with no order is deducted for the time away", () => {
    const pings = [...pingsAt(NEAR, 0, 30), ...pingsAt(FAR, 30, 50), ...pingsAt(NEAR, 50, 120)];
    const s = computePrivateShiftSettlement({
      startAt: at(0), endAt: at(120), startedAt: at(0), endedAt: null,
      vendor: SHOP, orders: [], pings, ...RATES,
    });
    expect(s.awayMinutes).toBe(20);
    expect(s.billableMinutes).toBe(100);
    expect(s.deductions.find((d) => d.kind === "AWAY")?.fromAt).toEqual(at(30));
  });

  test("the drive back after a delivery is allowed: estimated drive plus the grace", () => {
    const o = order();
    const allowance = returnAllowanceMinutes(o, SHOP);
    // ~2.2 km at 30 km/h is 5 minutes, plus the 10-minute grace.
    expect(allowance).toBe(5 + RETURN_GRACE_MIN);
    // Delivered at 40, back at the shop at 40 + allowance - 1: nothing deducted.
    const back = 40 + allowance - 1;
    const pings = [...pingsAt(NEAR, 0, 10), ...pingsAt(FAR, 10, back), ...pingsAt(NEAR, back, 120)];
    const s = computePrivateShiftSettlement({
      startAt: at(0), endAt: at(120), startedAt: at(0), endedAt: null,
      vendor: SHOP, orders: [o], pings, ...RATES,
    });
    expect(s.awayMinutes).toBe(0);
  });

  test("not coming straight back: the time past the allowance is deducted", () => {
    const o = order();
    const allowance = returnAllowanceMinutes(o, SHOP); // 15
    const pings = [...pingsAt(NEAR, 0, 10), ...pingsAt(FAR, 10, 85), ...pingsAt(NEAR, 85, 120)];
    const s = computePrivateShiftSettlement({
      startAt: at(0), endAt: at(120), startedAt: at(0), endedAt: null,
      vendor: SHOP, orders: [o], pings, ...RATES,
    });
    // Away from 40 + 15 = 55 until 85.
    expect(s.awayMinutes).toBe(85 - (40 + allowance));
  });

  test("the allowance ends on arrival, so it cannot be spent on a detour afterwards", () => {
    const o = order();
    // Delivered at 40, back at 45 (allowance ran to 55), then out again 46 to 60.
    const pings = [
      ...pingsAt(NEAR, 0, 10),
      ...pingsAt(FAR, 10, 45),
      ...pingsAt(NEAR, 45, 46),
      ...pingsAt(FAR, 46, 60),
      ...pingsAt(NEAR, 60, 120),
    ];
    const stretches = awayStretches({ from: at(0), until: at(120), vendor: SHOP, pings, orders: [o] });
    expect(stretches).toHaveLength(1);
    expect(stretches[0]!.fromAt).toEqual(at(46));
    expect(stretches[0]!.minutes).toBe(14);
  });

  test("a gap in the pings is not proof the driver left: only MAX_PING_GAP_MIN counts", () => {
    // One ping away at minute 30, then silence until the shop at minute 90.
    const pings = [...pingsAt(NEAR, 0, 30), { ...FAR, at: at(30) }, ...pingsAt(NEAR, 90, 120)];
    const s = computePrivateShiftSettlement({
      startAt: at(0), endAt: at(120), startedAt: at(0), endedAt: null,
      vendor: SHOP, orders: [], pings, ...RATES,
    });
    expect(s.awayMinutes).toBe(MAX_PING_GAP_MIN);
  });

  test("a minute of GPS drift outside the fence is not a trip", () => {
    const pings = [...pingsAt(NEAR, 0, 30), ...pingsAt(FAR, 30, 31), ...pingsAt(NEAR, 31, 60)];
    expect(awayStretches({ from: at(0), until: at(60), vendor: SHOP, pings, orders: [] })).toEqual([]);
  });

  test("an order from another shop carried by hand still excuses the time, but its lateness is not billed here", () => {
    const other = order({ id: "o-other", assignedAt: at(10), deliveredAt: at(90), slaDeadline: at(40) });
    const pings = [...pingsAt(NEAR, 0, 10), ...pingsAt(FAR, 10, 95), ...pingsAt(NEAR, 95, 120)];
    const s = computePrivateShiftSettlement({
      startAt: at(0), endAt: at(120), startedAt: at(0), endedAt: null,
      vendor: SHOP, orders: [], excuseOnlyOrders: [other], pings, ...RATES,
    });
    expect(s.awayMinutes).toBe(0);
    expect(s.lateOrderMinutes).toBe(0);
  });
});

describe("start and end", () => {
  test("starting late deducts the minutes before the start", () => {
    const s = computePrivateShiftSettlement({
      startAt: at(0), endAt: at(120), startedAt: at(20), endedAt: null,
      vendor: SHOP, orders: [], pings: pingsAt(NEAR, 20, 120), ...RATES,
    });
    expect(s.lateStartMinutes).toBe(20);
    expect(s.billableMinutes).toBe(100);
  });

  test("starting early is not paid extra", () => {
    const s = computePrivateShiftSettlement({
      startAt: at(0), endAt: at(120), startedAt: at(-10), endedAt: null,
      vendor: SHOP, orders: [], pings: pingsAt(NEAR, -10, 120), ...RATES,
    });
    expect(s.billableMinutes).toBe(120);
  });

  test("ending early deducts what was left", () => {
    const s = computePrivateShiftSettlement({
      startAt: at(0), endAt: at(120), startedAt: at(0), endedAt: at(90),
      vendor: SHOP, orders: [], pings: pingsAt(NEAR, 0, 90), ...RATES,
    });
    expect(s.earlyEndMinutes).toBe(30);
    expect(s.billableMinutes).toBe(90);
  });

  test("a shift never started bills nothing", () => {
    const s = computePrivateShiftSettlement({
      startAt: at(0), endAt: at(120), startedAt: null, endedAt: null,
      vendor: SHOP, orders: [], pings: [], ...RATES,
    });
    expect(s.billableMinutes).toBe(0);
    expect(s.vendorChargeKwd).toBe("0.000");
  });

  test("deductions never take billable time below zero, and no rate means no money figure", () => {
    const s = computePrivateShiftSettlement({
      startAt: at(0), endAt: at(60), startedAt: at(0), endedAt: null,
      vendor: SHOP,
      orders: [order({ assignedAt: at(0), slaDeadline: at(1), deliveredAt: at(59) }), order({ id: "o-2", assignedAt: at(0), slaDeadline: at(1), deliveredAt: at(59) })],
      pings: pingsAt(NEAR, 0, 60),
      vendorHourlyKwd: null,
      fleetHourlyKwd: "2.000",
    });
    expect(s.billableMinutes).toBe(0);
    expect(s.vendorChargeKwd).toBeNull();
    expect(s.fleetPayKwd).toBe("0.000");
  });
});

describe("the driver's live status", () => {
  test("at the shop, on an order, driving back, away", () => {
    const o = order();
    const base = { vendor: SHOP, orders: [o], pings: [] as LocationPing[] };
    expect(liveStateOf({ ...base, now: at(5), lastPing: { ...NEAR, at: at(5) } }).state).toBe("AT_VENDOR");
    expect(liveStateOf({ ...base, now: at(20), lastPing: { ...FAR, at: at(20) } }).state).toBe("ON_ORDER");
    const returning = liveStateOf({ ...base, now: at(45), lastPing: { ...FAR, at: at(45) } });
    expect(returning.state).toBe("RETURNING");
    expect(returning.returnByAt).toEqual(at(55));
    expect(liveStateOf({ ...base, now: at(70), lastPing: { ...FAR, at: at(70) } }).state).toBe("AWAY");
    expect(liveStateOf({ ...base, now: at(70), lastPing: { ...FAR, at: at(50) } }).state).toBe("UNKNOWN");
  });

  test("the fence is GEOFENCE_METERS", () => {
    expect(GEOFENCE_METERS).toBe(150);
    expect(isAtVendor(NEAR, SHOP)).toBe(true);
    expect(isAtVendor({ lat: SHOP.lat + 0.0016, lng: SHOP.lng }, SHOP)).toBe(false); // ~178 m
  });
});
