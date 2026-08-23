/**
 * pricingService.quoteDelivery — Darb 2.0 zones + pricing track (§A4).
 *
 * Uses the shared mocks/config prisma stub (via jest moduleNameMapper) and
 * REAL zone geometry through zoneService.resolveZone, so the bbox-prefilter →
 * @turf/boolean-point-in-polygon path is exercised end-to-end. Money
 * assertions verify exact Prisma.Decimal arithmetic (no float drift).
 */
import { getMockPrisma, resetAllMocks } from "../setup";
import { Prisma } from "../../generated/prisma";

const prisma = getMockPrisma();

// The Darb 2.0 delegates aren't part of mocks/config yet — attach them to the
// shared stub before the services capture the prisma reference. Property
// lookup happens at call time, so this is safe either way.
for (const model of [
  "deliveryZone",
  "vendorBranch",
  "zoneSurcharge",
  "fulfillmentSettings",
  "deliveryPlan",
  "deliveryPlanZoneRate",
]) {
  if (!prisma[model]) {
    prisma[model] = {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    };
  }
}

// Revision 4 (#7): the km path's only outside dependency. Mocked at the
// module boundary so these tests never touch the network or the cache table.
jest.mock("../../services/distanceService", () => ({
  drivingDistanceKm: jest.fn(),
}));
const { drivingDistanceKm } = require("../../services/distanceService") as {
  drivingDistanceKm: jest.Mock;
};

const { quoteDelivery } = require("../../services/pricingService");
const { invalidateZoneCache } = require("../../services/zoneService");

const TENANT = "t1";

// ─── Zone fixtures: two squares, GeoJSON [lng, lat], closed rings ──────────

const ZONE_A = {
  id: "zone-a",
  code: "KWC",
  name: "Kuwait City",
  nameAr: "مدينة الكويت",
  isActive: true,
  polygon: {
    type: "Polygon",
    coordinates: [[
      [47.95, 29.35], [48.00, 29.35], [48.00, 29.40], [47.95, 29.40], [47.95, 29.35],
    ]],
  },
  bbox: [47.95, 29.35, 48.00, 29.40],
};

const ZONE_B = {
  id: "zone-b",
  code: "SALMIYA",
  name: "Salmiya",
  nameAr: "السالمية",
  isActive: true,
  polygon: {
    type: "Polygon",
    coordinates: [[
      [48.05, 29.30], [48.10, 29.30], [48.10, 29.35], [48.05, 29.35], [48.05, 29.30],
    ]],
  },
  bbox: [48.05, 29.30, 48.10, 29.35],
};

const IN_ZONE_A = { lat: 29.375, lng: 47.975 };
const IN_ZONE_B = { lat: 29.325, lng: 48.075 };
const OUTSIDE_ALL = { lat: 29.5, lng: 48.2 };

function primeZones() {
  prisma.deliveryZone.findMany.mockResolvedValue([ZONE_A, ZONE_B]);
  prisma.deliveryZone.findFirst.mockImplementation(async ({ where }: any) =>
    [ZONE_A, ZONE_B].find((z) => z.id === where.id) ?? null,
  );
}

function primeSettings(feeKwd = "1.250") {
  prisma.fulfillmentSettings.findUnique.mockResolvedValue({
    tenantId: TENANT,
    intraZoneFeeKwd: new Prisma.Decimal(feeKwd),
  });
}

