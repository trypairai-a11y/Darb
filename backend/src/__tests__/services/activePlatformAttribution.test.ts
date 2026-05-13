/**
 * Wave 0 RED test — turns GREEN in Wave 2 when
 * backend/src/services/activePlatformAttribution.ts ships resolveActivePlatform()
 * with the documented 3-tier resolution order.
 *
 * Tier 1: HIGH/order_event       — recent OrderEvent for this driver
 * Tier 2: MEDIUM/shift           — IN_PROGRESS Shift
 * Tier 3a: LOW/driver_default    — Driver.platform fallback
 * Tier 3b: MEDIUM/mobile_hint    — driver default matches mobile hint
 * UNKNOWN: driver not in tenant or missing
 *
 * Cross-tenant leak guard: shift in tenantB must NOT count for tenantA.
 */

import { resetAllMocks, getMockPrisma } from "../setup";

// Module path the Wave 2 implementation must create.
// Importing it before Wave 2 ships → MODULE_NOT_FOUND → RED.
const { resolveActivePlatform } = require("../../services/activePlatformAttribution");

describe("resolveActivePlatform — Wave 0 RED scaffolding", () => {
  beforeEach(() => resetAllMocks());

  test("Tier 1: HIGH/order_event when OrderEvent in last 30 min for this driver", async () => {
    const prisma = getMockPrisma();
    prisma.orderEvent.findFirst.mockResolvedValue({
      id: "oe1",
      tenantId: "tenA",
      orderId: "o1",
      timestamp: new Date(),
      metadata: { platform: "KEETA" },
    });

    const result = await resolveActivePlatform({
      tenantId: "tenA",
      driverId: "drv1",
      at: new Date(),
      mobileHint: null,
    });

    expect(result.confidence).toBe("HIGH");
    expect(result.source).toBe("order_event");
    expect(result.platform).toBe("KEETA");
  });

  test("Tier 2: MEDIUM/shift when no recent OrderEvent but Shift IN_PROGRESS", async () => {
    const prisma = getMockPrisma();
    prisma.orderEvent.findFirst.mockResolvedValue(null);
    prisma.shift.findFirst.mockResolvedValue({
      id: "s1",
      platform: "TALABAT",
      actualStart: new Date(Date.now() - 60_000),
    });

    const result = await resolveActivePlatform({
      tenantId: "tenA",
      driverId: "drv1",
      at: new Date(),
      mobileHint: null,
    });

    expect(result).toEqual(
      expect.objectContaining({
        confidence: "MEDIUM",
        source: "shift",
        platform: "TALABAT",
      }),
    );
  });

  test("Tier 3: LOW/driver_default when no order, no shift, no mobile hint", async () => {
    const prisma = getMockPrisma();
    prisma.orderEvent.findFirst.mockResolvedValue(null);
    prisma.shift.findFirst.mockResolvedValue(null);
    // Tier 3 driver lookup now uses findFirst({ id, tenantId }) — the DB
    // layer enforces the tenant boundary so a cross-tenant row simply does
    // not return (defense-in-depth + lint:tenant compliance).
    prisma.driver.findFirst.mockResolvedValue({
      id: "drv1",
      tenantId: "tenA",
      platform: "DELIVEROO",
    });

    const result = await resolveActivePlatform({
      tenantId: "tenA",
      driverId: "drv1",
      at: new Date(),
      mobileHint: null,
    });

    expect(result).toEqual(
      expect.objectContaining({
        confidence: "LOW",
        source: "driver_default",
        platform: "DELIVEROO",
      }),
    );
  });

  test("Tier 3 + matching mobileHint → MEDIUM/mobile_hint", async () => {
    const prisma = getMockPrisma();
    prisma.orderEvent.findFirst.mockResolvedValue(null);
    prisma.shift.findFirst.mockResolvedValue(null);
    prisma.driver.findFirst.mockResolvedValue({
      id: "drv1",
      tenantId: "tenA",
      platform: "DELIVEROO",
    });

    const result = await resolveActivePlatform({
      tenantId: "tenA",
      driverId: "drv1",
      at: new Date(),
      mobileHint: "DELIVEROO",
    });

    expect(result).toEqual(
      expect.objectContaining({
        confidence: "MEDIUM",
        source: "mobile_hint",
      }),
    );
  });

  test("UNKNOWN when driver not in tenant", async () => {
    const prisma = getMockPrisma();
    prisma.orderEvent.findFirst.mockResolvedValue(null);
    prisma.shift.findFirst.mockResolvedValue(null);
    // findFirst({ id, tenantId }) returns null when the driver row exists in
    // another tenant — the DB simply does not match, so the impl returns
    // UNKNOWN without any post-fetch tenant check.
    prisma.driver.findFirst.mockResolvedValue(null);

    const result = await resolveActivePlatform({
      tenantId: "tenA",
      driverId: "unknown",
      at: new Date(),
      mobileHint: null,
    });

    expect(result).toEqual(
      expect.objectContaining({
        confidence: "UNKNOWN",
        source: "none",
        platform: null,
      }),
    );
  });

  test("cross-tenant leak guard: shift in tenantB does NOT count for tenantA", async () => {
    const prisma = getMockPrisma();
    prisma.orderEvent.findFirst.mockResolvedValue(null);
    prisma.shift.findFirst.mockImplementation((args: any) => {
      if (args?.where?.tenantId === "tenA") return Promise.resolve(null);
      return Promise.resolve({ id: "s-cross", platform: "KEETA" });
    });
    prisma.driver.findFirst.mockResolvedValue({
      id: "drv1",
      tenantId: "tenA",
      platform: "DELIVEROO",
    });

    const result = await resolveActivePlatform({
      tenantId: "tenA",
      driverId: "drv1",
      at: new Date(),
      mobileHint: null,
    });
    // Must fall through to driver default — NOT cross-tenant shift.
    expect(result.platform).toBe("DELIVEROO");
  });
});
