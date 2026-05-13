// Phase 6 Wave 2b — Deliveroo XLSX schema (header validator + row parser).
//
// MVP 5-column shape pinned by orchestrator resolution #2 and Wave 0 fixtures
// (backend/src/__tests__/services/ingest/fixtures/deliverooSample.xlsx.ts):
//   date, driver_id, orders_count, online_minutes, attendance_status
//
// Mirror of talabat/xlsxSchema.ts — same MVP shape, name prefix changed.
//
// Pitfall 10 — validateDeliverooXlsxHeaders runs BEFORE any DB write so a
// malformed upload returns HTTP 400 from xlsxRouteFactory without any
// partial DB writes (T-06-08 mitigation).
//
// parseDeliverooRow runs Zod parse on each row — failed rows are caught by
// the caller and added to errors[] (Pitfall 11 — never silently coerce).

import { z } from "zod";
import { parseLocalDate } from "../normalize";

export const REQUIRED_DELIVEROO_COLUMNS = [
  "date",
  "driver_id",
  "orders_count",
  "online_minutes",
  "attendance_status",
] as const;

export type DeliverooXlsxColumn = (typeof REQUIRED_DELIVEROO_COLUMNS)[number];

/**
 * Compares the uploaded XLSX header row against the MVP required columns.
 * Throws on any missing column — caller (DeliverooXlsxAdapter.ingestXlsx)
 * does not reach the DB write loop. Pitfall 10 — header validation gates
 * the entire ingest before any tenant data is mutated.
 */
export function validateDeliverooXlsxHeaders(headerRow: unknown[]): void {
  const present = new Set(
    headerRow
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim().toLowerCase()),
  );
  const missing = REQUIRED_DELIVEROO_COLUMNS.filter((col) => !present.has(col));
  if (missing.length > 0) {
    throw new Error(
      `Deliveroo XLSX missing required columns: ${missing.join(", ")}`,
    );
  }
}

const DeliverooRowZ = z.object({
  date: z.unknown(),
  driver_id: z.string().min(1),
  orders_count: z.coerce.number().int().nonnegative(),
  online_minutes: z.coerce.number().nonnegative(),
  attendance_status: z.string().min(1),
});

export interface DeliverooXlsxRow {
  date: Date;
  driverId: string;
  ordersCount: number;
  onlineMinutes: number;
  attendanceStatus: string;
}

/**
 * Parse one XLSX data row into a typed DeliverooXlsxRow.
 *
 * `headers` is the header row (already validated by
 * validateDeliverooXlsxHeaders). `rowArr` is the corresponding cell array.
 * Cells are looked up by name so column order doesn't matter — the partner
 * XLSX may reshuffle columns across exports.
 *
 * Throws on Zod failure or date-parse failure; the adapter catches and
 * records to errors[] (Pitfall 11 — surface row failures rather than
 * silently dropping them).
 */
export function parseDeliverooRow(
  headers: unknown[],
  rowArr: unknown[],
): DeliverooXlsxRow {
  const map: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (typeof h === "string") {
      map[h.trim().toLowerCase()] = rowArr[i];
    }
  }
  const parsed = DeliverooRowZ.parse({
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
