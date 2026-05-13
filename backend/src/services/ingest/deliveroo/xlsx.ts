// Phase 6 Wave 2b — DeliverooXlsxAdapter
//
// MVP 5-column XLSX import: {date, driver_id, orders_count, online_minutes,
// attendance_status} (orchestrator resolution #2). Header validation runs
// BEFORE any DB write (Pitfall 10 — T-06-08 mitigation). Upsert is idempotent
// against @@unique([tenantId, driverId, shiftDate]) (Pitfall 9 — T-06-09).
// Driver lookup is tenant-scoped (Pitfall 3 — T-06-12). Cross-tenant driver_id
// values fall into errors[] rather than spilling into another tenant's row.
//
// DeliverooDailyMetrics requires codCollectedKwd / tipsKwd Decimals and a
// 9-element hourlyBuckets Json — these are NOT in the MVP shape, so v1 sets
// them to 0 / [0,...,0] (Phase 11 polish will populate real values when the
// partner XLSX shape is confirmed — see schema.prisma:1331).
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
  parseDeliverooRow,
  validateDeliverooXlsxHeaders,
} from "./xlsxSchema";

const PLACEHOLDER_HOURLY_BUCKETS = [0, 0, 0, 0, 0, 0, 0, 0, 0];

export class DeliverooXlsxAdapter implements IngestAdapter {
  readonly platform = "DELIVEROO" as const;
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
      "DeliverooXlsxAdapter is upload-driven; use ingestXlsx instead",
    );
  }

  /**
   * MVP shape import. Pitfall 10 — `validateDeliverooXlsxHeaders` runs
   * before any prisma call, so a malformed upload produces an exception
   * (caught by xlsxRouteFactory → HTTP 400) and never mutates DB state.
   *
   * Each data row is run through Zod (`parseDeliverooRow`) and then
   * upserted against `tenantId_driverId_shiftDate` so re-imports stay
   * idempotent. Required-but-not-in-MVP Decimal fields default to 0 and
   * hourlyBuckets defaults to [0×9] in v1.
   */
  async ingestXlsx(
    tenantId: string,
    buffer: Buffer,
  ): Promise<XlsxIngestResult> {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("Deliveroo XLSX has no sheets");
    }
    const sheet = workbook.Sheets[firstSheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
    });

    if (aoa.length === 0) {
      throw new Error("Deliveroo XLSX is empty");
    }

    const headers = aoa[0];
    // Pitfall 10 — gate every subsequent operation. Throws on missing columns.
    validateDeliverooXlsxHeaders(headers);

    const dataRows = aoa.slice(1).filter((r) =>
      Array.isArray(r) &&
      r.some((cell) => cell !== null && cell !== undefined && cell !== ""),
    );

    let rowsOk = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const rowArr = dataRows[i];
      try {
        const row = parseDeliverooRow(headers, rowArr);
        const driver = await prisma.driver.findFirst({
          where: {
            tenantId,
            platformDriverId: row.driverId,
            platform: "DELIVEROO",
          },
          select: { id: true },
        });
        if (!driver) {
          errors.push(
            `Row ${i + 2}: driver not found for tenant (platformDriverId=${row.driverId})`,
          );
          continue;
        }

        await prisma.deliverooDailyMetrics.upsert({
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
            deliveriesCount: row.ordersCount,
            // v1 placeholders — Phase 11 polish populates from real partner XLSX.
            codCollectedKwd: 0,
            tipsKwd: 0,
            unassignedCount: 0,
            hourlyBuckets: PLACEHOLDER_HOURLY_BUCKETS,
            source: "MANUAL_UPLOAD",
            // attendance_status column not modelled on DeliverooDailyMetrics
            // (Phase 11 follow-up: extend schema or route to AttendanceRecord).
          },
          update: {
            deliveriesCount: row.ordersCount,
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
