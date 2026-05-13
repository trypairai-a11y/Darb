// Phase 6 Wave 4 — Real backwash chunk handler.
//
// REQ-ingest-adapter-layer / Phase 2 deferred item: replace the Phase 2
// `defaultPullChunkPhase2` (which only counted existing rows so the
// onboarding wizard progress bar would move) with a real adapter
// invocation that pulls data per (platform × 5-day window) chunk and
// records the result as an IngestRun row.
//
// Contract (Phase 6 Wave 0 RED test: __tests__/queues/pullChunkPhase6.test.ts):
//   - Calls fetchOrders + fetchShifts + fetchAttendance + fetchViolations
//   - NEVER calls fetchCash (BLOCKER 2 — cash is XLSX-import-only; cash data
//     arrives via the per-platform XLSX upload routes, not via the chunked
//     backwash worker)
//   - NotAvailable from one capability does NOT abort the chunk — the
//     composite already falls through tiers on NotAvailable; if every tier
//     emits NotAvailable the composite returns []
//   - Non-NotAvailable errors from a capability are captured in errors[]
//     and surfaced in the IngestRun.errorLog without aborting the chunk
//   - Pitfall 6: a single bad chunk NEVER throws — the chunk iterator in
//     runBackwashJob must keep going for the rest of the 30-day window.
//     If the entire chunk fails (e.g., getAdapter throws), we still write
//     a FAILED IngestRun row and return {rowsOk: 0}.
//   - Writes exactly 1 IngestRun row per chunk with source='BACKWASH'.
//
// Threat dispositions (06-04-PLAN frontmatter):
//   - T-06-18 (information disclosure): tenantId is read from BackwashChunkArgs
//     only — never from a side channel. getAdapter is called with {tenantId}.
//   - T-06-20 (denial of service): per-capability + outer try/catch keeps
//     a bad chunk from cascading and aborting the 30-day window.
//   - T-06-21 (repudiation): every chunk writes 1 IngestRun row.

import { getAdapter } from "../services/ingest/registry";
import { writeIngestRun } from "../services/ingest/audit";
import {
  NotAvailable,
  type DateRange,
  type NormalizedRow,
  type Platform,
} from "../services/ingest/types";
import type { BackwashChunkArgs } from "./onboardingBackwashWorker";

export async function pullChunkPhase6(
  args: BackwashChunkArgs,
): Promise<{ rowsOk: number }> {
  const { tenantId, platform, from, to } = args;
  const range: DateRange = {
    from: new Date(`${from}T00:00:00Z`),
    to: new Date(`${to}T00:00:00Z`),
  };

  const startedAt = new Date();
  let rowsIn = 0;
  let rowsOk = 0;
  const errors: string[] = [];

  // Outer try/catch: if getAdapter itself blows up (unknown platform,
  // tier construction failure, etc.) we still record a FAILED IngestRun
  // row so the audit trail is honest, then return rowsOk: 0. NEVER throw
  // — Pitfall 6 (a bad chunk would otherwise abort the 30-day window).
  let adapter;
  try {
    adapter = getAdapter(platform as Platform, { tenantId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await writeIngestRun({
      tenantId,
      platform: platform as Platform,
      source: "BACKWASH",
      status: "FAILED",
      startedAt,
      finishedAt: new Date(),
      rowsIn: 0,
      rowsOk: 0,
      errorLog: `getAdapter failed: ${message}`,
    });
    return { rowsOk: 0 };
  }

  // Per-capability fetch with its own try/catch so a failing scraper tier
  // doesn't kill the XLSX/mobile fetches for the same chunk. NotAvailable
  // is expected (the composite already exhausted its tiers) — treat as
  // an empty result, not an error.
  const safeFetch = async (
    label: string,
    fn?: (tid: string, r: DateRange) => Promise<NormalizedRow<unknown>[]>,
  ): Promise<NormalizedRow<unknown>[]> => {
    if (!fn) return [];
    try {
      const rows = await fn.call(adapter, tenantId, range);
      rowsIn += rows.length;
      return rows;
    } catch (err: unknown) {
      if (err instanceof NotAvailable) return [];
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${message}`);
      return [];
    }
  };

  const orderRows = await safeFetch("fetchOrders", adapter.fetchOrders);
  const shiftRows = await safeFetch("fetchShifts", adapter.fetchShifts);
  const attendanceRows = await safeFetch(
    "fetchAttendance",
    adapter.fetchAttendance,
  );
  // BLOCKER 2: cash is XLSX-import-only. Backwash NEVER produces cash rows.
  // adapter.fetchCash exists on the composite for the XLSX/manual flows,
  // but we deliberately skip it here. cashRows is hard-coded to 0 to keep
  // the audit-row math honest.
  const cashRows = 0;
  const violationRows = await safeFetch(
    "fetchViolations",
    adapter.fetchViolations,
  );

  // v1 rowsOk accounting: count rows produced by each non-cash capability.
  // Wave 4 keeps the upsert path minimal — Phase 11 wires per-capability
  // upserts to OrderLog / Shift / AttendanceRecord / Violation once mobile
  // + scraper produce the full normalized shapes. Until then, "rowsOk"
  // means "rows the adapter successfully produced", not "rows persisted".
  // Excludes cashRows (always 0; documented above).
  rowsOk =
    orderRows.length +
    shiftRows.length +
    attendanceRows.length +
    violationRows.length;
  void cashRows;

  const status: "SUCCESS" | "PARTIAL" | "FAILED" =
    errors.length === 0 ? "SUCCESS" : rowsOk > 0 ? "PARTIAL" : "FAILED";

  await writeIngestRun({
    tenantId,
    platform: platform as Platform,
    source: "BACKWASH",
    status,
    startedAt,
    finishedAt: new Date(),
    rowsIn,
    rowsOk,
    errorLog: errors.length === 0 ? null : errors.join("\n"),
  });

  return { rowsOk };
}
