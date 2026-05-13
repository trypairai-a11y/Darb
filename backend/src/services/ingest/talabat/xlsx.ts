// Phase 6 Wave 2b — TalabatXlsxAdapter
//
// MVP 5-column XLSX import: {date, driver_id, orders_count, online_minutes,
// attendance_status} (orchestrator resolution #2). Header validation runs
// BEFORE any DB write (Pitfall 10 — T-06-08 mitigation). Upsert is idempotent
// against @@unique([tenantId, driverId, shiftDate]) (Pitfall 9 — T-06-09).
// Driver lookup is tenant-scoped (Pitfall 3 — T-06-12). Cross-tenant driver_id
// values fall into errors[] rather than spilling into another tenant's row.
//
// REQ-ingest-adapter-layer.

import * as XLSX from "xlsx";
import { prisma } from "../../../config";
import {
  DateRange,
  IngestAdapter,
  NormalizedRow,
  NotAvailable,
  XlsxIngestResult,
} from "../types";
import {
  parseTalabatRow,
  validateTalabatXlsxHeaders,
} from "./xlsxSchema";

export class TalabatXlsxAdapter implements IngestAdapter {
  readonly platform = "TALABAT" as const;
  readonly source = "XLSX_IMPORT" as const;

  async isAvailable(_tenantId: string): Promise<boolean> {
    // XLSX is user-driven — always available as a fallback tier.
    return true;
  }

  async fetchOrders(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "TalabatXlsxAdapter is upload-driven; use ingestXlsx instead",
    );
  }

  /**
   * MVP shape import. Pitfall 10 — `validateTalabatXlsxHeaders` runs before
   * any prisma call, so a malformed upload produces an exception (caught by
   * xlsxRouteFactory → HTTP 400) and never mutates DB state.
   *
   * Each data row is run through Zod (`parseTalabatRow`) and then upserted
   * against `tenantId_driverId_shiftDate` so re-imports stay idempotent.
   * Rows with no matching driver in this tenant (cross-tenant attempt or
   * missing-driver) are added to errors[] instead of writing.
   */
  async ingestXlsx(
    tenantId: string,
    buffer: Buffer,
  ): Promise<XlsxIngestResult> {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("Talabat XLSX has no sheets");
    }
    const sheet = workbook.Sheets[firstSheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
    });

    if (aoa.length === 0) {
      throw new Error("Talabat XLSX is empty");
    }

    const headers = aoa[0];
    // Pitfall 10 — gate every subsequent operation. Throws on missing columns.
    validateTalabatXlsxHeaders(headers);

    const dataRows = aoa.slice(1).filter((r) =>
      Array.isArray(r) &&
      r.some((cell) => cell !== null && cell !== undefined && cell !== ""),
    );

    let rowsOk = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const rowArr = dataRows[i];
      try {
        const row = parseTalabatRow(headers, rowArr);
        const driver = await prisma.driver.findFirst({
          where: {
            tenantId,
            platformDriverId: row.driverId,
            platform: "TALABAT",
          },
          select: { id: true },
        });
        if (!driver) {
          errors.push(
            `Row ${i + 2}: driver not found for tenant (platformDriverId=${row.driverId})`,
          );
          continue;
        }

        await prisma.talabatDailyMetrics.upsert({
          where: {
            tenantId_driverId_shiftDate: {
              tenantId,
              driverId: driver.id,
              shiftDate: row.date,
            },
          },
          create: {
            tenantId,
            driverId: driver.id,
            shiftDate: row.date,
            ordersCompleted: row.ordersCount,
            onlineHours: row.onlineMinutes / 60,
            source: "MANUAL_UPLOAD",
            // attendance_status column not modelled on TalabatDailyMetrics
            // (Phase 11 follow-up: extend schema or route to AttendanceRecord).
          },
          update: {
            ordersCompleted: row.ordersCount,
            onlineHours: row.onlineMinutes / 60,
          },
        });
        rowsOk++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${i + 2}: ${msg}`);
      }
    }

    return { rowsIn: dataRows.length, rowsOk, errors };
  }
}