describe("quoteDelivery", () => {
  beforeEach(() => {
    resetAllMocks();
    invalidateZoneCache(TENANT); // zoneService caches polygons for 60s
    primeZones();
    primeSettings();
  });

  // ── Happy paths ───────────────────────────────────────────────────────────

  test("intra-zone: branch pickup + dropoff in same zone = flat fee, no surcharge lookup", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: "zone-a" });

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: IN_ZONE_A,
    });

    expect(result.ok).toBe(true);
    expect(result.pickupZoneId).toBe("zone-a");
    expect(result.dropoffZoneId).toBe("zone-a");
    expect(result.feeKwd).toBeInstanceOf(Prisma.Decimal);
    expect(result.feeKwd.toFixed(3)).toBe("1.250");
    expect(result.pickupZone).toEqual({
      id: "zone-a", code: "KWC", name: "Kuwait City", nameAr: "مدينة الكويت",
    });
    expect(result.dropoffZone.id).toBe("zone-a");
    expect(prisma.zoneSurcharge.findFirst).not.toHaveBeenCalled();
  });

  test("inter-zone: flat fee + origin→dest surcharge", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: "zone-a" });
    prisma.zoneSurcharge.findFirst.mockResolvedValue({
      surchargeKwd: new Prisma.Decimal("0.750"),
    });

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: IN_ZONE_B,
    });

    expect(result.ok).toBe(true);
    expect(result.pickupZoneId).toBe("zone-a");
    expect(result.dropoffZoneId).toBe("zone-b");
    expect(result.feeKwd.toFixed(3)).toBe("2.000");
    expect(prisma.zoneSurcharge.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          originZoneId: "zone-a",
          destZoneId: "zone-b",
        }),
      }),
    );
  });

  test("explicit pickupZoneId + dropoff.zoneId (no geometry needed)", async () => {
    prisma.zoneSurcharge.findFirst.mockResolvedValue({
      surchargeKwd: new Prisma.Decimal("0.500"),
    });

    const result = await quoteDelivery(TENANT, {
      pickupZoneId: "zone-a",
      dropoff: { zoneId: "zone-b" },
    });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("1.750");
    expect(prisma.vendorBranch.findFirst).not.toHaveBeenCalled();
  });

  // ── Rejection reasons ─────────────────────────────────────────────────────

  test("BRANCH_UNZONED: branch exists but has no zoneId", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: null });

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: IN_ZONE_A,
    });
    expect(result).toEqual({ ok: false, reason: "BRANCH_UNZONED" });
  });

  test("BRANCH_UNZONED: branch not found in tenant", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValue(null);

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-x",
      dropoff: IN_ZONE_A,
    });
    expect(result).toEqual({ ok: false, reason: "BRANCH_UNZONED" });
  });

  test("BRANCH_UNZONED: neither branchId nor pickupZoneId supplied", async () => {
    const result = await quoteDelivery(TENANT, { dropoff: IN_ZONE_A });
    expect(result).toEqual({ ok: false, reason: "BRANCH_UNZONED" });
  });

  test("NO_COORDINATES: dropoff has neither zoneId nor lat/lng", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: "zone-a" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: {} });
    expect(result).toEqual({ ok: false, reason: "NO_COORDINATES" });
  });

  test("OUT_OF_ZONE_DROPOFF: dropoff point outside every polygon", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: "zone-a" });

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: OUTSIDE_ALL,
    });
    expect(result).toEqual({ ok: false, reason: "OUT_OF_ZONE_DROPOFF" });
  });

  test("OUT_OF_ZONE_DROPOFF: dropoff.zoneId not a known zone", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: "zone-a" });

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: { zoneId: "zone-x" },
    });
    expect(result).toEqual({ ok: false, reason: "OUT_OF_ZONE_DROPOFF" });
  });

  test("UNSERVICEABLE_PAIR: cross-zone pair with no surcharge row", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: "zone-a" });
    prisma.zoneSurcharge.findFirst.mockResolvedValue(null);

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: IN_ZONE_B,
    });
    expect(result).toEqual({ ok: false, reason: "UNSERVICEABLE_PAIR" });
  });

  // ── Money precision ───────────────────────────────────────────────────────

  test("Decimal precision: 1.250 + 0.750 = 2.000 exactly", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: "zone-a" });
    prisma.zoneSurcharge.findFirst.mockResolvedValue({
      surchargeKwd: new Prisma.Decimal("0.750"),
    });

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: IN_ZONE_B,
    });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.equals(new Prisma.Decimal("2.000"))).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("2.000");
  });

  test("Decimal precision: 0.100 + 0.200 = 0.300 (no float drift)", async () => {
    primeSettings("0.100");
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: "zone-a" });
    prisma.zoneSurcharge.findFirst.mockResolvedValue({
      surchargeKwd: new Prisma.Decimal("0.200"),
    });

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: { zoneId: "zone-b" },
    });

    expect(result.ok).toBe(true);
    // 0.1 + 0.2 === 0.30000000000000004 in float math — Decimal must be exact.
    expect(result.feeKwd.toFixed(3)).toBe("0.300");
    expect(result.feeKwd.equals(new Prisma.Decimal("0.3"))).toBe(true);
  });

  test("string decimals from mocked rows still produce exact math", async () => {
    prisma.fulfillmentSettings.findUnique.mockResolvedValue({
      tenantId: TENANT,
      intraZoneFeeKwd: "1.250", // e.g. serialized JSON round-trip
    });
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: "zone-a" });
    prisma.zoneSurcharge.findFirst.mockResolvedValue({ surchargeKwd: "0.750" });

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: { zoneId: "zone-b" },
    });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("2.000");
  });

  // ── Config error ──────────────────────────────────────────────────────────

  test("throws a clear config error when FulfillmentSettings is missing", async () => {
    prisma.fulfillmentSettings.findUnique.mockResolvedValue(null);
    prisma.vendorBranch.findFirst.mockResolvedValue({ zoneId: "zone-a" });

    await expect(
      quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_A }),
    ).rejects.toThrow(/FulfillmentSettings missing for tenant t1/);
  });
});

