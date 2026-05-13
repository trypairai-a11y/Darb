// Phase 6 Wave 2b — TalabatScraperAdapter (Phase 11 deferral)
//
// Talabat has no public ops portal yet (orchestrator resolution: scraper
// deferred to Phase 11 — REQ-ingest-partner-api-conversations). This adapter
// is a deliberate NotAvailable stub: it occupies the precedence slot so the
// CompositeAdapter chain remains explicit, but every fetch* throws
// NotAvailable and isAvailable returns false. The CompositeAdapter then
// falls through to the next tier (Xlsx).
//
// Threat T-06-11 — Spoofing surface is intentionally zero because no
// credentials are loaded and no portal is contacted. Phase 11 will introduce
// real scraping behind the partner-API conversations track.
//
// REQ-ingest-adapter-layer + CON-scraper-replaceable.

import {
  DateRange,
  IngestAdapter,
  NormalizedRow,
  NotAvailable,
} from "../types";

const DEFERRED =
  "Talabat scraper deferred to Phase 11 (REQ-ingest-partner-api-conversations)";

export class TalabatScraperAdapter implements IngestAdapter {
  readonly platform = "TALABAT" as const;
  readonly source = "PORTAL_SCRAPER" as const;

  async isAvailable(_tenantId: string): Promise<boolean> {
    return false;
  }

  async fetchOrders(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(DEFERRED);
  }

  async fetchShifts(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(DEFERRED);
  }

  async fetchAttendance(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(DEFERRED);
  }

  async fetchCash(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(DEFERRED);
  }

  async fetchViolations(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(DEFERRED);
  }
}
