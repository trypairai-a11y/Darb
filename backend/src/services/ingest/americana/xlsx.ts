// Phase 6 Wave 2a — AmericanaXlsxAdapter
//
// Thin wrapper around services/americanaDailyParser.ts::parseAmericanaDailyXlsx
// (Pitfall 1 — never reimplement the parser). Stages an
// AmericanaDailyIngestion row then delegates to
// queues/americanaIngestWorker.ts::processIngestionRows so that the existing
// chain / store / attendance / violation side-effects fire unchanged (T-06-23
// — Repudiation mitigation: every wrap goes through the same audit pipeline).
//
// REQ-ingest-adapter-layer.

import { prisma } from "../../../config";
import { parseAmericanaDailyXlsx } from "../../americanaDailyParser";
import { processIngestionRows } from "../../../queues/americanaIngestWorker";
import {
  DateRange,
  IngestAdapter,
  NormalizedRow,
  NotAvailable,
  XlsxIngestResult,
} from "../types";

export class AmericanaXlsxAdapter implements IngestAdapter {
  readonly platform = "AMERICANA" as const;
  readonly source = "XLSX_IMPORT" as const;

  async isAvailable(_tenantId: string): Promise<boolean> {
    return true;
  }

  async fetchOrders(
    _tenantId: string,
    _range: DateRange,
  ): Promise<NormalizedRow<unknown>[]> {
    throw new NotAvailable(
      "Americana XLSX adapter is upload-driven; use ingestXlsx instead",
    );
  }

  /**
   * Stage rows → AmericanaDailyIngestion → delegate to processIngestionRows
   * (which is the existing approve-flow handler — preserves the attendance
   * upsert + violation scan side-effects per RESEARCH.md "Critical refactor
   * verification steps" #2).
   *
   * Returns {rowsIn, rowsOk, errors} matching the IngestAdapter contract.
   * The "errors" array surfaces the parser-side warnings (zero data rows,
   * cross-tenant driver) plus the worker-side row-merge errors.
   */
  async ingestXlsx(
    tenantId: string,
    buffer: Buffer,
  ): Promise<XlsxIngestResult> {
    const { rows, ingestDate } = parseAmericanaDailyXlsx(buffer);
    if (rows.length === 0) {
      return {
        rowsIn: 0,
        rowsOk: 0,
        errors: ["Americana XLSX: no data rows parsed"],
      };
    }

    // Stage → delegate. Wrapped in try/catch so a degraded-mock environment
    // (or a transient DB hiccup) still returns the canonical
    // {rowsIn, rowsOk, errors} shape with the failure surfaced in errors[]
    // — the caller decides whether to retry. Real production runs go
    // through the full audit pipeline (T-06-23 mitigation).
    try {
      const staged = await prisma.americanaDailyIngestion.create({
        data: {
          tenantId,
          source: "MANUAL_UPLOAD",
          rawFileUrl: "ingest-adapter://buffer", // no on-disk file for adapter calls
          ingestDate: ingestDate ?? new Date(),
          status: "PENDING_REVIEW",
          parsedRows: rows as unknown as object,
          rowCount: rows.length,
        },
      });

      const merge = await processIngestionRows(staged.id);

      return {
        rowsIn: rows.length,
        rowsOk: merge.merged,
        errors: merge.errors,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        rowsIn: rows.length,
        rowsOk: 0,
        errors: [`Americana ingestion staging failed: ${msg}`],
      };
    }
  }
}
