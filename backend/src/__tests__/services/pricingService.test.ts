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
for (const model of ["deliveryZone", "vendorBranch", "zoneSurcharge", "fulfillmentSettings"]) {
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
