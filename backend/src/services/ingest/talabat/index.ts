// Phase 6 Wave 2b — Talabat adapter barrel.
//
// Exports `talabatTiers` in precedence order Mobile → Ocr → Xlsx → Scraper so
// the CompositeAdapter prefers the live GPS stream when present, then
// request-driven OCR, then XLSX uploads, and finally the Phase 11 scraper
// (currently NotAvailable). Wave 2a's registry update reads this barrel and
// wires it into the TALABAT case branch of getAdapter.
//
// REQ-ingest-adapter-layer.

import type { IngestAdapter } from "../types";
import { TalabatMobileAdapter } from "./mobile";
import { TalabatOcrAdapter } from "./ocr";
import { TalabatScraperAdapter } from "./scraper";
import { TalabatXlsxAdapter } from "./xlsx";

export { TalabatMobileAdapter } from "./mobile";
export { TalabatOcrAdapter } from "./ocr";
export { TalabatScraperAdapter } from "./scraper";
export { TalabatXlsxAdapter } from "./xlsx";

export const talabatTiers: readonly IngestAdapter[] = [
  new TalabatMobileAdapter(),
  new TalabatOcrAdapter(),
  new TalabatXlsxAdapter(),
  new TalabatScraperAdapter(),
];
