// Phase 6 Wave 2b — DeliverooOcrAdapter
//
// Thin façade around the existing /api/deliveroo/metrics/ingest-screenshot
// route (backend/src/routes/deliveroo.ts). OCR is request-driven (mobile-app
// uploads or web-paste): there is no date-range pull surface, so the
// adapter's fetch* methods throw NotAvailable and isAvailable=false.
//
// The route handler itself remains the entry point — this adapter exists so
// the CompositeAdapter's tier list documents OCR as a registered ingest
// source for Deliveroo (REQ-ingest-adapter-layer's intent: enumerate every
// source). Phase 11 cleanup may relocate the route logic behind this adapter
// once xlsxRouteFactory has a sibling ocrRouteFactory.
//
// REQ-ingest-adapter-layer.

import {
  DateRange,
  IngestAdapter,
  NormalizedRow,
  NotAvailable,
} from "../types";

const REQUEST_DRIVEN =
  "Deliveroo OCR is request-driven (POST /api/deliveroo/metrics/ingest-screenshot); no date-range pull";

export class DeliverooOcrAdapter implements IngestAdapter {
  readonly platform = "DELIVEROO" as const;
  readonly source = "OCR_MOBILE" as const;

  async isAvailable(_tenantId: string): Promise<boolean> {
    return false;
  }

  async fetchOrders(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(REQUEST_DRIVEN);
  }

  async fetchShifts(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(REQUEST_DRIVEN);
  }

  async fetchAttendance(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(REQUEST_DRIVEN);
  }

  async fetchCash(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(REQUEST_DRIVEN);
  }

  async fetchViolations(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(REQUEST_DRIVEN);
  }
}
