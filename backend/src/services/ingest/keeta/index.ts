// Phase 6 Wave 2a — Keeta adapter barrel.
//
// Exports `keetaTiers` in precedence order Mobile → Scraper → Xlsx so the
// CompositeAdapter prefers the live GPS stream when present, falls through
// to the portal scraper when creds are configured, then back-fills any
// remaining day from XLSX uploads.
//
// REQ-ingest-adapter-layer.

import type { IngestAdapter } from "../types";
import { KeetaMobileAdapter } from "./mobile";
import { KeetaScraperAdapter } from "./scraper";
import { KeetaXlsxAdapter } from "./xlsx";

export { KeetaMobileAdapter } from "./mobile";
export { KeetaScraperAdapter } from "./scraper";
export { KeetaXlsxAdapter } from "./xlsx";

export const keetaTiers: readonly IngestAdapter[] = [
  new KeetaMobileAdapter(),
  new KeetaScraperAdapter(),
  new KeetaXlsxAdapter(),
];
