import { Prisma } from "../generated/prisma";
import { getContext } from "./requestContext";

/**
 * Models that carry a tenantId column and therefore must always be
 * filtered by tenantId on read/update/delete. This list is used for
 * both the audit log and the tenant-scope guard.
 */
const TENANT_SCOPED_MODELS = new Set<string>([
  "Driver",
  "Company",
  "Vehicle",
  "Shift",
  "AttendanceRecord",
  "OrderLog",
  "CashRecord",
  "CashTransaction",
  "PendingDuesLedger",
  "DriverRestriction",
  "DriverInventory",
  "LeaveRequest",
  "Ticket",
  "Alert",
  "AiDigest",
  "AuditLog",
  "MaintenanceRecord",
  "VehicleInspection",
  "Device",
  "DeviceCommand",
  "KpiDefinition",
  "KpiRecord",
  "TalabatSession",
  "TalabatDelivery",
  "TalabatViolationEvent",
  "KeetaDailyMetrics",
  "AmericanaOrder",
  "NotificationRule",
  "Notification",
  "PlatformSettings",
  "AiScore",
  // Phase 1 — Agent Spine
  "AgentAction",
  "AgentMemory",
  "PinnedView",
  "PerformanceSnapshot",
  "MetricEvent",
  // Darb 2.0 — delivery fulfillment (Slice A1). WebhookEvent is intentionally
  // excluded: rows are written before the tenant is resolved.
  "Vendor",
  "VendorBranch",
  "DeliveryZone",
  "ZoneSurcharge",
  "FulfillmentSettings",
  "DeliveryOrder",
  "DispatchOffer",
  "WalletAccount",
  "WalletTransaction",
  "WalletEntry",
  "Remittance",
  "WalletReconciliationRun",
  "Incident",
  "FoodicsConnection",
]);

const MUTATION_OPS = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);

const AUDIT_MODEL = "AuditLog";

const TRANSIENT_DB_ERROR_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);
const MAX_DB_RETRIES = 3;
const BASE_DB_RETRY_DELAY_MS = 250;

function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; name?: string; message?: string };
  if (e.code && TRANSIENT_DB_ERROR_CODES.has(e.code)) return true;
  if (e.name === "PrismaClientInitializationError") return true;
  if (typeof e.message === "string" && /can't reach database server|connection terminated|ECONNRESET|ETIMEDOUT/i.test(e.message)) return true;
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasTenantFilter(args: any): boolean {
  const where = args?.where;
  if (!where) return false;
  if (where.tenantId) return true;
  // Nested AND/OR can also scope it — treat as acceptable if any branch names tenantId
  if (Array.isArray(where.AND) && where.AND.some((w: any) => w?.tenantId)) return true;
  if (Array.isArray(where.OR) && where.OR.every((w: any) => w?.tenantId)) return true;
  return false;
}

/**
 * Tenant-scope guard + audit log Prisma client extension.
 *
 * - Logs a warning when a tenant-scoped model is queried without a tenantId
 *   filter. In production this is a warning only (no throw) to avoid mass
 *   outages from a single missed filter; integration tests should treat it
 *   as a failure. Flip TENANT_GUARD_STRICT=true to throw.
 * - Writes an AuditLog row for every mutation on a tenant-scoped model,
 *   pulling userId/tenantId from the AsyncLocalStorage request context.
 *   AuditLog writes themselves are excluded to avoid recursion.
 */
export const prismaExtensions = Prisma.defineExtension((client) => {
  return client.$extends({
    name: "darb-tenant-and-audit",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const isTenantScoped = TENANT_SCOPED_MODELS.has(model);
          const isMutation = MUTATION_OPS.has(operation);

          // ── Tenant guard ────────────────────────────────────────────────
          if (
            isTenantScoped &&
            model !== AUDIT_MODEL &&
            (operation === "findMany" ||
              operation === "findFirst" ||
              operation === "updateMany" ||
              operation === "deleteMany" ||
              operation === "count" ||
              operation === "aggregate" ||
              operation === "groupBy")
          ) {
            if (!hasTenantFilter(args)) {
              const msg = `[tenant-guard] ${model}.${operation} called without tenantId filter`;
              if (process.env.TENANT_GUARD_STRICT === "true") {
                throw new Error(msg);
              } else {
                console.warn(msg);
              }
            }
          }

          let result: unknown;
          let attempt = 0;
          // Retry transient connection errors (Neon cold-start, brief network blips).
          // Why: Neon serverless suspends idle branches; the first request after wake
          // can fail with P1001 before the compute is ready.
          while (true) {
            try {
              result = await query(args);
              break;
            } catch (err) {
              if (attempt >= MAX_DB_RETRIES - 1 || !isTransientDbError(err)) throw err;
              const delay = BASE_DB_RETRY_DELAY_MS * Math.pow(2, attempt);
              console.warn(`[db-retry] ${model}.${operation} transient error, retrying in ${delay}ms`);
              await sleep(delay);
              attempt++;
            }
          }

          // ── Audit log ───────────────────────────────────────────────────
          if (isTenantScoped && isMutation && model !== AUDIT_MODEL) {
            const ctx = getContext();
            const tenantId = ctx?.tenantId || (args as any)?.data?.tenantId;
            if (tenantId) {
              // Fire and forget — never block the main mutation
              (client as any).auditLog
                .create({
                  data: {
                    tenantId,
                    userId: ctx?.userId || null,
                    action: operation.toUpperCase(),
                    entityType: model,
                    entityId:
                      (result as any)?.id ||
                      (args as any)?.where?.id ||
                      null,
                    changes: {
                      args: (args as any) ?? null,
                    } as any,
                    ipAddress: ctx?.ipAddress || null,
                  },
                })
                .catch((e: unknown) => {
                  console.error("[audit-log] failed to write:", e);
                });
            }
          }

          return result;
        },
      },
    },
  });
});
