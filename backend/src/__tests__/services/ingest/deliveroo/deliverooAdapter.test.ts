// Phase 6 Wave 0 RED — Turns GREEN when Wave 2b ships
// backend/src/services/ingest/deliveroo/{xlsx,scraper}.ts.
//
// REQ-ingest-adapter-layer: Deliveroo adapters.
// WARNING 12: compile-time pin on @@unique key shape per schema.prisma:1355.

import type { Prisma } from "../../../../generated/prisma";

type _PinDeliverooUnique = Prisma.DeliverooDailyMetricsWhereUniqueInput["tenantId_driverId_shiftDate"];
const _pin: _PinDeliverooUnique = { tenantId: "x", driverId: "x", shiftDate: new Date() };
void _pin;

jest.mock("../../../../config", () => ({
  prisma: {
    driver: { findFirst: jest.fn() },
    deliverooDailyMetrics: { upsert: jest.fn() },
  },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { prisma } from "../../../../config";
import {
  DeliverooXlsxAdapter,
  DeliverooScraperAdapter,
} from "../../../../services/ingest/deliveroo";
import { NotAvailable } from "../../../../services/ingest/types";
import { buildDeliverooXlsxBuffer, buildBadDeliverooXlsx } from "../fixtures";

describe("Phase 6 / REQ-ingest-adapter-layer: Deliveroo adapters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("DeliverooXlsxAdapter.ingestXlsx with MVP shape upserts DeliverooDailyMetrics tenant-scoped", async () => {
    (prisma.driver.findFirst as jest.Mock).mockImplementation(({ where }) =>
      Promise.resolve({ id: `drv-${where.platformDriverId}`, tenantId: where.tenantId }),
    );
    (prisma.deliverooDailyMetrics.upsert as jest.Mock).mockResolvedValue({ id: "ddm-1" });

    const adapter = new DeliverooXlsxAdapter();
    const buf = buildDeliverooXlsxBuffer();
    const result = await adapter.ingestXlsx!("t-1", buf);
    expect(result.rowsIn).toBe(2);
    expect(result.rowsOk).toBe(2);
    expect(result.errors).toEqual([]);
    const calls = (prisma.deliverooDailyMetrics.upsert as jest.Mock).mock.calls;
    for (const [args] of calls) {
      expect(JSON.stringify(args.where)).toContain("t-1");
    }
  });

  test("DeliverooXlsxAdapter idempotent on duplicate import", async () => {
    (prisma.driver.findFirst as jest.Mock).mockImplementation(({ where }) =>
      Promise.resolve({ id: `drv-${where.platformDriverId}`, tenantId: where.tenantId }),
    );
    (prisma.deliverooDailyMetrics.upsert as jest.Mock).mockResolvedValue({ id: "ddm-1" });
    const adapter = new DeliverooXlsxAdapter();
    const buf = buildDeliverooXlsxBuffer();
    await adapter.ingestXlsx!("t-1", buf);
    await adapter.ingestXlsx!("t-1", buf);
    expect(prisma.deliverooDailyMetrics.upsert).toHaveBeenCalledTimes(4);
  });

  test("DeliverooXlsxAdapter rejects malformed headers with explanatory Error", async () => {
    const adapter = new DeliverooXlsxAdapter();
    const bad = buildBadDeliverooXlsx();
    await expect(adapter.ingestXlsx!("t-1", bad)).rejects.toThrow(/missing required columns/);
  });

  test("DeliverooScraperAdapter.isAvailable=false + fetchOrders throws NotAvailable", async () => {
    const adapter = new DeliverooScraperAdapter();
    expect(await adapter.isAvailable("t-1")).toBe(false);
    if (adapter.fetchOrders) {
      await expect(
        adapter.fetchOrders("t-1", { from: new Date(), to: new Date() }),
      ).rejects.toBeInstanceOf(NotAvailable);
    }
  });
});

// RED — turned GREEN by Wave 2b. File contains "DeliverooXlsxAdapter" pin.
