// Phase 6 Wave 2b — DeliverooMobileAdapter
//
// Reads MobileGPS-sourced records — LocationLog for `isAvailable`, OrderLog
// (`source: AGENT_CAPTURE`, `platform: DELIVEROO`) for `fetchOrders`. Both
// queries JOIN through `Driver.tenantId` (Pitfall 5) so a cross-tenant
// driver row can never surface in another tenant's view.
//
// Mirror of KeetaMobileAdapter / TalabatMobileAdapter — same shape, platform
// string changed to DELIVEROO. Phase 6 scope is fetchOrders only — shifts /
// attendance / cash / violations stay NotAvailable until Phase 9 adds those
// event streams.
//
// REQ-ingest-adapter-layer + Threat T-06-07 (Information disclosure).

import { prisma } from "../../../config";
import {
  DateRange,
  IngestAdapter,
  NormalizedRow,
  NotAvailable,
} from "../types";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const MAX_ORDERS_PER_PULL = 5000;

export class DeliverooMobileAdapter implements IngestAdapter {
  readonly platform = "DELIVEROO" as const;
  readonly source = "MOBILE_GPS" as const;

  /**
   * Mobile-GPS capability gate: at least one LocationLog row joined
   * through a tenant-scoped Driver in the last 24h. LocationLog is not in
   * `TENANT_SCOPED_MODELS`, so the join clause `driver: { tenantId }` is
   * the documented Pitfall 5 enforcement (T-06-07).
   */
  async isAvailable(tenantId: string): Promise<boolean> {
    const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
    const rows = await prisma.locationLog.findMany({
      where: {
        driver: { tenantId },
        capturedAt: { gte: since },
      },
      select: { id: true },
      take: 1,
    });
    return rows.length > 0;
  }

  /**
   * AGENT_CAPTURE-sourced orders for Deliveroo in the requested window.
   * Wave 5 will widen this to the new MOBILE_GPS enum value once the v0.6
   * mobile build promotes everything to it.
   */
  async fetchOrders(
    tenantId: string,
    range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    const orders = await prisma.orderLog.findMany({
      where: {
        tenantId,
        platform: "DELIVEROO",
        source: "AGENT_CAPTURE",
        date: { gte: range.from, lt: range.to },
      },
      orderBy: { date: "asc" },
      take: MAX_ORDERS_PER_PULL,
    });
    return orders.map((row) => ({
      source: this.source,
      tenantId,
      platform: this.platform,
      data: row,
      raw: row.rawData,
    }));
  }

  async fetchShifts(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "Mobile GPS adapter does not produce shifts (Phase 9)",
    );
  }

  async fetchAttendance(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "Mobile GPS adapter does not produce attendance (Phase 9)",
    );
  }

  async fetchCash(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "Mobile GPS adapter does not produce cash records",
    );
  }

  async fetchViolations(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "Mobile GPS adapter does not produce violations (Phase 9)",
    );
  }
}