// ─── Revision 4 (#7): delivery plans ────────────────────────────────────────
//
// The property that matters most here is the fallback. Plans ship dark: a
// vendor with no plan must price exactly as it did before, which is what lets
// merchants move onto plans one at a time instead of on a flag day. Every test
// above exercises that path — these cover what happens once a plan exists.

describe("quoteDelivery with a delivery plan", () => {
  const D = (v: string) => new Prisma.Decimal(v);

  /** A branch whose vendor is on `plan` (or on nothing when null). */
  function primeBranchOnPlan(plan: Record<string, unknown> | null, coords?: { lat: number; lng: number }) {
    prisma.vendorBranch.findFirst.mockImplementation(async ({ select }: any) => {
      if (select?.vendor) return { vendor: { deliveryPlanId: plan?.id ?? null } };
      if (select?.lat) return { lat: coords?.lat ?? null, lng: coords?.lng ?? null };
      return { zoneId: "zone-a" };
    });
    prisma.deliveryPlan.findFirst.mockResolvedValue(plan);
    // A by-zone plan is "configured" once it holds any rate at all. Default to
    // configured; the empty-plan test overrides this to 0.
    prisma.deliveryPlanZoneRate.count.mockResolvedValue(1);
  }

  beforeEach(() => {
    resetAllMocks();
    invalidateZoneCache(TENANT);
    primeZones();
    primeSettings();
    drivingDistanceKm.mockReset();
  });

  // ── By-zone plans ─────────────────────────────────────────────────────────

  test("by-zone plan prices off its own grid, not the tenant-wide settings", async () => {
    primeBranchOnPlan({ id: "plan-z", type: "ZONE", kmTiers: [] });
    prisma.deliveryPlanZoneRate.findFirst.mockResolvedValue({ feeKwd: D("2.250") });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("2.250");
    expect(result.planId).toBe("plan-z");
    // The old tenant-wide surcharge table is not consulted at all.
    expect(prisma.zoneSurcharge.findFirst).not.toHaveBeenCalled();
  });

  // Regression: an empty plan took a live merchant off dispatch entirely, and
  // the only symptom was orders stacking up in Needs review.
  test("by-zone plan with no rates at all is unconfigured, not unserviceable", async () => {
    primeBranchOnPlan({ id: "plan-z", type: "ZONE", kmTiers: [] });
    prisma.deliveryPlanZoneRate.count.mockResolvedValue(0); // never configured
    prisma.zoneSurcharge.findFirst.mockResolvedValue({ surchargeKwd: D("0.500") });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    // Falls through to the tenant-wide card: 1.250 flat + 0.500 surcharge.
    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("1.750");
    expect(result.planId).toBeUndefined();
    // The empty grid is never consulted for a cell.
    expect(prisma.deliveryPlanZoneRate.findFirst).not.toHaveBeenCalled();
  });

  test("by-zone plan: a missing cell means the pair is unserviceable", async () => {
    primeBranchOnPlan({ id: "plan-z", type: "ZONE", kmTiers: [] });
    prisma.deliveryPlanZoneRate.findFirst.mockResolvedValue(null); // the blank cell

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result).toEqual({ ok: false, reason: "UNSERVICEABLE_PAIR" });
  });

  test("by-zone plan: the intra-zone row supplies the same-zone fee", async () => {
    primeBranchOnPlan({ id: "plan-z", type: "ZONE", kmTiers: [] });
    prisma.deliveryPlanZoneRate.findFirst.mockResolvedValue({ feeKwd: D("1.000") });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_A });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("1.000");
    const q = prisma.deliveryPlanZoneRate.findFirst.mock.calls[0][0];
    expect(q.where).toMatchObject({ originZoneId: "zone-a", destZoneId: "zone-a" });
  });

  // ── By-kilometre plans ────────────────────────────────────────────────────
  //
  // The client's worked example: 12 km and under = A, 12.1 to 14 = B, 14+ = C.
  // The open-ended top band is maxKm = null, which is why "14+" is a row here
  // and not a branch in the pricing code.

  const KM_TIERS = [
    { maxKm: D("12"), feeKwd: D("1.500") },
    { maxKm: D("14"), feeKwd: D("2.000") },
    { maxKm: null, feeKwd: D("2.750") },
  ];

  function primeKmPlan(tiers = KM_TIERS) {
    primeBranchOnPlan({ id: "plan-k", type: "KM", kmTiers: tiers }, { lat: 29.375, lng: 47.975 });
  }

  test.each([
    ["under the first breakpoint", 8.4, "1.500"],
    ["exactly on a breakpoint", 12, "1.500"],
    ["just past a breakpoint", 12.1, "2.000"],
    ["in the open-ended top band", 21.6, "2.750"],
  ])("by-km plan: %s → KD %s", async (_label, km, expected) => {
    primeKmPlan();
    drivingDistanceKm.mockResolvedValue({ km, source: "google" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe(expected);
    expect(result.distanceKm).toBe(km);
  });

  test("by-km plan: a blank price marks that band unserviceable", async () => {
    primeKmPlan([
      { maxKm: D("12"), feeKwd: D("1.500") },
      { maxKm: null, feeKwd: null }, // we do not deliver past 12 km
    ]);
    drivingDistanceKm.mockResolvedValue({ km: 18, source: "google" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result).toEqual({ ok: false, reason: "UNSERVICEABLE_PAIR" });
  });

  test("by-km plan: running off the end of a closed ladder is unserviceable", async () => {
    primeKmPlan([{ maxKm: D("12"), feeKwd: D("1.500") }]); // no open-ended band
    drivingDistanceKm.mockResolvedValue({ km: 30, source: "google" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result).toEqual({ ok: false, reason: "UNSERVICEABLE_PAIR" });
  });

  test("by-km plan: a straight-line fallback still prices, and says so", async () => {
    primeKmPlan();
    drivingDistanceKm.mockResolvedValue({ km: 9.2, source: "straight-line" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    // A degraded distance must not reject the order — it must be visible.
    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("1.500");
    expect(result.distanceSource).toBe("straight-line");
  });

  // The point of the whole change: a km-priced merchant is never refused an
  // order because the map has a gap. The tiers answer for any pin, so a drop
  // in no zone at all is priced exactly like a drop in one.
  test("by-km plan: a dropoff outside every zone is still priced", async () => {
    primeKmPlan();
    drivingDistanceKm.mockResolvedValue({ km: 13.2, source: "google" });

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: OUTSIDE_ALL,
    });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("2.000");
    // No zone to name, and the flag says why rather than leaving a bare null.
    expect(result.dropoffZoneId).toBeNull();
    expect(result.dropoffZone).toBeNull();
    expect(result.outOfZone).toBe(true);
    expect(result.pickupZoneId).toBe("zone-a");
  });

  // ── By-kilometre plans: base fee + rate per km (revision 14 #1) ───────────
  //
  // The client's rule, in their words: "for the kilometre pricing make it base
  // fee + each kilometre fee". The band ladder above is what this replaced, and
  // the tests for it stay: a plan saved before this change must keep quoting
  // exactly what it quoted yesterday, which is the property that let this ship
  // without a data migration.

  function primeFormulaPlan(plan: Record<string, unknown>) {
    primeBranchOnPlan(
      { id: "plan-f", type: "KM", kmTiers: [], ...plan },
      { lat: 29.375, lng: 47.975 },
    );
  }

  test.each([
    ["a short drop", 3, "1.450"],
    ["a fractional distance", 8.4, "2.260"],
    ["a long drop", 21.6, "4.240"],
  ])("by-km formula: %s → KD %s", async (_label, km, expected) => {
    // KD 1.000 to start, 150 fils a kilometre.
    primeFormulaPlan({ baseFeeKwd: D("1.000"), perKmFeeKwd: D("0.150"), maxDistanceKm: null });
    drivingDistanceKm.mockResolvedValue({ km, source: "google" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe(expected);
    expect(result.distanceKm).toBe(km);
  });

  // The one thing the band ladder could say that a formula cannot. Without it,
  // a drop we do not serve would quote a very large number instead of refusing.
  test("by-km formula: past the maximum distance the plan does not deliver", async () => {
    primeFormulaPlan({
      baseFeeKwd: D("1.000"),
      perKmFeeKwd: D("0.150"),
      maxDistanceKm: D("20"),
    });
    drivingDistanceKm.mockResolvedValue({ km: 24.5, source: "google" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result).toEqual({ ok: false, reason: "UNSERVICEABLE_PAIR" });
  });

  test("by-km formula: exactly on the maximum distance is still served", async () => {
    primeFormulaPlan({
      baseFeeKwd: D("1.000"),
      perKmFeeKwd: D("0.150"),
      maxDistanceKm: D("20"),
    });
    drivingDistanceKm.mockResolvedValue({ km: 20, source: "google" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("4.000");
  });

  test("by-km formula: a base fee with no kilometre rate is flat at any distance", async () => {
    primeFormulaPlan({ baseFeeKwd: D("1.250"), perKmFeeKwd: null, maxDistanceKm: null });
    drivingDistanceKm.mockResolvedValue({ km: 17.3, source: "google" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("1.250");
  });

  // The migration story, asserted rather than assumed: a plan that predates the
  // formula has both columns null, and its bands must still answer.
  test("by-km: a plan with no formula still prices off its bands", async () => {
    primeBranchOnPlan(
      { id: "plan-k", type: "KM", kmTiers: KM_TIERS, baseFeeKwd: null, perKmFeeKwd: null },
      { lat: 29.375, lng: 47.975 },
    );
    drivingDistanceKm.mockResolvedValue({ km: 13, source: "google" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("2.000");
  });

  test("by-zone plan: a dropoff outside every zone has no cell to read", async () => {
    primeBranchOnPlan({ id: "plan-z", type: "ZONE", kmTiers: [] });

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: OUTSIDE_ALL,
    });

    // Still a supervisor's call: a grid cannot price a zone that is not drawn.
    expect(result).toEqual({ ok: false, reason: "OUT_OF_ZONE_DROPOFF" });
    expect(prisma.deliveryPlanZoneRate.findFirst).not.toHaveBeenCalled();
  });

  test("by-km plan: a dropoff given only as a zone has no distance to price", async () => {
    primeKmPlan();

    const result = await quoteDelivery(TENANT, {
      branchId: "branch-1",
      dropoff: { zoneId: "zone-b" },
    });

    expect(result).toEqual({ ok: false, reason: "NO_COORDINATES" });
    expect(drivingDistanceKm).not.toHaveBeenCalled();
  });

  // ── Revision 14 (#3): every quote records how far the trip was ──────────
  //
  // The distance used to be measured only inside the by-kilometre branch,
  // because it was only ever a pricing input. It is a payout input now: Darb
  // pays its delivery companies a base plus a rate per kilometre, and a
  // zone-priced order is driven over exactly the same road as a km-priced one.
  // If these regress, every zone-priced delivery quietly pays the base alone.

  test("a by-zone plan quote still carries the distance the trip covered", async () => {
    primeBranchOnPlan({ id: "plan-z", type: "ZONE", kmTiers: [] }, { lat: 29.37, lng: 47.98 });
    prisma.deliveryPlanZoneRate.findFirst.mockResolvedValue({ feeKwd: D("2.250") });
    drivingDistanceKm.mockResolvedValue({ km: 6.482, source: "google" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result.ok).toBe(true);
    // The zone grid still sets the price. Only the measurement is new.
    expect(result.feeKwd.toFixed(3)).toBe("2.250");
    expect(result.distanceKm).toBe(6.482);
    expect(result.distanceSource).toBe("google");
  });

  test("a plan-less vendor on tenant-wide pricing carries it too", async () => {
    primeBranchOnPlan(null, { lat: 29.37, lng: 47.98 });
    prisma.zoneSurcharge.findFirst.mockResolvedValue({ surchargeKwd: D("0.750") });
    drivingDistanceKm.mockResolvedValue({ km: 3.1, source: "straight-line" });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("2.000");
    expect(result.distanceKm).toBe(3.1);
    expect(result.distanceSource).toBe("straight-line");
  });

  // Absent, never zero: a zero-kilometre order reads as a driver who did not
  // move, and would be paid as one.
  test("a branch with no pin leaves the distance absent rather than zero", async () => {
    primeBranchOnPlan({ id: "plan-z", type: "ZONE", kmTiers: [] }); // no coords
    prisma.deliveryPlanZoneRate.findFirst.mockResolvedValue({ feeKwd: D("2.250") });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result.ok).toBe(true);
    expect(result.distanceKm).toBeUndefined();
    expect(drivingDistanceKm).not.toHaveBeenCalled();
  });

  test("an inactive plan falls back to tenant-wide pricing rather than failing", async () => {
    // deliveryPlan.findFirst filters on isActive, so a deactivated plan reads
    // as "no plan" — the vendor keeps getting priced instead of being cut off.
    primeBranchOnPlan(null);
    prisma.zoneSurcharge.findFirst.mockResolvedValue({ surchargeKwd: D("0.750") });

    const result = await quoteDelivery(TENANT, { branchId: "branch-1", dropoff: IN_ZONE_B });

    expect(result.ok).toBe(true);
    expect(result.feeKwd.toFixed(3)).toBe("2.000");
  });
});
