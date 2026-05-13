// Phase 6 Wave 2a — Americana adapter barrel.
//
// Exports `americanaTiers` in precedence order Email → Xlsx. No Mobile
// tier (Americana has no GPS rider app) and no Scraper tier (Americana
// HQ pushes feeds via inbox; there is no partner portal to scrape).
//
// REQ-ingest-adapter-layer.

import type { IngestAdapter } from "../types";
import { AmericanaEmailAdapter } from "./email";
import { AmericanaXlsxAdapter } from "./xlsx";

export { AmericanaEmailAdapter } from "./email";
export { AmericanaXlsxAdapter } from "./xlsx";

export const americanaTiers: readonly IngestAdapter[] = [
  new AmericanaEmailAdapter(),
  new AmericanaXlsxAdapter(),
];
