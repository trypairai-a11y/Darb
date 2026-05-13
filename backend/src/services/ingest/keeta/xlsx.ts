// Phase 6 Wave 2a — KeetaXlsxAdapter
//
// Wraps existing services/keetaXlsxParser.ts::parseKeetaXlsx (Pitfall 1 —
// never reimplement the parser). The upsert shape mirrors the existing
// POST /api/keeta/import handler at routes/keeta.ts:407, so Wave 4 can
// retire that handler in favour of the shared makeXlsxImportRoute factory
// without behaviour drift.
//
// REQ-ingest-adapter-layer + Pitfall 9 (idempotent upserts on
// @@unique([tenantId, driverId, date])).

import { prisma } from "../../../config";
import { KeetaRow, parseKeetaXlsx } from "../../keetaXlsxParser";
import {
  DateRange,
  IngestAdapter,
  NormalizedRow,
  NotAvailable,
  XlsxIngestResult,
} from "../types";

export class KeetaXlsxAdapter implements IngestAdapter {
  readonly platform = "KEETA" as const;
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
      "XLSX adapter is upload-driven; use ingestXlsx instead",
    );
  }

  async ingestXlsx(
    tenantId: string,
    buffer: Buffer,
  ): Promise<XlsxIngestResult> {
    const rows = parseKeetaXlsx(buffer);
    let rowsOk = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const ok = await upsertRow(tenantId, row);
        if (ok) rowsOk++;
        else
          errors.push(
            `Driver not found: ${row.courierPlatformId} (${row.firstName} ${row.lastName})`,
          );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(
          `Row ${row.courierPlatformId ?? "(no id)"}: ${msg}`,
        );
      }
    }

    return { rowsIn: rows.length, rowsOk, errors };
  }
}

/**
 * Resolve driver by `(tenantId, platformDriverId, platform=KEETA)` then
 * upsert the metrics row keyed on the compound unique
 * `tenantId_driverId_date`. Returns false if the driver cannot be
 * resolved inside the tenant — caller records that as an errors[] entry.
 * Cross-tenant drivers (same platformDriverId but different tenant) are
 * rejected silently by the where clause (Pitfall 3 — tenant scope).
 */
async function upsertRow(tenantId: string, row: KeetaRow): Promise<boolean> {
  if (!row.courierPlatformId) return false;

  const driver = await prisma.driver.findFirst({
    where: {
      tenantId,
      platformDriverId: row.courierPlatformId,
      platform: "KEETA",
    },
    select: { id: true },
  });
  if (!driver) return false;

  const dataCreate = {
    tenantId,
    driverId: driver.id,
    date: row.date,
    courierPlatformId: row.courierPlatformId,
    supervisorName: row.supervisorName,
    vehicleType: row.vehicleType,
    onShift: row.onShift,
    validDay: row.validDay,
    onlineTime: row.onlineTime,
    validOnlineTime: row.validOnlineTime,
    peakOnlineMinutes: row.peakOnlineMinutes,
    acceptedTasks: row.acceptedTasks,
    restaurantArrivals: row.restaurantArrivals,
    deliveredTasks: row.deliveredTasks,
    largeOrdersCompleted: row.largeOrdersCompleted,
    cancelledTasks: row.cancelledTasks,
    rejectedTasks: row.rejectedTasks,
    rejectedByCourier: row.rejectedByCourier,
    rejectedAuto: row.rejectedAuto,
    cancellationRate: row.cancellationRate,
    completionRate: row.completionRate,
    onTimeRate: row.onTimeRate,
    largeOrderOnTimeRate: row.largeOrderOnTimeRate,
    avgDeliveryMinutes: row.avgDeliveryMinutes,
    over55minProportion: row.over55minProportion,
    overdueOrders: row.overdueOrders,
    severelyOverdue: row.severelyOverdue,
    source: "XLSX_IMPORT",
  };

  const dataUpdate = {
    courierPlatformId: row.courierPlatformId,
    supervisorName: row.supervisorName,
    vehicleType: row.vehicleType,
    onShift: row.onShift,
    validDay: row.validDay,
    onlineTime: row.onlineTime,
    validOnlineTime: row.validOnlineTime,
    peakOnlineMinutes: row.peakOnlineMinutes,
    acceptedTasks: row.acceptedTasks,
    restaurantArrivals: row.restaurantArrivals,
    deliveredTasks: row.deliveredTasks,
    largeOrdersCompleted: row.largeOrdersCompleted,
    cancelledTasks: row.cancelledTasks,
    rejectedTasks: row.rejectedTasks,
    rejectedByCourier: row.rejectedByCourier,
    rejectedAuto: row.rejectedAuto,
    cancellationRate: row.cancellationRate,
    completionRate: row.completionRate,
    onTimeRate: row.onTimeRate,
    largeOrderOnTimeRate: row.largeOrderOnTimeRate,
    avgDeliveryMinutes: row.avgDeliveryMinutes,
    over55minProportion: row.over55minProportion,
    overdueOrders: row.overdueOrders,
    severelyOverdue: row.severelyOverdue,
    source: "XLSX_IMPORT",
  };

  await prisma.keetaDailyMetrics.upsert({
    where: {
      tenantId_driverId_date: {
        tenantId,
        driverId: driver.id,
        date: row.date,
      },
    },
    create: dataCreate,
    update: dataUpdate,
  });

  return true;
}
