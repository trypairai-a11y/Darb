// Phase 6 Wave 2b — Talabat XLSX schema (header validator + row parser).
//
// MVP 5-column shape pinned by orchestrator resolution #2 and Wave 0 fixtures
// (backend/src/__tests__/services/ingest/fixtures/talabatSample.xlsx.ts):
//   date, driver_id, orders_count, online_minutes, attendance_status
//
// Pitfall 10 — validateTalabatXlsxHeaders runs BEFORE any DB write. The
// XlsxAdapter throws this error before reaching driver.findFirst / upsert
// so a malformed upload returns HTTP 400 from xlsxRouteFactory without any
// partial DB writes.
//
// parseTalabatRow runs Zod parse on each row — failed rows are caught by the
// caller and added to errors[] (Pitfall 11 — never silently coerce).

import { z } from "zod";
import { parseLocalDate } from "../normalize";

export const REQUIRED_TALABAT_COLUMNS = [
  "date",
  "driver_id",
  "orders_count",
  "online_minutes",
  "attendance_status",
] as const;

export type TalabatXlsxColumn = (typeof REQUIRED_TALABAT_COLUMNS)[number];

/**
 * Compares the uploaded XLSX header row against the MVP required columns.
 * Throws on any missing column — caller (TalabatXlsxAdapter.ingestXlsx)
 * does not reach the DB write loop. Pitfall 10 — header validation gates
 * the entire ingest before any tenant data is mutated.
 */
export function validateTalabatXlsxHeaders(headerRow: unknown[]): void {
  const present = new Set(
    headerRow
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim().toLowerCase()),
  );
  const missing = REQUIRED_TALABAT_COLUMNS.filter((col) => !present.has(col));
  if (missing.length > 0) {
    throw new Error(
      `Talabat XLSX missing required columns: ${missing.join(", ")}`,
    );
  }
}

const TalabatRowZ = z.object({
  date: z.unknown(),
  driver_id: z.string().min(1),
  orders_count: z.coerce.number().int().nonnegative(),
  online_minutes: z.coerce.number().nonnegative(),
  attendance_status: z.string().min(1),
});

export interface TalabatXlsxRow {
  date: Date;
  driverId: string;
  ordersCount: number;
  onlineMinutes: number;
  attendanceStatus: string;
}

/**
 * Parse one XLSX data row into a typed TalabatXlsxRow.
 *
 * `headers` is the header row (already validated by validateTalabatXlsxHeaders).
 * `rowArr` is the corresponding cell array. Cells are looked up by name so
 * column order doesn't matter — the partner XLSX may reshuffle columns
 * across exports.
 *
 * Throws on Zod failure or date-parse failure; the adapter catches and
 * records to errors[] (Pitfall 11 — surface row failures rather than silently
 * dropping them).
 */
export function parseTalabatRow(
  headers: unknown[],
  rowArr: unknown[],
): TalabatXlsxRow {
  const map: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (typeof h === "string") {
      map[h.trim().toLowerCase()] = rowArr[i];
    }
  }
  const parsed = TalabatRowZ.parse({
    date: map.date,
    driver_id: map.driver_id,
    orders_count: map.orders_count,
    online_minutes: map.online_minutes,
    attendance_status: map.attendance_status,
  });
  return {
    date: parseLocalDate(parsed.date),
    driverId: parsed.driver_id,
    ordersCount: parsed.orders_count,
    onlineMinutes: parsed.online_minutes,
    attendanceStatus: parsed.attendance_status,
  };
}
