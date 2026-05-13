// Phase 6 Wave 2b — Deliveroo adapter barrel.
//
// Exports `deliverooTiers` in precedence order Mobile → Ocr → Xlsx → Scraper
// so the CompositeAdapter prefers the live GPS stream when present, then
// request-driven OCR, then XLSX uploads, and finally the Phase 11 scraper
// (currently NotAvailable). Wave 2a's registry update reads this barrel and
// wires it into the DELIVEROO case branch of getAdapter.
//
// REQ-ingest-adapter-layer.

import type { IngestAdapter } from "../types";
import { DeliverooMobileAdapter } from "./mobile";
import { DeliverooOcrAdapter } from "./ocr";
import { DeliverooScraperAdapter } from "./scraper";
import { DeliverooXlsxAdapter } from "./xlsx";

export { DeliverooMobileAdapter } from "./mobile";
export { DeliverooOcrAdapter } from "./ocr";
export { DeliverooScraperAdapter } from "./scraper";
export { DeliverooXlsxAdapter } from "./xlsx";

export const deliverooTiers: readonly IngestAdapter[] = [
  new DeliverooMobileAdapter(),
  new DeliverooOcrAdapter(),
  new DeliverooXlsxAdapter(),
  new DeliverooScraperAdapter(),
];
