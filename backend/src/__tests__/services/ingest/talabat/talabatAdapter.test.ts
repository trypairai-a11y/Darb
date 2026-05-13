// Phase 6 Wave 0 RED — Turns GREEN when Wave 2a ships
// backend/src/services/ingest/talabat/{xlsx,scraper}.ts.
//
// REQ-ingest-adapter-layer: Talabat adapters.
// WARNING 12: compile-time pin on @@unique key shape via Prisma type extraction.

import type { Prisma } from "../../../../generated/prisma";

// Pinned per backend/prisma/schema.prisma:1385
//   @@unique([tenantId, driverId, shiftDate])
// Compile fails if the schema changes shape, forcing this test (and the Wave 2a adapter)
// to update in lockstep — no silent drift.
type _PinTalabatUnique = Prisma.TalabatDailyMetricsWhereUniqueInput["tenantId_driverId_shiftDate"];
const _pin: _PinTalabatUnique = { tenantId: "x", driverId: "x", shiftDate: new Date() };
void _pin;

jest.mock("../../../../config", () => ({
  prisma: {
    driver: { findFirst: jest.fn() },
    talabatDailyMetrics: { upsert: jest.fn() },
  },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { prisma } from "../../../../config";
import {
  TalabatXlsxAdapter,
  TalabatScraperAdapter,
} from "../../../../services/ingest/talabat";
import { NotAvailable } from "../../../../services/ingest/types";
import { buildTalabatXlsxBuffer, buildBadTalabatXlsx } from "../fixtures";

describe("Phase 6 / REQ-ingest-adapter-layer: Talabat adapters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("TalabatXlsxAdapter", () => {
    test("ingestXlsx with MVP shape rows upserts TalabatDailyMetrics, tenant-scoped", async () => {
      (prisma.driver.findFirst as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve({ id: `drv-${where.platformDriverId}`, tenantId: where.tenantId }),
      );
      (prisma.talabatDailyMetrics.upsert as jest.Mock).mockResolvedValue({ id: "tdm-1" });

      const adapter = new TalabatXlsxAdapter();
      const buf = buildTalabatXlsxBuffer();
      const result = await adapter.ingestXlsx!("t-1", buf);
      expect(result.rowsIn).toBe(2);
      expect(result.rowsOk).toBe(2);
      expect(result.errors).toEqual([]);
      // Tenant scoping: every upsert MUST include tenantId in the unique key.
      const calls = (prisma.talabatDailyMetrics.upsert as jest.Mock).mock.calls;
      for (const [args] of calls) {
        expect(JSON.stringify(args.where)).toContain("t-1");
      }
    });

    test("ingestXlsx with malformed headers → throws with explanatory message", async () => {
      const adapter = new TalabatXlsxAdapter();
      const bad = buildBadTalabatXlsx();
      await expect(adapter.ingestXlsx!("t-1", bad)).rejects.toThrow(
        /missing required columns.*date.*driver_id.*orders_count.*online_minutes.*attendance_status/,
      );
    });

    test("ingestXlsx idempotent: same buffer twice → row count N, not 2N", async () => {
      (prisma.driver.findFirst as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve({ id: `drv-${where.platformDriverId}`, tenantId: where.tenantId }),
      );
      (prisma.talabatDailyMetrics.upsert as jest.Mock).mockResolvedValue({ id: "tdm-1" });
      const adapter = new TalabatXlsxAdapter();
      const buf = buildTalabatXlsxBuffer();
      await adapter.ingestXlsx!("t-1", buf);
      await adapter.ingestXlsx!("t-1", buf);
      // 2 rows × 2 calls = 4 upsert calls; @@unique enforces 2 DB rows.
      expect(prisma.talabatDailyMetrics.upsert).toHaveBeenCalledTimes(4);
    });

    test("ingestXlsx with driver_id from another tenant → errors[] entry, no cross-tenant write (Pitfall 3)", async () => {
      // findFirst returns null because the where clause filters by tenantId.
      (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null);
      const adapter = new TalabatXlsxAdapter();
      const buf = buildTalabatXlsxBuffer();
      const result = await adapter.ingestXlsx!("t-1", buf);
      expect(result.rowsOk).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(prisma.talabatDailyMetrics.upsert).not.toHaveBeenCalled();
    });
  });

  describe("TalabatScraperAdapter", () => {
    test("isAvailable returns false unconditionally; fetchOrders throws NotAvailable (Phase 11 deferral)", async () => {
      const adapter = new TalabatScraperAdapter();
      expect(await adapter.isAvailable("t-1")).toBe(false);
      if (adapter.fetchOrders) {
        await expect(
          adapter.fetchOrders("t-1", { from: new Date(), to: new Date() }),
        ).rejects.toBeInstanceOf(NotAvailable);
      }
    });
  });
});

// RED — turned GREEN by Wave 2a. File contains "TalabatXlsxAdapter" pin.
